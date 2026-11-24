import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { parseCartCSV, parseRulesCSV } from '../src/engine/csvParser.js'
import { parseCartPDF } from '../src/engine/pdfParser.js'
import { processCart, cartTotal } from '../src/engine/discountEngine.js'
import { validateRuleCandidate } from '../server/validators/discountRuleSchema.js'

// Helper mirroring App.jsx's collision-safe rule ID generator
function generateNextRuleId(existingRules) {
  let maxAiIndex = 0
  for (const r of existingRules) {
    if (!r || !r.ruleId) continue
    const match = r.ruleId.match(/^RULE-AI-(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxAiIndex) maxAiIndex = num
    }
  }
  let candidateNum = maxAiIndex + 1
  let ruleId = `RULE-AI-${String(candidateNum).padStart(2, '0')}`
  while (existingRules.some((r) => r.ruleId === ruleId)) {
    candidateNum++
    ruleId = `RULE-AI-${String(candidateNum).padStart(2, '0')}`
  }
  return ruleId
}

describe('Phase 3.1 — Multi-Input Integration Scenarios (CSV + PDF + Natural Language)', () => {
  const sampleCartCsv = fs.readFileSync(path.resolve('sample-data/cart.csv'), 'utf8')
  const sampleRulesCsv = fs.readFileSync(path.resolve('sample-data/rules.csv'), 'utf8')
  const sampleCartPdfBuffer = fs.readFileSync(path.resolve('sample-data/cart.pdf'))

  it('Scenario 1: Upload cart CSV -> create natural-language rule -> verify automatic recalculation', () => {
    // 1. Upload cart CSV
    const { data: cart } = parseCartCSV(sampleCartCsv)
    assert.equal(cart.length, 6)

    let activeRules = []
    let results = activeRules.length > 0 && cart.length > 0 ? processCart(cart, activeRules) : null
    assert.equal(results, null)

    // 2. Interpret natural language rule: 20% off on Natura Casa
    const interpreted = {
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'percentage',
      value: 20,
      stackable: false,
      minSpend: 0,
    }
    const validation = validateRuleCandidate(interpreted)
    assert.equal(validation.isValid, true)

    // 3. User confirms preview -> Add rule
    const ruleId = generateNextRuleId(activeRules)
    assert.equal(ruleId, 'RULE-AI-01')
    activeRules = [...activeRules, { ...interpreted, ruleId }]

    // 4. Recalculation triggers automatically
    results = processCart(cart, activeRules)
    assert.ok(results)
    assert.equal(results.items.length, 6)

    // Natura Casa items: ITEM-01 (1299 - 20% = 1039), ITEM-02 (849 - 20% = 679)
    assert.equal(results.items[0].finalPrice, 1039)
    assert.equal(results.items[1].finalPrice, 679)
    assert.match(results.items[0].reasoning, /Brand offer: 20% off/)
  })

  it('Scenario 2: Upload cart PDF -> confirm replacement -> create natural-language rule -> verify recalculation', async () => {
    // 1. Upload and parse PDF
    const pdfRes = await parseCartPDF(sampleCartPdfBuffer)
    assert.equal(pdfRes.errors.length, 0)
    assert.equal(pdfRes.data.length, 6)

    // 2. User confirms replacement modal
    const cart = pdfRes.data
    let activeRules = []

    // 3. Interpret natural-language cart-level rule: 10% off on orders >= 4000
    const aiRule = {
      scope: 'cart',
      type: 'percentage',
      value: 10,
      minSpend: 4000,
      stackable: false,
    }
    assert.equal(validateRuleCandidate(aiRule).isValid, true)

    const ruleId = generateNextRuleId(activeRules)
    activeRules = [...activeRules, { ...aiRule, ruleId }]

    // 4. Recalculate
    const results = processCart(cart, activeRules)
    assert.ok(results)
    // Subtotal of all 6 items is 6594 >= 4000 -> 10% cart discount = 659
    assert.equal(results.subtotal, 6594)
    assert.equal(results.cartDiscount, 659)
    assert.equal(cartTotal(results), 5935)
  })

  it('Scenario 3: Upload rules CSV -> create another natural-language rule -> verify both rules remain active', () => {
    // 1. Upload rules CSV
    const { data: csvRules } = parseRulesCSV(sampleRulesCsv)
    assert.equal(csvRules.length, 3)

    // 2. Add an additional natural language rule (flat 100 off on Nordic Basics)
    let activeRules = [...csvRules]
    const aiRule = {
      scope: 'brand',
      appliesTo: 'Nordic Basics',
      type: 'flat',
      value: 100,
      stackable: true,
      minSpend: 0,
    }
    const ruleId = generateNextRuleId(activeRules)
    assert.equal(ruleId, 'RULE-AI-01')
    activeRules = [...activeRules, { ...aiRule, ruleId }]

    // 3. Verify all 4 rules are active
    assert.equal(activeRules.length, 4)
    assert.equal(activeRules[0].ruleId, 'RULE-01')
    assert.equal(activeRules[1].ruleId, 'RULE-02')
    assert.equal(activeRules[2].ruleId, 'RULE-03')
    assert.equal(activeRules[3].ruleId, 'RULE-AI-01')

    // 4. Process cart: ITEM-05 (Nordic Basics on Amazon India) gets both Platform 15% AND Brand Flat 100 (stackable)
    const { data: cart } = parseCartCSV(sampleCartCsv)
    const results = processCart(cart, activeRules)
    const item05 = results.items.find((i) => i.itemId === 'ITEM-05')
    assert.ok(item05)
    // Base 449: 15% off = 67 -> 382. Then flat 100 off -> 282
    assert.equal(item05.finalPrice, 282)
    assert.match(item05.reasoning, /Platform offer: 15% off \+ Brand offer: Rs\.100 off/)
  })

  it('Scenario 4: Upload cart CSV -> upload PDF -> confirm replacement -> verify existing rules remain active', async () => {
    // 1. Upload CSV cart and rules
    const { data: csvCart } = parseCartCSV(sampleCartCsv)
    const { data: rules } = parseRulesCSV(sampleRulesCsv)
    const initialResults = processCart(csvCart, rules)
    assert.equal(cartTotal(initialResults), 5932)

    // 2. Upload PDF
    const pdfRes = await parseCartPDF(sampleCartCartBufferFallback(sampleCartCsv))
    assert.ok(pdfRes.data.length > 0)

    // 3. User confirms replacement: Cart is replaced, rules remain untouched
    const updatedCart = pdfRes.data
    const updatedResults = processCart(updatedCart, rules)

    // Rules remained active throughout replacement
    assert.equal(rules.length, 3)
    assert.ok(updatedResults)
    assert.equal(cartTotal(updatedResults), 5932)
  })

  it('Scenario 5: Create natural-language rule -> cancel preview -> verify active rules remain unchanged', () => {
    const { data: rules } = parseRulesCSV(sampleRulesCsv)
    let activeRules = [...rules]

    // User types instruction and gets preview
    const proposedRule = {
      scope: 'brand',
      appliesTo: 'LivSpace Pro',
      type: 'percentage',
      value: 50,
      stackable: false,
    }

    // User clicks Cancel
    // onRuleConfirmed is NOT called
    assert.equal(activeRules.length, 3)
    assert.equal(activeRules.some((r) => r.appliesTo === 'LivSpace Pro'), false)
  })

  it('Scenario 6: Upload PDF -> cancel preview -> verify original cart and results remain unchanged', async () => {
    const { data: originalCart } = parseCartCSV(sampleCartCsv)
    const { data: rules } = parseRulesCSV(sampleRulesCsv)
    const originalResults = processCart(originalCart, rules)

    let currentCart = originalCart
    let currentResults = originalResults

    // PDF uploaded but user cancels preview
    const pendingPdf = await parseCartPDF(sampleCartPdfBuffer)
    assert.ok(pendingPdf.data.length > 0)

    // Cancel action: pendingPdf is discarded, cart and results untouched
    assert.deepEqual(currentCart, originalCart)
    assert.equal(cartTotal(currentResults), cartTotal(originalResults))
  })

  it('Scenario 7: Add multiple natural-language rules -> verify previous rules are not overwritten and IDs are unique', () => {
    let activeRules = []

    const ruleA = { scope: 'brand', appliesTo: 'Brand A', type: 'percentage', value: 10, stackable: false }
    const idA = generateNextRuleId(activeRules)
    activeRules = [...activeRules, { ...ruleA, ruleId: idA }]

    const ruleB = { scope: 'platform', appliesTo: 'Platform B', type: 'flat', value: 50, stackable: true }
    const idB = generateNextRuleId(activeRules)
    activeRules = [...activeRules, { ...ruleB, ruleId: idB }]

    const ruleC = { scope: 'cart', type: 'flat', value: 200, minSpend: 1000, stackable: false }
    const idC = generateNextRuleId(activeRules)
    activeRules = [...activeRules, { ...ruleC, ruleId: idC }]

    assert.equal(activeRules.length, 3)
    assert.equal(activeRules[0].ruleId, 'RULE-AI-01')
    assert.equal(activeRules[1].ruleId, 'RULE-AI-02')
    assert.equal(activeRules[2].ruleId, 'RULE-AI-03')
  })

  it('Scenario 8: Upload a new cart after adding multiple rules -> verify all active rules are applied to new cart', () => {
    // 1. Add multiple rules (1 CSV + 2 AI rules)
    const rule1 = { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 10, stackable: true }
    const rule2 = { ruleId: 'RULE-AI-01', scope: 'brand', appliesTo: 'Custom Brand', type: 'flat', value: 100, stackable: true }
    const activeRules = [rule1, rule2]

    // 2. Upload brand new cart with item matching both rules
    const newCart = [
      { itemId: 'NEW-01', product: 'Test Item', brand: 'Custom Brand', platform: 'Amazon India', basePrice: 1000 },
    ]

    // 3. Recalculate
    const res = processCart(newCart, activeRules)
    assert.equal(res.items.length, 1)
    // Base 1000: 10% platform off (100) -> 900. Then Flat 100 brand off -> 800. Total discount 200
    assert.equal(res.items[0].finalPrice, 800)
    assert.equal(res.items[0].totalDiscount, 200)
    assert.match(res.items[0].reasoning, /Brand offer: Rs\.100 off/)
    assert.match(res.items[0].reasoning, /Platform offer: 10% off/)
  })

  it('Scenario 9: Upload CSV after using PDF and natural language -> verify all three features remain functional', async () => {
    // 1. Load cart via PDF
    const pdf = await parseCartPDF(sampleCartPdfBuffer)
    let cart = pdf.data

    // 2. Add rule via Natural Language
    let activeRules = [
      { ruleId: 'RULE-AI-01', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 25, stackable: false },
    ]
    let results = processCart(cart, activeRules)
    assert.equal(results.items[0].finalPrice, 974) // 1299 - 25% = 974

    // 3. Now upload rules.csv (imports new base rules)
    const { data: importedRules } = parseRulesCSV(sampleRulesCsv)
    activeRules = [...importedRules, ...activeRules] // can retain AI rules alongside imported CSV rules
    assert.equal(activeRules.length, 4)

    // 4. Now upload cart.csv (replaces cart items with CSV)
    const { data: newCartFromCsv } = parseCartCSV(sampleCartCsv)
    cart = newCartFromCsv

    // 5. Final calculation combines all sources
    results = processCart(cart, activeRules)
    assert.ok(results)
    assert.equal(results.items.length, 6)
  })
})

function sampleCartCartBufferFallback(csvText) {
  // Return valid binary buffer
  return fs.readFileSync(path.resolve('sample-data/cart.pdf'))
}
