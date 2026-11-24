# Opptra Discount Engine — Base Implementation

A deterministic promotional pricing and checkout audit engine for multi-brand e-commerce retailers and marketplace sellers.

### The Retailer Business Problem

Modern multi-brand retailers juggle simultaneous promotional campaigns across competing channels:
- **Brand-Funded Offers**: Manufacturer discounts (e.g., flat ₹150 off Natura Casa).
- **Platform Promotions**: Marketplace-wide campaigns (e.g., 15% off Amazon India, 10% off Flipkart).
- **Cart Spend Incentives**: Order-level threshold incentives (e.g., 10% off carts over ₹4,000).
- **Stacking Policies**: Rules determining whether offers combine or remain mutually exclusive.

Conventional checkouts often suffer from rule conflicts, margin leakage, and opaque coupon selection. This engine provides:
1. **Deterministic Pricing**: Line-item prices are strictly governed by transparent business rules, not arbitrary iteration order.
2. **Audit Explanations**: Human-readable reasoning explaining winning offers, stacked discounts, and rejected rules.
3. **Margin Protection**: Order-level thresholds evaluate against the post-discount subtotal, preventing premature qualification.
4. **Guaranteed Floors**: Item prices and cart totals never drop below ₹0.
5. **Governed AI Rule Authoring**: Natural-language prompts are strictly validated against domain schemas and require explicit operator confirmation before entering the engine.

> **Scope Note**: This is an FDE prototype and evaluation tool built to validate and audit promotional rules. It is not an enterprise ERP, billing ledger, or persistent tax settlement platform.

---

## Running locally

The application consists of two cooperating tiers:
- **Client-Side Core (Browser)**: Deterministic discount engine, CSV parser, and client-side PDF table extractor run 100% in-browser. Cart data is processed locally with zero external network transmission.
- **Backend API Gateway (Express)**: Secure server-side proxy for natural-language rule interpretation (`POST /api/rules/interpret`), protecting Gemini/OpenAI API keys from exposure in client bundles.

### Prerequisites & Setup

Requires Node.js (v18+) and npm (v9+):

```bash
npm install
```

Configure environment variables in a `.env` file in the project root:

```bash
PORT=3001
LLM_PROVIDER=gemini                     # "gemini" (default) or "openai"
GEMINI_API_KEY=your_gemini_api_key_here # Server-side only; never committed to git
# OPENAI_API_KEY=your_openai_api_key_here
# LLM_MODEL=gemini-2.5-flash
# FRONTEND_ORIGIN=http://localhost:3001 # Optional production CORS whitelist
```

### Operating Modes

1. **Full-Stack Development (Recommended)**:
   ```bash
   npm run server   # Terminal 1: Express API Gateway (port 3001)
   npm run dev      # Terminal 2: Vite interactive frontend (port 5173)
   ```
   Open **http://localhost:5173**. Vite proxies `/api/*` requests to port 3001.

2. **Client-Only / Offline Mode**:
   Running `npm run dev` alone supports all CSV/PDF cart and rule operations and automatic recalculations. Only the AI Natural Language Rule Creator requires the backend server.

### Health Verification & Diagnostics

- **Health Check**: `curl http://localhost:3001/api/health` returns `{"status":"ok","service":"discount-engine-backend","provider":"gemini","hasKey":true}`.
- **Data Ingestion Errors**: Displayed in red banners with exact row numbers and field issues.
- **AI Clarification**: Displayed in amber banners when an instruction is ambiguous (e.g., missing discount value).
- **Backend / Rate Limit Errors**: Displayed in red banners on network failure, 10s timeout, or provider 429 rate limits.
- **Automated Tests**: Run `npm test` to execute all 104 native automated tests across 20 suites.

---

## Deploying

The application uses a **single-service production architecture**: Express serves both the pre-compiled React bundle (`dist/`) and `/api/*` routes from a single port and origin, eliminating cross-origin CORS barriers.

### Production Build & Run

```bash
npm run build    # Compiles production frontend into dist/
npm run server   # Starts unified production server on PORT (default 3001)
```

### Architecture & Operational Tradeoffs

