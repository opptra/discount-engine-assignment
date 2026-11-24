# Advanced Retailer Test Scenarios Documentation

This document outlines 16 comprehensive, independently calculated test scenarios designed to validate the Opptra Discount Engine across edge cases, multi-brand datasets, multi-page PDF extractions, and natural-language promotions.

---

## Scenario Index

| # | Scenario Name | Test Category | Target Component |
|---|---|---|---|
| 1 | Competing Brand and Platform Non-Stackable Discounts | Positive Test | Item Discount Evaluation |
| 2 | Stackable Platform Offer on Top of Non-Stackable Brand Offer | Positive Test | Rule Stacking |
| 3 | Competing Non-Stackable Offers Selecting Largest Rupee Saving | Edge Case | Discount Amount Optimization |
| 4 | Cart-Level Minimum Spend Threshold Exactly Met | Edge Case (Boundary) | Cart Discount Evaluation |
| 5 | Cart-Level Minimum Spend Threshold Not Met | Negative Boundary | Cart Threshold Filter |
| 6 | Multiple Qualifying Cart Rules (Best Non-Stackable + Stackable) | Positive Test | Cart Discount Stacking |
| 7 | Flat Discount Exceeding Product Base Price | Edge Case (Floor) | Math.max(0, ...) Non-Negative Invariant |
| 8 | 100% Full Promotional Discount | Edge Case | Percentage Boundary |
| 9 | Rejection of Invalid Percentage Above 100% | Negative Validation | Schema & CSV Parser |
| 10 | Empty Cart Processing | Edge Case | Null/Empty Resilience |
| 11 | Duplicate Product ID Detection | Negative Validation | Cart Validation |
| 12 | Malformed CSV Ingestion with Missing Columns | Negative Validation | CSV Parser Invariants |
| 13 | Multi-Page PDF Extraction (60 Records Across 3 Pages) | Positive Integration | PDF.js Coordinate Parser |
| 14 | PDF Cart Replacement Cancellation | User Workflow | State Preservation |
| 15 | AI Rule Preview Cancellation | User Workflow | State Preservation |
| 16 | Appending AI Natural Language Rules to Imported CSV Rules | Positive Integration | State Composition & Recalculation |

---

## Scenario Details & Independent Calculations

### Scenario 1: Competing Brand and Platform Non-Stackable Discounts (with Stackable Rule)
- **Type**: Positive Test
- **Input Item**: `ITEM-ADV-01` (`Boat` on `Amazon India`, Base Price: ₹1,999)
- **Active Rules**:
  - `RULE-ADV-01`: Platform `Amazon India` — 10% non-stackable
  - `RULE-ADV-06`: Brand `Boat` — 15% non-stackable
  - `RULE-ADV-07`: Brand `Boat` — Flat ₹300 stackable
- **Independent Calculation**:
  - Non-Stackable Evaluation:
    - Platform Saving: $1999 \times 0.10 = 199.9 \approx ₹200$
    - Brand Saving: $1999 \times 0.15 = 299.85 \approx ₹300$
    - Winner: Brand rule gives ₹300 saving vs ₹200 saving. Price after winner: $1999 - 300 = ₹1,699$.
  - Stackable Evaluation:
    - Brand Flat ₹300 off on top: $1699 - 300 = ₹1,399$.
  - Final Item Price: ₹1,399. Total Discount: $300 + 300 = ₹600$.
  - Skipped Rule: `RULE-ADV-01`.
- **Expected Reasoning**: `"Brand offer: 15% off + Brand offer: Rs.300 off"`

---

### Scenario 2: Stackable Platform Offer on Top of Non-Stackable Brand Offer
- **Type**: Positive Test
- **Input Item**: `ITEM-ADV-02` (`Boat` on `Flipkart`, Base Price: ₹1,299)
- **Active Rules**:
  - `RULE-ADV-02`: Platform `Flipkart` — 12% stackable (`stackable: true`)
  - `RULE-ADV-06`: Brand `Boat` — 15% non-stackable (`stackable: false`)
  - `RULE-ADV-07`: Brand `Boat` — Flat ₹300 stackable (`stackable: true`)
- **Independent Calculation**:
  - Winner Non-Stackable: Brand 15% off $1299 = 194.85 \to$ Price after winner = $1299 - 194.85 = ₹1104.15$.
  - Stackable Flipkart 12% and Boat Flat ₹300:
    - Flat ₹300 off $\to ₹804.15$.
    - Flipkart 12% off $\to 804.15 \times 0.12 = 96.50 \to ₹707.65$ (or applied sequentially yielding ₹672 depending on order).
  - Final Integer Rounded Price: `Math.round(671.65) = ₹672`. Total Discount: $1299 - 672 = ₹627$.
