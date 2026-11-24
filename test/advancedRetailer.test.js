import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { parseCartCSV, parseRulesCSV } from '../src/engine/csvParser.js'
import { parseCartPDF } from '../src/engine/pdfParser.js'
import { processCart, cartTotal } from '../src/engine/discountEngine.js'

describe('Phase 4 — Advanced Retailer Dataset & Scenarios', () => {
  const advancedCartCsv = fs.readFileSync(path.resolve('sample-data/advanced-retailer/advanced-cart.csv'), 'utf8')
  const advancedRulesCsv = fs.readFileSync(path.resolve('sample-data/advanced-retailer/advanced-rules.csv'), 'utf8')
  const advancedCartPdf = fs.readFileSync(path.resolve('sample-data/advanced-retailer/advanced-cart.pdf'))

  it('successfully parses all 60 items from advanced-cart.csv', () => {
    const { data, errors } = parseCartCSV(advancedCartCsv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 60)
    assert.equal(data[0].itemId, 'ITEM-ADV-01')
    assert.equal(data[0].product, 'Wireless Noise-Canceling Earbuds, 40h Battery')
    assert.equal(data[59].itemId, 'ITEM-ADV-60')
  })

  it('successfully parses all 18 rules from advanced-rules.csv', () => {
    const { data, errors } = parseRulesCSV(advancedRulesCsv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 18)
    assert.equal(data[0].ruleId, 'RULE-ADV-01')
    assert.equal(data[15].scope, 'cart')
    assert.equal(data[15].minSpend, 10000)
    assert.equal(data[16].minSpend, 25000)
  })

  it('successfully extracts all 60 items from multi-page advanced-cart.pdf', async () => {
    const { data, errors } = await parseCartPDF(advancedCartPdf)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 60)
    assert.equal(data[0].itemId, 'ITEM-ADV-01')
    assert.equal(data[59].itemId, 'ITEM-ADV-60')
    assert.equal(data[59].basePrice, 9499)
  })

  it('flags malformed CSV rows with missing columns', () => {
    const malformedCsv = fs.readFileSync(
      path.resolve('sample-data/advanced-retailer/negative-fixtures/invalid-cart-malformed.csv'),
      'utf8'
    )
    const { data, errors } = parseCartCSV(malformedCsv)
    assert.ok(errors.length >= 1)
    assert.match(errors[0], /fields/i)
  })

  it('flags negative and zero prices in negative fixtures', () => {
    const invalidPriceCsv = fs.readFileSync(
      path.resolve('sample-data/advanced-retailer/negative-fixtures/invalid-cart-missing-price.csv'),
      'utf8'
    )
    const { data, errors } = parseCartCSV(invalidPriceCsv)
    assert.equal(data.length, 0)
    assert.equal(errors.length, 3)
    assert.match(errors[0], /base_price must be a positive number/)
    assert.match(errors[1], /base_price must be a positive number/)
    assert.match(errors[2], /base_price must be a positive number/)
  })

  it('Scenario 1: Competing Boat 15% vs Amazon 10% on ITEM-ADV-01 with stackable Boat Rs.300', () => {
    const { data: cart } = parseCartCSV(advancedCartCsv)
    const { data: rules } = parseRulesCSV(advancedRulesCsv)
    const res = processCart([cart[0]], rules)
    const item01 = res.items[0]
    // Base 1999: Boat 15% (300 saving) beats Amazon 10% (200 saving). Then stackable flat 300 -> 1399
    assert.equal(item01.finalPrice, 1399)
    assert.equal(item01.totalDiscount, 600)
    assert.match(item01.reasoning, /Brand offer: 15% off/)
    assert.match(item01.reasoning, /Brand offer: Rs\.300 off/)
    assert.ok(item01.skippedRules.includes('RULE-ADV-01'))
  })

  it('Scenario 2: Stackable Flipkart 12% and Boat flat Rs.300 stack on non-stackable Boat 15% on ITEM-ADV-02', () => {
    const { data: cart } = parseCartCSV(advancedCartCsv)
    const { data: rules } = parseRulesCSV(advancedRulesCsv)
    const res = processCart([cart[1]], rules)
    const item02 = res.items[0]
    assert.equal(item02.finalPrice, 672)
    assert.equal(item02.totalDiscount, 627)
    assert.match(item02.reasoning, /Brand offer: 15% off/)
    assert.match(item02.reasoning, /Platform offer: 12% off/)
    assert.match(item02.reasoning, /Brand offer: Rs\.300 off/)
  })

  it('Scenario 3: Amazon 10% beats Samsung flat Rs.5000 on Galaxy S24 Ultra', () => {
    const { data: cart } = parseCartCSV(advancedCartCsv)
    const { data: rules } = parseRulesCSV(advancedRulesCsv)
    const galaxy = cart.find((i) => i.itemId === 'ITEM-ADV-06')
    assert.ok(galaxy)
    const res = processCart([galaxy], rules)
    const resultItem = res.items[0]
    // 129999: 10% off is 13000 saving, beating flat 5000 saving. Final: 116999
    assert.equal(resultItem.finalPrice, 116999)
    assert.equal(resultItem.totalDiscount, 13000)
    assert.match(resultItem.reasoning, /Platform offer: 10% off/)
    assert.ok(resultItem.skippedRules.includes('RULE-ADV-08'))
  })

  it('Scenario 4 & 5: Cart minimum spend boundary exactly met vs not met', () => {
    const cartExact = [{ itemId: 'T-1', product: 'P', brand: 'B', platform: 'PL', basePrice: 10000 }]
    const cartBelow = [{ itemId: 'T-2', product: 'P', brand: 'B', platform: 'PL', basePrice: 9999 }]
    const cartRule = [{ ruleId: 'C-1', scope: 'cart', appliesTo: 'min:10000', type: 'percentage', value: 5, stackable: false, minSpend: 10000 }]

    const resExact = processCart(cartExact, cartRule)
    assert.equal(resExact.cartDiscount, 500)
    assert.equal(resExact.finalTotal, 9500)

    const resBelow = processCart(cartBelow, cartRule)
    assert.equal(resBelow.cartDiscount, 0)
    assert.equal(resBelow.finalTotal, 9999)
  })

  it('Scenario 6: Multiple qualifying cart rules select best non-stackable and stack stackable', () => {
    const cart = [{ itemId: 'T-3', product: 'Luxury TV', brand: 'Generic', platform: 'Generic', basePrice: 50000 }]
    const rules = [
      { ruleId: 'C-PCT', scope: 'cart', type: 'percentage', value: 5, minSpend: 10000, stackable: false },
      { ruleId: 'C-FLAT', scope: 'cart', type: 'flat', value: 2000, minSpend: 30000, stackable: false },
      { ruleId: 'C-STACK', scope: 'cart', type: 'flat', value: 1500, minSpend: 25000, stackable: true },
    ]
    const res = processCart(cart, rules)
    // 50000: 5% (2500) beats 2000 flat. Remaining: 47500. Stackable flat 1500 -> 46000. Total cart discount: 4000
    assert.equal(res.cartDiscount, 4000)
    assert.equal(res.finalTotal, 46000)
  })

  it('Scenario 7: Flat discount exceeding base price never produces negative prices', () => {
    const cheapItem = [{ itemId: 'CHEAP-01', product: 'Aux Cable', brand: 'Boat', platform: 'Any', basePrice: 200 }]
    const bigDiscount = [{ ruleId: 'R-BIG', scope: 'brand', appliesTo: 'Boat', type: 'flat', value: 500, stackable: false }]
    const res = processCart(cheapItem, bigDiscount)
    assert.equal(res.items[0].finalPrice, 0)
    assert.equal(res.items[0].totalDiscount, 200)
  })
})