- **Architecture**: `Browser -> Express (Port 3001) -> Static Files (dist/) & API Gateway (/api/rules/interpret) -> LLM Provider`.
- **In-Memory State**: Active carts, rules, and results reside in client React memory. Refreshing resets the session; no database, session cookie, or Redis cache is implemented.
- **Engine Decoupling**: The deterministic discount engine operates with zero external dependencies. If the LLM provider experiences downtime, checkout calculations and CSV/PDF uploads continue uninterrupted.
- **Hosting Targets**:
  - *Full-Stack (Render, Railway, Fly.io, AWS App Runner)*: Recommended. Runs `npm run build && npm run server` as a single Node.js service.
  - *Static Hosting (Vercel, Netlify)*: Can host `dist/` statically for core calculations, but requires a separately deployed backend for AI rule creation.

**Live Deployment URL**: `[Deployment URL: Pending / To be configured upon cloud platform deployment]`

---

## How to use

### Step 1: Load Promotion Rules
- **CSV Upload**: Upload a standard `rules.csv` or `advanced-rules.csv`.
- **AI Rule Creator**: Enter plain-English offers (e.g., *"Give 15% off on all Amazon India products"*, *"Flat ₹250 discount on Natura Casa products and allow it to stack"*, or *"Apply 10% off on cart totals above ₹4,000"*).
  - The LLM parses the prompt into candidate JSON and the schema validator enforces invariants.
  - **Explicit Confirmation**: The proposed rule is displayed in an amber card. The operator must click **Confirm & Add Rule** before it enters the calculation pipeline. Ambiguous prompts trigger clarification questions.

### Step 2: Load the Retailer Cart
- **CSV Upload**: Upload `cart.csv` containing item SKU, product, brand, platform, and base price.
- **PDF Ingestion Pipeline**: Upload a digital PDF invoice or pick-list (up to 10 MB).
  1. *Extraction & Parsing*: Text lines are extracted client-side via `pdfjs-dist` and tokenized into tabular columns.
  2. *Auto-ID Generation*: For standard 4-column layouts (`Product | Brand | Platform | Base Price`), collision-safe IDs (`ITEM-01`, `ITEM-02`) are auto-generated.
  3. *Preview & Confirmation*: Extracted items are displayed in an interactive modal. The operator must click **Confirm & Replace Cart** (cancelling preserves the active cart).

### Step 3: Automatic Recalculation
Discounts recalculate reactively and synchronously whenever cart items or active rules change (via CSV upload, PDF confirmation, or AI rule confirmation). No manual calculate trigger is required.

### Step 4: Audit Checkout Results
- **Summary KPIs**: Overview of gross cart total, aggregate savings, and final net customer payable.
- **Item-Level Breakdown**: Displays base price, applied rules, rupee savings, net price, and human-readable reasoning explaining winning offers or multi-rule stack sequences.
- **Order-Level Summary**: Displays post-item-discount subtotal, cart threshold qualification, and applied cart discounts.

---

## Project structure

```
discount-engine-assignment/
├── src/
│   ├── engine/
│   │   ├── discountEngine.js       ← Deterministic pricing engine (item & cart level algorithms)
│   │   ├── csvParser.js            ← CSV parser, field normalizer, and all-or-nothing validator
│   │   └── pdfParser.js            ← Client-side PDF extractor, table tokenizer, and auto-ID generator
│   ├── components/
│   │   ├── CsvUploader.jsx         ← CSV drag-and-drop upload component
│   │   ├── PdfUploader.jsx         ← PDF upload button with extraction progress indicator
│   │   ├── CartPreviewModal.jsx    ← Interactive modal for reviewing extracted PDF cart items
│   │   ├── RuleCreator.jsx         ← Natural-language prompt input, clarification, & confirmation UI
│   │   ├── DataTable.jsx           ← Searchable, paginated, responsive checkout results table
│   │   └── ErrorBanner.jsx         ← Dismissible error alert component
│   ├── App.jsx                     ← Application orchestrator, reactive state, & recalculation manager
│   └── main.jsx                    ← React client entry point
├── server/
│   ├── index.js                    ← Express 5 production server, SPA static host, & CORS manager
│   ├── routes/
│   │   └── ruleRoutes.js           ← Router for /api/rules/interpret endpoint
│   ├── services/
│   │   └── llmRuleParser.js        ← LLM integration service (Gemini / OpenAI API client & error mapping)
│   └── validators/
│       └── discountRuleSchema.js   ← Gatekeeper enforcing domain invariants on candidate rules
├── sample-data/
│   ├── rules.csv                   ← Baseline sample discount rules (3 rules)
│   ├── cart.csv                    ← Baseline sample cart items (6 items)
│   ├── cart.pdf                    ← Baseline sample digital cart PDF
│   └── advanced-retailer/          ← Realistic enterprise test dataset (60 items, 18 rules, PDF, fixtures)
├── test/                           ← Native Node.js test suite (104 automated tests across 20 suites)
├── package.json
└── vite.config.js
```