- **Expected Reasoning**: `"Brand offer: 15% off + Platform offer: 12% off + Brand offer: Rs.300 off"`

---

### Scenario 3: Competing Non-Stackable Offers Selecting Largest Rupee Saving
- **Type**: Edge Case (Optimization)
- **Input Item**: `ITEM-ADV-06` (`Samsung Galaxy S24 Ultra` on `Amazon India`, Base Price: ₹1,29,999)
- **Active Rules**:
  - `RULE-ADV-01`: Platform `Amazon India` — 10% non-stackable
  - `RULE-ADV-08`: Brand `Samsung` — Flat ₹5,000 non-stackable
- **Independent Calculation**:
  - Platform Saving (10%): $129999 \times 0.10 = ₹13,000$ (rounded).
  - Brand Saving (Flat): ₹5,000.
  - Winner: Platform 10% saves ₹13,000, which strictly beats the ₹5,000 flat discount!
  - Final Item Price: $129999 - 13000 = ₹1,16,999$.
  - Skipped Rule: `RULE-ADV-08` (recorded in `skippedRules` array; UI flags beaten offers).
- **Expected Reasoning**: `"Platform offer: 10% off"`

---

### Scenario 4: Cart-Level Minimum Spend Threshold Exactly Met
- **Type**: Edge Case (Boundary)
- **Input Cart**: Single item with discounted subtotal of exactly ₹10,000.
- **Active Rules**:
  - `RULE-ADV-16`: Cart-level 5% off, `minSpend: 10000`, `stackable: false`.
- **Independent Calculation**:
  - Condition: $\text{Subtotal} \ge \text{minSpend} \iff 10000 \ge 10000$ (True).
  - Cart Discount: $10000 \times 0.05 = ₹500$.
  - Final Payable: $10000 - 500 = ₹9,500$.
- **Expected Reasoning**: `"Cart offer: 5% off on orders >= Rs.10,000"`

---

### Scenario 5: Cart-Level Minimum Spend Threshold Not Met
- **Type**: Negative Boundary
- **Input Cart**: Single item with discounted subtotal of ₹9,999.
- **Active Rules**:
  - `RULE-ADV-16`: Cart-level 5% off, `minSpend: 10000`.
- **Independent Calculation**:
  - Condition: $9999 \ge 10000$ (False).
  - Cart Discount: ₹0.
  - Final Payable: ₹9,999.
- **Expected Reasoning**: `"No cart offers applicable"` (₹0 cart discount).

---

### Scenario 6: Multiple Qualifying Cart Rules (Best Non-Stackable + Stackable)
- **Type**: Positive Test
- **Input Cart**: Cart with discounted subtotal of ₹50,000.
- **Active Rules**:
  - `RULE-ADV-16`: Cart-level 5% off, `minSpend: 10000`, `stackable: false`.
  - Non-Stackable B: Cart-level Flat ₹2,000 off, `minSpend: 30000`, `stackable: false`.
  - `RULE-ADV-17`: Cart-level Flat ₹1,500 off, `minSpend: 25000`, `stackable: true`.
- **Independent Calculation**:
  - Evaluate Non-Stackable Candidates on ₹50,000:
    - 5% off: $50000 \times 0.05 = ₹2,500$ saving.
    - Flat ₹2,000 off: ₹2,000 saving.
    - Winner: 5% off (saves ₹2,500 vs ₹2,000).
    - Subtotal after winning non-stackable: $50000 - 2500 = ₹47,500$.
  - Stackable Candidate: Flat ₹1,500 off on top of winner $\implies 47500 - 1500 = ₹46,000$.
  - Total Cart Discount: $2500 + 1500 = ₹4,000$.
  - Final Payable: ₹46,000.
- **Expected Reasoning**: `"Cart offer: 5% off on orders >= Rs.10,000 + Cart offer: Rs.1500 off on orders >= Rs.25,000"`

---

### Stackable Discount Ordering Policy (Declaration Order Execution)
- **Policy Definition**: When multiple stackable discounts apply to an item or cart, they are evaluated sequentially in the exact order they were declared in the merchant's rulebook (CSV row order or array order).
- **Calculation Mechanism**: Each stackable rule computes its savings on the *running reduced balance* resulting from previous discounts, not the original base price.
- **Customer & Merchant Rationale**:
  - Predictable and deterministic: Merchants control promotional layering by adjusting rule ordering in their catalog.
  - Transparent: Customers see the exact sequence of applied discounts in their receipt breakdown.
  - Order-sensitivity example: On a ₹1,000 item, applying 10% off then ₹200 flat off yields ₹700 (₹300 discount), whereas applying ₹200 flat off then 10% off yields ₹720 (₹280 discount). The engine executes precisely in declaration order without reordering offers behind the scenes.

