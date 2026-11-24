/**
 * test/reliabilityImprovements.test.js
 *
 * Automated tests for Phase 4.2 targeted reliability improvements:
 *  - PART 1: Duplicate Item ID detection in CSV parsing.
 *  - PART 2: Stackable discount ordering and declaration-order policy.
 *  - PART 4: Password-protected PDF exception handling.
 *  - PART 5: Production CORS origin whitelisting & same-origin protection.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseCartCSV, parseRulesCSV } from '../src/engine/csvParser.js'
import { applyDiscounts } from '../src/engine/discountEngine.js'
import { parseCartPDF, parseCartLines } from '../src/engine/pdfParser.js'
import { getCorsOptions } from '../server/index.js'
import { validateRuleCandidate, validateLlmResponse } from '../server/validators/discountRuleSchema.js'

describe('Phase 4.2 — PART 1: Duplicate Item ID Detection in CSV', () => {
  it('rejects a CSV containing two rows with the exact same item ID', () => {
    const csv = `item_id,product,brand,platform,base_price
ITEM-01,Headphones,Boat,Amazon India,1999
ITEM-01,Duplicate Headphones,Boat,Amazon India,1999`

    const { data, errors } = parseCartCSV(csv)
    // All-or-nothing policy: errors cause entire import to return empty data
    assert.equal(data.length, 0)
    assert.equal(errors.length, 1)
    assert.equal(errors[0], 'Row 3: duplicate item ID "ITEM-01"')
  })

  it('rejects a CSV containing multiple duplicate item IDs across different rows', () => {
    const csv = `item_id,product,brand,platform,base_price
SKU-A,Product A1,Boat,Amazon India,1000
SKU-B,Product B1,Samsung,Flipkart,2000
SKU-A,Product A2,Boat,Amazon India,1000
SKU-C,Product C1,Apple,Croma,3000
SKU-B,Product B2,Samsung,Flipkart,2000`

    const { data, errors } = parseCartCSV(csv)
    // All-or-nothing policy: errors cause entire import to return empty data
    assert.equal(data.length, 0)
    assert.equal(errors.length, 2)
    assert.equal(errors[0], 'Row 4: duplicate item ID "SKU-A"')
    assert.equal(errors[1], 'Row 6: duplicate item ID "SKU-B"')
  })

  it('treats item IDs as case-sensitive SKU identifiers', () => {
    // Exact matching preserves strict SKU identity (e.g. "ITEM-01" vs "item-01")
    const csv = `item_id,product,brand,platform,base_price
ITEM-01,Uppercase ID,Boat,Amazon India,1000
item-01,Lowercase ID,Boat,Amazon India,1000`

    const { data, errors } = parseCartCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 2)
    assert.equal(data[0].itemId, 'ITEM-01')
    assert.equal(data[1].itemId, 'item-01')
  })

  it('successfully parses a valid CSV with all unique item IDs', () => {
    const csv = `item_id,product,brand,platform,base_price
SKU-101,Smartwatch,Boat,Flipkart,1500
SKU-102,Earphones,Sony,Amazon India,2500
SKU-103,Soundbar,Philips,Croma,4000`

    const { data, errors } = parseCartCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 3)
  })

  it('rejects the negative test fixture invalid-cart-duplicates.csv with duplicate ID error', () => {
    const fixturePath = path.resolve('sample-data/advanced-retailer/negative-fixtures/invalid-cart-duplicates.csv')
    const csv = fs.readFileSync(fixturePath, 'utf8')
    const { data, errors } = parseCartCSV(csv)

    assert.ok(errors.length >= 1)
    assert.match(errors[0], /duplicate item ID/i)
  })
})

describe('Phase 4.2 — PART 2: Stackable Discount Declaration Order Execution Policy', () => {
  const item = {
    itemId: 'TEST-01',
    product: 'Test Item',
    brand: 'Generic',
    platform: 'GenericPlatform',
    basePrice: 1000,
  }

  it('evaluates percentage followed by flat discount in declaration order', () => {
    // 1000 - 10% (100) = 900. Then 900 - 200 = 700. Total discount = 300
    const rules = [
      { ruleId: 'R-PCT', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 10, stackable: true },
      { ruleId: 'R-FLAT', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 200, stackable: true },
    ]
    const res = applyDiscounts(item, rules)
    assert.equal(res.finalPrice, 700)
    assert.equal(res.totalDiscount, 300)
    assert.deepEqual(res.appliedRules, ['R-PCT', 'R-FLAT'])
  })

  it('evaluates flat followed by percentage discount in declaration order', () => {
    // 1000 - 200 = 800. Then 800 - 10% (80) = 720. Total discount = 280
    const rules = [
      { ruleId: 'R-FLAT', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 200, stackable: true },
      { ruleId: 'R-PCT', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 10, stackable: true },
    ]
    const res = applyDiscounts(item, rules)
    assert.equal(res.finalPrice, 720)
    assert.equal(res.totalDiscount, 280)
    assert.deepEqual(res.appliedRules, ['R-FLAT', 'R-PCT'])
  })

  it('proves that declaration order produces distinct final amounts (order sensitivity)', () => {
    const rulesOrderA = [
      { ruleId: 'R-PCT', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 10, stackable: true },
      { ruleId: 'R-FLAT', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 200, stackable: true },
    ]
    const rulesOrderB = [
      { ruleId: 'R-FLAT', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 200, stackable: true },
      { ruleId: 'R-PCT', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 10, stackable: true },
    ]

    const resA = applyDiscounts(item, rulesOrderA)
    const resB = applyDiscounts(item, rulesOrderB)

    assert.notEqual(resA.finalPrice, resB.finalPrice)
    assert.equal(resA.finalPrice, 700)
    assert.equal(resB.finalPrice, 720)
  })

  it('evaluates two percentage discounts sequentially on the running reduced balance', () => {
    // 1000 - 10% (100) = 900. Then 900 - 20% (180) = 720. Total discount = 280
    const rules = [
      { ruleId: 'R-PCT1', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 10, stackable: true },
      { ruleId: 'R-PCT2', scope: 'brand', appliesTo: 'Generic', type: 'percentage', value: 20, stackable: true },
    ]
    const res = applyDiscounts(item, rules)
    assert.equal(res.finalPrice, 720)
    assert.equal(res.totalDiscount, 280)
    assert.deepEqual(res.appliedRules, ['R-PCT1', 'R-PCT2'])
  })

  it('evaluates two flat discounts sequentially', () => {
    // 1000 - 150 = 850. Then 850 - 250 = 600. Total discount = 400
    const rules = [
      { ruleId: 'R-FLAT1', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 150, stackable: true },
      { ruleId: 'R-FLAT2', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 250, stackable: true },
    ]
    const res = applyDiscounts(item, rules)
    assert.equal(res.finalPrice, 600)
    assert.equal(res.totalDiscount, 400)
    assert.deepEqual(res.appliedRules, ['R-FLAT1', 'R-FLAT2'])
  })

  it('verifies that the engine does not reorder stackable rules', () => {
    const rules = [
      { ruleId: 'RULE-Z', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 50, stackable: true },
      { ruleId: 'RULE-A', scope: 'brand', appliesTo: 'Generic', type: 'flat', value: 100, stackable: true },
    ]
    const res = applyDiscounts(item, rules)
    // Execution must preserve declaration order: RULE-Z then RULE-A
    assert.deepEqual(res.appliedRules, ['RULE-Z', 'RULE-A'])
    assert.match(res.reasoning, /Rs\.50 off \+ Brand offer: Rs\.100 off/)
  })
})

describe('Phase 4.2 — PART 4: Password-Protected PDF Error-Path Testing', () => {
  it('correctly catches PasswordException and returns actionable error message', async () => {
    const fixturePath = path.resolve('sample-data/advanced-retailer/negative-fixtures/encrypted-password-protected.pdf')
    const pdfBuffer = fs.readFileSync(fixturePath)

    const result = await parseCartPDF(pdfBuffer)
    assert.equal(result.data.length, 0)
    assert.equal(result.errors.length, 1)
    assert.equal(
      result.errors[0],
      'This PDF is password-protected. Please upload an unprotected PDF.'
    )
  })

  it('verifies that a password error does not mutate or overwrite the active cart', async () => {
    // Simulating frontend state workflow:
    // Existing cart has 2 valid items
    const existingCart = [
      { itemId: 'ACTIVE-1', product: 'P1', brand: 'B', platform: 'PL', basePrice: 1000 },
      { itemId: 'ACTIVE-2', product: 'P2', brand: 'B', platform: 'PL', basePrice: 2000 },
    ]

    const fixturePath = path.resolve('sample-data/advanced-retailer/negative-fixtures/encrypted-password-protected.pdf')
    const pdfBuffer = fs.readFileSync(fixturePath)
    const result = await parseCartPDF(pdfBuffer)

    let activeCart = [...existingCart]
    let activeErrors = []

    // Handlers match App.jsx behavior
    if (result.data.length === 0 && result.errors.length > 0) {
      activeErrors = result.errors
    } else {
      activeCart = result.data
    }

    // Existing active cart remains 100% intact
    assert.equal(activeCart.length, 2)
    assert.equal(activeCart[0].itemId, 'ACTIVE-1')
    assert.equal(activeErrors[0], 'This PDF is password-protected. Please upload an unprotected PDF.')
  })
})

describe('Phase 4.2 — PART 5: Production CORS Configuration', () => {
  it('allows all origins in development mode (NODE_ENV !== "production")', () => {
    const originalEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'development'
      const corsOptions = getCorsOptions()
      assert.equal(corsOptions.origin, true)
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  it('whitelists FRONTEND_ORIGIN in production mode', (t, done) => {
    const originalEnv = process.env.NODE_ENV
    const originalOrigin = process.env.FRONTEND_ORIGIN
    try {
      process.env.NODE_ENV = 'production'
      process.env.FRONTEND_ORIGIN = 'https://portal.retailer.com, https://admin.retailer.com'

      const corsOptions = getCorsOptions()
      assert.equal(typeof corsOptions.origin, 'function')

      // Test 1: Whitelisted origin
      corsOptions.origin('https://portal.retailer.com', (err, allowed) => {
        assert.equal(err, null)
        assert.equal(allowed, true)
      })

      // Test 2: Same-origin / no Origin header (curl, server-to-server)
      corsOptions.origin(undefined, (err, allowed) => {
        assert.equal(err, null)
        assert.equal(allowed, true)
      })

      // Test 3: Unapproved origin rejected
      corsOptions.origin('https://malicious-site.com', (err, allowed) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /CORS policy rejection/)
        done()
      })
    } finally {
      process.env.NODE_ENV = originalEnv
      process.env.FRONTEND_ORIGIN = originalOrigin
    }
  })

  it('enforces default-deny when FRONTEND_ORIGIN is unset in production mode', (t, done) => {
    const originalEnv = process.env.NODE_ENV
    const originalOrigin = process.env.FRONTEND_ORIGIN
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.FRONTEND_ORIGIN

      const corsOptions = getCorsOptions()
      assert.equal(typeof corsOptions.origin, 'function')

      // Non-empty origin must be rejected under default-deny
      corsOptions.origin('https://any-external-domain.com', (err, allowed) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /CORS policy rejection/)
        done()
      })
    } finally {
      process.env.NODE_ENV = originalEnv
      process.env.FRONTEND_ORIGIN = originalOrigin
    }
  })
})

describe('Dobby Audit — Endpoint Sanitization, Invariant Governance & Rate Limiting', () => {
  it('returns clean generic error message when provider fails without leaking raw error bodies', async () => {
    const mockCall = async () => {
      throw new Error('LLM provider service error (502). Please try again later.')
    }
    const { interpretDiscountInstruction } = await import('../server/services/llmRuleParser.js')
    const res = await interpretDiscountInstruction('10% off Natura Casa', { mockCall })
    assert.equal(res.status, 'error')
    assert.equal(res.message, 'LLM provider service error (502). Please try again later.')
    assert.ok(!res.message.includes('<!DOCTYPE'))
    assert.ok(!res.message.includes('stack'))
  })

  it('strictly rejects LLM response with status !== "success" even if rule object is present', () => {
    const payload = {
      status: 'error',
      rule: {
        scope: 'brand',
        appliesTo: 'Sony',
        type: 'percentage',
        value: 15,
        stackable: false,
      },
      message: 'Failed to process prompt',
    }
    const res = validateLlmResponse(payload)
    assert.equal(res.status, 'error')
    assert.equal(res.rule, undefined)
  })
})

describe('Phase 1 — Regression: PDF 4-Column and 5-Column Parsing Compatibility', () => {
  it('parses standard assignment 4-column layout and generates collision-safe item IDs', () => {
    const rawLines = [
      'Product\tBrand\tPlatform\tBase Price',
      'Cushion Cover\tNatura Casa\tAmazon India\t1299',
      'Ceramic Vase\tLivSpace Pro\tFlipkart\t849',
      'Table Lamp\tNordic Basics\tAmazon India\t599',
    ]

    const result = parseCartLines(rawLines)
    assert.equal(result.errors.length, 0)
    assert.equal(result.data.length, 3)
    assert.equal(result.data[0].itemId, 'ITEM-01')
    assert.equal(result.data[0].product, 'Cushion Cover')
    assert.equal(result.data[0].brand, 'Natura Casa')
    assert.equal(result.data[0].platform, 'Amazon India')
    assert.equal(result.data[0].basePrice, 1299)
    assert.equal(result.data[1].itemId, 'ITEM-02')
    assert.equal(result.data[2].itemId, 'ITEM-03')
  })

  it('preserves existing item IDs when 5-column layout is provided', () => {
    const rawLines = [
      'Item ID | Product | Brand | Platform | Base Price',
      'PROD-99 | Running Shoes | Nike | Myntra | 4999',
      'PROD-100 | Training Shoes | Adidas | Amazon India | 3999',
    ]

    const result = parseCartLines(rawLines)
    assert.equal(result.errors.length, 0)
    assert.equal(result.data.length, 2)
    assert.equal(result.data[0].itemId, 'PROD-99')
    assert.equal(result.data[1].itemId, 'PROD-100')
  })

  it('avoids colliding with pre-existing IDs when auto-generating 4-column IDs', () => {
    const rawLines = [
      'ITEM-01\tEarphones\tBoat\tAmazon India\t1499', // 5-column row with ITEM-01
      'Wireless Mouse\tLogitech\tAmazon India\t999',  // 4-column row requiring auto ID
    ]

    const result = parseCartLines(rawLines)
    assert.equal(result.errors.length, 0)
    assert.equal(result.data.length, 2)
    assert.equal(result.data[0].itemId, 'ITEM-01')
    assert.equal(result.data[1].itemId, 'ITEM-02') // Automatically bumped past collision!
  })
})

describe('Phase 2 — Regression: Strict CSV Validation', () => {
  it('rejects invalid boolean values like "banana" or "maybe" for stackable', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable
RULE-01,brand,Boat,flat,100,banana`

    const { data, errors } = parseRulesCSV(csv)
    assert.equal(data.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /stackable must be a valid boolean/i)
  })

  it('accepts valid boolean synonyms (true, 1, yes, false, 0, no)', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable
R1,brand,Boat,flat,100,true
R2,brand,Boat,flat,100,1
R3,brand,Boat,flat,100,yes
R4,brand,Boat,flat,100,false
R5,brand,Boat,flat,100,0
R6,brand,Boat,flat,100,no`

    const { data, errors } = parseRulesCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 6)
    assert.equal(data[0].stackable, true)
    assert.equal(data[1].stackable, true)
    assert.equal(data[2].stackable, true)
    assert.equal(data[3].stackable, false)
    assert.equal(data[4].stackable, false)
    assert.equal(data[5].stackable, false)
  })

  it('rejects invalid numeric values with trailing characters like "15abc" or "10%"', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable
RULE-01,brand,Boat,percentage,15abc,false
RULE-02,brand,Boat,percentage,10%,false`

    const { data, errors } = parseRulesCSV(csv)
    assert.equal(data.length, 0)
    assert.equal(errors.length, 2)
    assert.match(errors[0], /value must be a valid positive number/)
    assert.match(errors[1], /value must be a valid positive number/)
  })

  it('rejects rows with whitespace-only required fields', () => {
    const csv = `item_id,product,brand,platform,base_price
ITEM-01,   ,Boat,Amazon India,1500`

    const { data, errors } = parseCartCSV(csv)
    assert.equal(data.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /missing fields — product/)
  })
})

describe('Phase 3 — Regression: All-or-Nothing CSV Import Policy', () => {
  it('returns empty data array if any row fails validation', () => {
    const csv = `item_id,product,brand,platform,base_price
ITEM-01,Valid Product 1,Boat,Amazon India,1000
ITEM-02,Valid Product 2,Boat,Amazon India,-500
ITEM-03,Valid Product 3,Boat,Amazon India,2000`

    const { data, errors } = parseCartCSV(csv)
    assert.equal(data.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /base_price must be a positive number/i)
  })
})

describe('Phase 5 — Regression: Strengthened LLM Rule Schema Validation', () => {
  it('rejects candidate rules containing unexpected extra fields', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: 'Sony',
      type: 'percentage',
      value: 15,
      stackable: false,
      calculatedDiscount: 200, // unexpected injected field
      price: 1500,             // unexpected injected field
    }

    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /Unexpected field\(s\) in rule candidate: "calculatedDiscount", "price"/)
  })

  it('rejects inconsistent item-level rules having minSpend > 0', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: 'Sony',
      type: 'percentage',
      value: 15,
      stackable: false,
      minSpend: 5000, // minSpend is only valid for cart-level rules
    }

    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /Minimum spend condition \(minSpend\) is only supported for cart-level rules/)
  })

  it('rejects cart-level rule targeting a specific brand or platform', () => {
    const candidate = {
      scope: 'cart',
      appliesTo: 'Apple', // contradictory: cart rule with specific brand
      type: 'flat',
      value: 500,
      stackable: false,
      minSpend: 5000,
    }

    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /Cart-level rule cannot target a specific brand or platform/)
  })

  it('rejects LLM responses with unexpected top-level fields', () => {
    const payload = {
      status: 'success',
      rule: {
        scope: 'brand',
        appliesTo: 'Sony',
        type: 'percentage',
        value: 15,
        stackable: false,
      },
      message: '15% off Sony',
      extraField: 'unauthorized', // unexpected top-level field
    }

    const res = validateLlmResponse(payload)
    assert.equal(res.status, 'error')
    assert.match(res.message, /unexpected top-level field\(s\) "extraField"/)
  })
})