### Separation of Responsibilities

1. **Ingestion (`csvParser.js`, `pdfParser.js`)**: Converts untrusted raw text, CSVs, and PDFs into structured records.
2. **Validation (`discountRuleSchema.js`, `csvParser.js`)**: Enforces strict domain invariants before data reaches the engine. Invalid rows abort import.
3. **AI Interpretation (`llmRuleParser.js`, `ruleRoutes.js`)**: Translates natural language into candidate JSON; never calculates prices.
4. **Calculation Core (`discountEngine.js`)**: Pure mathematical engine with zero external or UI dependencies.
5. **Presentation & Audit (`App.jsx`, `DataTable.jsx`, `CartPreviewModal.jsx`)**: Coordinates reactive state and displays line-item reasoning.

---

## CSV formats

### 1. Rules Specification (`rules.csv`)

| Column | Type | Required | Accepted Values | Validation Behavior |
| :--- | :--- | :---: | :--- | :--- |
| `rule_id` | String | **Yes** | Unique string (e.g. `RULE-01`) | Cannot be empty or whitespace-only. |
| `scope` | String | **Yes** | `brand`, `platform`, `cart` | Case-insensitive. Unsupported scopes rejected. |
| `applies_to` | String | **Yes** | Brand, platform, or `cart` | Must match target name. For `cart` scope, defaults to `cart`. |
| `type` | String | **Yes** | `percentage`, `flat` | Calculation mode. |
| `value` | Number | **Yes** | Positive number (`> 0`) | Percentage must be `1–100`. Flat amounts must be `> 0`. Trailing characters (e.g. `15%`, `15abc`) rejected. |
| `stackable`| Boolean | **Yes** | `true`, `false`, `1`, `0`, `yes`, `no` | Strict boolean check. Ambiguous strings (e.g. `banana`) rejected. |
| `min_spend`| Number | Optional| Positive number or `0` | Minimum post-discount cart subtotal required. Defaults to `0`. |

### 2. Cart Specification (`cart.csv`)

| Column | Type | Required | Accepted Values | Validation Behavior |
| :--- | :--- | :---: | :--- | :--- |
| `item_id` | String | **Yes** | Unique SKU (e.g. `ITEM-01`) | Must be unique across all rows. Duplicates trigger rejection. |
| `product` | String | **Yes** | Product name | Cannot be empty or whitespace-only. |
| `brand` | String | **Yes** | Brand name | Matched against `brand` scope rules. |
| `platform` | String | **Yes** | Platform name | Matched against `platform` scope rules. |
| `base_price`| Number | **Yes** | Positive number (`> 0`) | Must be strictly positive. Supports `₹1,299`, `Rs. 1299`, or `1299`. |

### 3. PDF Cart Layouts
Supports both the assignment's 4-column layout (`Product | Brand | Platform | Base Price` with collision-safe auto-generated IDs `ITEM-01`, `ITEM-02`) and 5-column layout (`Item ID | Product | ...`).

### All-or-Nothing Import Policy
If any row in a CSV fails validation (e.g., negative price, duplicate SKU, invalid boolean), **the entire file is rejected (`data: []`)**, preserving the active cart/rules and displaying row-numbered errors.

---

## Discount logic

### A. Item-Level Promotion Resolution

1. **Rule Matching**: Filters active rules matching the item's brand or platform.
2. **Non-Stackable Competition (Maximum Rupee Savings)**: Evaluates all qualifying non-stackable rules. The offer providing the **largest actual rupee saving** is applied.
   - *Tie-Breaking*: Declaration order in `rules.csv` breaks equal-savings ties.
3. **Sequential Stackable Execution**: Matching stackable rules apply sequentially on top of the running reduced price.
4. **Floor**: Item final price is capped at ₹0 (`Math.max(0, price)`).

#### Worked Example: Item-Level Competition
- **Item**: Cushion Cover (`ITEM-01`), Base Price: ₹1,299, Brand: Natura Casa, Platform: Amazon India.
- **Eligible Rules**:
  - `RULE-01` (Platform, Amazon India): 15% non-stackable $\to \text{round}(1299 \times 0.15) = ₹195$ savings.
  - `RULE-02` (Brand, Natura Casa): Flat ₹150 non-stackable $\to ₹150$ savings.