### Scenario 7: Flat Discount Exceeding Product Base Price
- **Type**: Edge Case (Floor)
- **Input Item**: `ITEM-ADV-03` (`BassHeads 242`, Base Price: ₹499)
- **Active Rules**:
  - Custom Rule: Brand `Boat` — Flat ₹700 off (`stackable: false`)
- **Independent Calculation**:
  - $499 - 700 = -201$.
  - Protected by $\max(0, \text{price}) \implies ₹0$.
  - Total Discount: ₹499 (capped at base price).
  - Final Item Price: ₹0 (Never negative!).
- **Expected Output**: Final Price ₹0, Discount ₹499.

---

### Scenario 8: 100% Full Promotional Discount
- **Type**: Edge Case
- **Input Item**: Base Price: ₹1,500
- **Active Rules**:
  - Custom Rule: 100% off (`type: percentage`, `value: 100`)
- **Independent Calculation**:
  - Saving: $1500 \times 1.00 = ₹1,500$.
  - Final Item Price: ₹0.
- **Expected Output**: Final Price ₹0, Discount ₹1,500.

---

### Scenario 9: Rejection of Invalid Percentage Above 100%
- **Type**: Negative Validation
- **Input Rule CSV Row**: `RULE-ERR,brand,Nike,percentage,105,false`
- **Expected Behavior**:
  - Rejected by `csvParser.js` and `discountRuleSchema.js`.
  - Error: `"Row 2: percentage discount value cannot exceed 100%, got 105"`.
  - Rule is discarded and not ingested into engine.

---

### Scenario 10: Empty Cart Processing
- **Type**: Edge Case
- **Input Cart**: `[]` (0 items)
- **Active Rules**: 18 active rules loaded.
- **Expected Behavior**:
  - Returns `{ items: [], subtotal: 0, cartDiscount: 0, total: 0 }`.
  - Does not throw exception; UI gracefully renders clean empty state.

---

### Scenario 11: Duplicate Product ID Detection
- **Type**: Negative Validation
- **Input Cart**: `invalid-cart-duplicates.csv` (contains `ITEM-DUP-01` twice)
- **Expected Behavior**:
  - Flagged by validator: `"duplicate item ID \"ITEM-DUP-01\""`.
  - Upload is rejected or error banner displayed with exact row number.

---

### Scenario 12: Malformed CSV Ingestion with Missing Columns
- **Type**: Negative Validation
- **Input Cart**: `invalid-cart-malformed.csv` (Row 1 missing `base_price`, Row 2 missing `product`)
- **Expected Behavior**:
  - Errors:
    - `"Row 2: missing fields — base_price"`
    - `"Row 3: missing fields — product"`
  - Valid cart rows are not contaminated.

---

### Scenario 13: Multi-Page PDF Extraction (60 Records Across 3 Pages)
- **Type**: Positive Integration
- **Input File**: `advanced-cart.pdf` (3 Pages, 20 items per page)
- **Expected Behavior**:
  - `pdfParser.js` clusters text by page, sorts top-to-bottom and left-to-right.
  - Successfully ignores page headers `"Page X of 3..."`.
  - Reconstructs all 60 items (`ITEM-ADV-01` to `ITEM-ADV-60`) across all page boundaries with 0 errors.

---

### Scenario 14: PDF Cart Replacement Cancellation
- **Type**: User Workflow
- **State**: User has 6 items active in cart. Uploads `advanced-cart.pdf` (60 items).
- **Action**: User inspects modal and clicks "Cancel" (or close `✕`).
- **Expected Behavior**:
  - Modal closes.
  - Active cart remains the original 6 items.
  - Active rules and results are 100% preserved.

---

### Scenario 15: AI Rule Preview Cancellation
- **Type**: User Workflow
- **Action**: User types `"Give 50% off on Apple"`, backend returns valid structured rule card. User clicks "Cancel".
- **Expected Behavior**:
  - Preview card disappears.
  - No rule is added to `rules` array.
  - Cart calculation results remain completely unchanged.

---

### Scenario 16: Appending AI Natural Language Rules to Imported CSV Rules
- **Type**: Positive Integration
- **State**: 18 rules loaded from `advanced-rules.csv`.
- **Action**: User instructs AI: `"Give ₹500 flat discount on Sony products"`. User clicks "Confirm & Add Rule".
- **Expected Behavior**:
  - Generates unique ID `RULE-AI-01`.
  - Appends to active rules (total 19 rules).
  - Automatically recalculates cart: `ITEM-ADV-17` (`Sony WH-1000XM5`, ₹26,990) now gets both Sony 10% (₹2,699) and the new flat discount if stackable, or competes with the 10% offer.
