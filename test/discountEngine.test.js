import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ruleMatchesItem,
  calculateDiscountAmount,
  applyDiscounts,
  cartRuleQualifies,
  applyCartDiscounts,
  processCart,
  cartTotal,
} from '../src/engine/discountEngine.js'
import { parseRulesCSV, parseCartCSV } from '../src/engine/csvParser.js'

describe('Discount Engine — Item-Level Logic Preservation', () => {
  const sampleRules = [
    { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false },
    { ruleId: 'RULE-02', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false },
    { ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', type: 'percentage', value: 10, stackable: true },
  ]

  it('correctly calculates ITEM-01 (Platform 15% beats Flat Rs.150)', () => {
    const item = { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 }
    const res = applyDiscounts(item, sampleRules)
    assert.equal(res.finalPrice, 1104)
    assert.equal(res.totalDiscount, 195)
    assert.deepEqual(res.appliedRules, ['RULE-01'])
    assert.deepEqual(res.skippedRules, ['RULE-02'])
  })

  it('correctly calculates ITEM-02 (Brand Flat Rs.150 + Platform 10% stackable)', () => {
    const item = { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 }
    const res = applyDiscounts(item, sampleRules)
    // 849 - 150 = 699; 699 - round(69.9) = 629
    assert.equal(res.finalPrice, 629)
    assert.equal(res.totalDiscount, 220)
    assert.deepEqual(res.appliedRules, ['RULE-02', 'RULE-03'])
  })

  it('correctly calculates ITEM-04 (No matching offers)', () => {
    const item = { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 }
    const res = applyDiscounts(item, sampleRules)
    assert.equal(res.finalPrice, 2499)
    assert.equal(res.totalDiscount, 0)
    assert.equal(res.reasoning, 'No offers available')
  })

  it('preserves complete README sample dataset total without cart rules', () => {
    const cart = [
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
      { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
      { itemId: 'ITEM-03', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
      { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
      { itemId: 'ITEM-05', product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
      { itemId: 'ITEM-06', product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 },
    ]
    const res = processCart(cart, sampleRules)
    // 1104 + 629 + 509 + 2499 + 382 + 809 = 5932
    assert.equal(res.subtotal, 5932)
    assert.equal(res.cartDiscount, 0)
    assert.equal(res.finalTotal, 5932)
    assert.equal(cartTotal(res), 5932)
  })
})

describe('Discount Engine — Cart-Level Discounts', () => {
  it('correctly calculates assignment specification illustrative example', () => {
    // Cart items:
    // Item A: 1500 -> 1200
    // Item B: 1500 -> 1300
    // Item C: 1500 -> 1500
    // Subtotal = 4000
    // Cart rule: 10% off when subtotal >= 4000 -> cart discount = 400, final = 3600
    const rules = [
      { ruleId: 'R-ITEM-A', scope: 'brand', appliesTo: 'BrandA', type: 'flat', value: 300, stackable: false },
      { ruleId: 'R-ITEM-B', scope: 'brand', appliesTo: 'BrandB', type: 'flat', value: 200, stackable: false },
      { ruleId: 'R-CART-01', scope: 'cart', appliesTo: '4000', type: 'percentage', value: 10, stackable: false, minSpend: 4000 },
    ]
    const cart = [
      { itemId: 'A', product: 'Prod A', brand: 'BrandA', platform: 'P', basePrice: 1500 },
      { itemId: 'B', product: 'Prod B', brand: 'BrandB', platform: 'P', basePrice: 1500 },
      { itemId: 'C', product: 'Prod C', brand: 'BrandC', platform: 'P', basePrice: 1500 },
    ]
    const result = processCart(cart, rules)

    assert.equal(result.items[0].finalPrice, 1200)
    assert.equal(result.items[1].finalPrice, 1300)
    assert.equal(result.items[2].finalPrice, 1500)
    assert.equal(result.subtotal, 4000)
    assert.equal(result.cartDiscount, 400)
    assert.equal(result.finalTotal, 3600)
    assert.deepEqual(result.appliedCartRules, ['R-CART-01'])
  })

  it('does not apply cart discount when subtotal is below the threshold', () => {
    const cartRules = [
      { ruleId: 'CART-10', scope: 'cart', appliesTo: '4000', type: 'percentage', value: 10, stackable: false, minSpend: 4000 },
    ]
    const subtotal = 3999
    const res = applyCartDiscounts(subtotal, cartRules)
    assert.equal(res.cartDiscount, 0)
    assert.equal(res.finalTotal, 3999)
    assert.deepEqual(res.skippedCartRules, ['CART-10'])
  })

  it('applies cart discount when subtotal exactly equals the threshold', () => {
    const cartRules = [
      { ruleId: 'CART-10', scope: 'cart', appliesTo: '4000', type: 'percentage', value: 10, stackable: false, minSpend: 4000 },
    ]
    const subtotal = 4000
    const res = applyCartDiscounts(subtotal, cartRules)
    assert.equal(res.cartDiscount, 400)
    assert.equal(res.finalTotal, 3600)
    assert.deepEqual(res.appliedCartRules, ['CART-10'])
  })

  it('applies flat cart discounts correctly', () => {
    const cartRules = [
      { ruleId: 'CART-FLAT', scope: 'cart', appliesTo: '2000', type: 'flat', value: 250, stackable: false, minSpend: 2000 },
    ]
    const res = applyCartDiscounts(2500, cartRules)
    assert.equal(res.cartDiscount, 250)
    assert.equal(res.finalTotal, 2250)
  })

  it('caps flat cart discount so payable amount never goes below 0', () => {
    const cartRules = [
      { ruleId: 'CART-BIG', scope: 'cart', appliesTo: '0', type: 'flat', value: 1000, stackable: false, minSpend: 0 },
    ]
    const res = applyCartDiscounts(400, cartRules)
    assert.equal(res.cartDiscount, 400)
    assert.equal(res.finalTotal, 0)
  })

  it('picks the winning non-stackable cart rule with largest rupee saving', () => {
    const cartRules = [
      { ruleId: 'CART-PCT', scope: 'cart', appliesTo: '3000', type: 'percentage', value: 10, stackable: false, minSpend: 3000 }, // 10% of 5000 = 500
      { ruleId: 'CART-FLAT', scope: 'cart', appliesTo: '3000', type: 'flat', value: 300, stackable: false, minSpend: 3000 },      // 300
    ]
    const res = applyCartDiscounts(5000, cartRules)
    assert.equal(res.cartDiscount, 500)
    assert.equal(res.finalTotal, 4500)
    assert.deepEqual(res.appliedCartRules, ['CART-PCT'])
    assert.ok(res.skippedCartRules.includes('CART-FLAT'))
  })

  it('correctly stacks stackable cart rule on top of winning non-stackable cart rule', () => {
    const cartRules = [
      { ruleId: 'CART-BASE', scope: 'cart', appliesTo: '2000', type: 'flat', value: 200, stackable: false, minSpend: 2000 },
      { ruleId: 'CART-EXTRA', scope: 'cart', appliesTo: '2000', type: 'percentage', value: 10, stackable: true, minSpend: 2000 },
    ]
    // Subtotal 2000:
    // Base winner: 2000 - 200 = 1800
    // Extra stackable: 10% of 1800 = 180
    // Final = 1620, Total Cart Discount = 380
    const res = applyCartDiscounts(2000, cartRules)
    assert.equal(res.cartDiscount, 380)
    assert.equal(res.finalTotal, 1620)
    assert.deepEqual(res.appliedCartRules, ['CART-BASE', 'CART-EXTRA'])
  })

  it('handles empty carts gracefully', () => {
    const res = processCart([], [{ ruleId: 'C1', scope: 'cart', appliesTo: '0', type: 'flat', value: 100, stackable: false }])
    assert.equal(res.subtotal, 0)
    assert.equal(res.cartDiscount, 0)
    assert.equal(res.finalTotal, 0)
    assert.deepEqual(res.items, [])
  })
})

describe('CSV Parser — Cart Rules and Data Hardening', () => {
  it('parses cart rules with threshold in applies_to', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable\nRULE-04,cart,4000,percentage,10,false`
    const { data, errors } = parseRulesCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data.length, 1)
    assert.equal(data[0].scope, 'cart')
    assert.equal(data[0].minSpend, 4000)
    assert.equal(data[0].value, 10)
  })

  it('parses cart rules with min:5000 keyword syntax', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable\nRULE-05,cart,min:5000,flat,500,true`
    const { data, errors } = parseRulesCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data[0].minSpend, 5000)
    assert.equal(data[0].stackable, true)
  })

  it('rejects percentage rules with value > 100', () => {
    const csv = `rule_id,scope,applies_to,type,value,stackable\nRULE-ERR,cart,all,percentage,150,false`
    const { errors } = parseRulesCSV(csv)
    assert.ok(errors.length > 0)
    assert.match(errors[0], /percentage value cannot exceed 100%/)
  })

  it('sanitizes base_price formatted with commas or currency strings in cart.csv', () => {
    const csv = `item_id,product,brand,platform,base_price\nITEM-X,Test Item,BrandX,Amazon India,"1,299"`
    const { data, errors } = parseCartCSV(csv)
    assert.equal(errors.length, 0)
    assert.equal(data[0].basePrice, 1299)
  })
})