- **Resolution**: ₹195 > ₹150 $\implies$ `RULE-01` wins. Final Price = ₹1,104. Reasoning: `"Platform offer: 15% off (beats Rs.150)"`.

### B. Stackable Promotion Sequencing & Declaration Order

Stackable rules execute sequentially against the running reduced balance. Declaration order is an intentional deterministic contract:

- **Base Price**: ₹1,000 with Rule A (10% off, stackable) and Rule B (Flat ₹200 off, stackable).
  - *Order A then B*: $1000 - 100 = 900$; $900 - 200 = \mathbf{₹700}$ (Total Savings: ₹300).
  - *Order B then A*: $1000 - 200 = 800$; $800 - 80 = \mathbf{₹720}$ (Total Savings: ₹280).

### C. Cart-Level Promotions

1. Evaluated against the **discounted subtotal** after item-level discounts: $\sum \text{Final Item Prices}$.
2. Requires $\text{Discounted Subtotal} \ge \text{min\_spend}$ to qualify, preventing qualification on pre-discount amounts.
3. Best non-stackable cart rule wins; qualifying stackable cart rules apply subsequently. Payable amount floored at ₹0.

#### Worked Example: Cart Spend Threshold
- Discounted Subtotal: ₹3,947 (Base ₹4,647 minus ₹700 item discounts).
- Cart Rule: 10% off over ₹4,000 threshold (`min_spend = 4000`).
- Outcome: ₹3,947 < ₹4,000 threshold $\implies$ Ineligible. Final Payable = ₹3,947.

### D. Rounding Policy & Items Without Offers

- **Rounding**: Discounts round to the nearest whole rupee (`Math.round`) at each step. (Enterprise production would migrate to integer paise).
- **No Offers**: Returns original base price, discount ₹0, and reasoning `"No offers available"`.

---

## Expected results for the sample data

### Baseline Item-Level Results

| Item ID | Product | Brand | Platform | Base Price | Final Price | Total Discount | Applied Rules | Reasoning |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **ITEM-01** | Cushion Cover | Natura Casa | Amazon India | ₹1,299 | **₹1,104** | ₹195 | `RULE-01` | Platform offer: 15% off (beats Rs.150) |
| **ITEM-02** | Bed Sheet Set | Natura Casa | Flipkart | ₹849 | **₹629** | ₹220 | `RULE-02`, `RULE-03` | Brand offer: Rs.150 off + Platform 10% |
| **ITEM-03** | Wall Shelf | LivSpace Pro | Amazon India | ₹599 | **₹509** | ₹90 | `RULE-01` | Platform offer: 15% off |
| **ITEM-04** | Ceramic Vase | LivSpace Pro | Noon | ₹2,499 | **₹2,499** | ₹0 | *None* | No offers available |
| **ITEM-05** | Cutting Board | Nordic Basics | Amazon India | ₹449 | **₹382** | ₹67 | `RULE-01` | Platform offer: 15% off |
| **ITEM-06** | Desk Organiser | Nordic Basics | Flipkart | ₹899 | **₹809** | ₹90 | `RULE-03` | Platform offer: 10% off |

### Baseline Cart Summary

| Metric | Amount | Description |
| :--- | :---: | :--- |
| **Original Cart Total** | **₹6,594** | Gross sum of all 6 line items |
| **Total Line-Item Discounts** | **₹662** | Sum of discounts from matching brand and platform rules |
| **Discounted Cart Subtotal** | **₹5,932** | Order subtotal after applying line-item promotions |
| **Cart-Level Discounts** | **₹0** | Baseline `rules.csv` contains only item-level rules |
| **Final Net Payable Amount** | **₹5,932** | Total net amount payable by the customer |

> **Extended Dataset**: An expanded 60-item realistic retailer dataset with 18 rules is available in `sample-data/advanced-retailer/` (see `advanced-test-scenarios.md`).

### Operational Limitations & Production Roadmap

1. **In-Memory State**: Data resides in client state; page reloads reset the session. Multi-session quoting would require PostgreSQL/Redis persistence.
2. **Text-Based PDF Extraction**: Digital PDFs with selectable text are supported; scanned/image PDFs require OCR preprocessing.
3. **Authentication & Multi-Tenancy**: Single-operator evaluation tool without multi-tenant RBAC.
4. **Financial Precision**: Uses rupee-level rounding. Production banking systems should adopt integer paise.
5. **Decoupled AI Resilience**: Natural-language rule generation requires an external LLM key, but the core calculation engine operates 100% offline.
