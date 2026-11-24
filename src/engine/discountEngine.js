/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:    string       — e.g. "RULE-01"
 *   scope:     "brand" | "platform" | "cart"
 *   appliesTo: string       — e.g. "Natura Casa", "Amazon India", "4000"
 *   type:      "percentage" | "flat"
 *   value:     number       — percentage as integer (15 = 15%), flat in rupees
 *   stackable: boolean
 *   minSpend:  number       — optional minimum spend threshold (default 0)
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartCalculationResult {
 *   items:            DiscountResult[]
 *   subtotal:         number
 *   cartDiscount:     number
 *   finalTotal:       number
 *   appliedCartRules: string[]
 *   skippedCartRules: string[]
 *   cartReasoning:    string
 * }
 */

/**
 * Returns true if the rule applies to this cart item.
 * Cart-level rules do not apply to individual items.
 */
export function ruleMatchesItem(item, rule) {
  const normalise = (s) => (s || '').trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 * Guarantees that discount cannot exceed the eligible price.
 */
export function calculateDiscountAmount(price, rule) {
  if (price <= 0) return 0
  if (rule.type === 'percentage') {
    return Math.min(price, Math.round((price * rule.value) / 100))
  }
  if (rule.type === 'flat') {
    return Math.min(price, rule.value)
  }
  return 0
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
export function ruleToReasoning(rule) {
  if (rule.scope === 'cart') {
    const thresholdDesc = rule.minSpend > 0 ? ` on orders >= Rs.${rule.minSpend.toLocaleString('en-IN')}` : ''
    if (rule.type === 'percentage') {
      return `Cart offer: ${rule.value}% off${thresholdDesc}`
    }
    if (rule.type === 'flat') {
      return `Cart offer: Rs.${rule.value} off${thresholdDesc}`
    }
    return 'Cart offer applied'
  }

  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }
  return `${scopeLabel} offer applied`
}

/**
 * Applies the active item-level discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item.
 *   2. Among non-stackable rules, pick the one giving the largest discount on basePrice.
 *   3. Apply any stackable rules sequentially on top of that price.
 *   4. Cap intermediate and final prices at 0 (no negative price).
 *   5. Build the reasoning string from what was applied.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving on basePrice
  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const discount = calculateDiscountAmount(price, winner)
    price = Math.max(0, price - discount)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  // ── Stackable Rule Evaluation: Declaration Order Execution Policy ──────────────
  // Stackable discounts are applied sequentially in the exact declaration order
  // they appear in the input rules collection (matching array order / CSV order).
  // Each stackable rule calculates its discount against the running reduced price
  // established by previous offers, ensuring deterministic and transparent execution.
  // The engine does not reorder stackable offers behind the merchant's back.
  for (const rule of stackable) {
    if (price <= 0) break
    const discount = calculateDiscountAmount(price, rule)
    price = Math.max(0, price - discount)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.max(0, Math.round(price))

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Checks whether a cart rule qualifies based on the discounted subtotal.
 */
export function cartRuleQualifies(subtotal, rule) {
  if (!rule || rule.scope !== 'cart') return false
  const minSpend = rule.minSpend || 0
  return subtotal >= minSpend
}

/**
 * Evaluates and applies cart-level discount rules to the discounted subtotal.
 *
 * Logic:
 *   1. Filter cart rules that meet the minimum subtotal condition.
 *   2. If multiple non-stackable cart rules qualify, pick the one offering the highest saving.
 *   3. Stack any qualified stackable rules on top.
 *   4. Ensure the total cart discount never exceeds the eligible subtotal (payable cannot be negative).
 */
export function applyCartDiscounts(subtotal, cartRules) {
  if (!cartRules || cartRules.length === 0 || subtotal <= 0) {
    return {
      subtotal,
      cartDiscount: 0,
      finalTotal: subtotal,
      appliedCartRules: [],
      skippedCartRules: [],
      cartReasoning: 'No cart offers applied',
    }
  }

  const eligibleRules = cartRules.filter((r) => cartRuleQualifies(subtotal, r))

  if (eligibleRules.length === 0) {
    return {
      subtotal,
      cartDiscount: 0,
      finalTotal: subtotal,
      appliedCartRules: [],
      skippedCartRules: cartRules.map((r) => r.ruleId),
      cartReasoning: 'No cart offers applicable',
    }
  }

  const nonStackable = eligibleRules.filter((r) => !r.stackable)
  const stackable = eligibleRules.filter((r) => r.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(subtotal, b) -
        calculateDiscountAmount(subtotal, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let remaining = subtotal
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const discount = calculateDiscountAmount(remaining, winner)
    remaining = Math.max(0, remaining - discount)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  // Apply qualifying stackable cart rules sequentially in exact declaration order
  for (const rule of stackable) {
    if (remaining <= 0) break
    const discount = calculateDiscountAmount(remaining, rule)
    remaining = Math.max(0, remaining - discount)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalTotal = Math.max(0, Math.round(remaining))
  const cartDiscount = subtotal - finalTotal

  // Skipped includes disqualified cart rules plus competing non-stackable losers
  const disqualified = cartRules
    .filter((r) => !cartRuleQualifies(subtotal, r))
    .map((r) => r.ruleId)
  const skippedIds = [...skipped.map((r) => r.ruleId), ...disqualified]

  return {
    subtotal,
    cartDiscount,
    finalTotal,
    appliedCartRules: appliedRules,
    skippedCartRules: skippedIds,
    cartReasoning: reasoningParts.join(' + ') || 'No cart offers applied',
  }
}

/**
 * Orchestrates complete cart processing:
 *   Step 1: Partition rules into item-level and cart-level rules.
 *   Step 2: Apply item-level discounts to each item.
 *   Step 3: Sum discounted item prices to compute subtotal.
 *   Step 4: Apply cart-level discounts to the subtotal.
 *   Step 5: Return composite calculation object.
 */
export function processCart(cartItems, rules = []) {
  const itemRules = rules.filter((r) => r.scope !== 'cart')
  const cartRules = rules.filter((r) => r.scope === 'cart')

  const items = cartItems.map((item) => applyDiscounts(item, itemRules))
  const subtotal = items.reduce((sum, item) => sum + item.finalPrice, 0)
  const cartCalculation = applyCartDiscounts(subtotal, cartRules)

  return {
    items,
    subtotal,
    cartDiscount: cartCalculation.cartDiscount,
    finalTotal: cartCalculation.finalTotal,
    appliedCartRules: cartCalculation.appliedCartRules,
    skippedCartRules: cartCalculation.skippedCartRules,
    cartReasoning: cartCalculation.cartReasoning,
  }
}

/**
 * Returns the final payable total. Supports both legacy array of items or composite calculation result.
 */
export function cartTotal(results) {
  if (!results) return 0
  if (Array.isArray(results)) {
    return results.reduce((sum, r) => sum + r.finalPrice, 0)
  }
  return results.finalTotal ?? results.subtotal ?? 0
}
