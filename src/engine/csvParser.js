/**
 * csvParser.js
 *
 * Converts raw CSV text into the typed objects the discount engine expects.
 * Uses papaparse for reliable CSV parsing, then maps column names to the
 * internal data shapes.
 *
 * Expected rules.csv columns:
 *   rule_id, scope, applies_to, type, value, stackable, [min_spend]
 *
 * Expected cart.csv columns:
 *   item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'

/**
 * Validates whether a value is non-empty and contains non-whitespace characters.
 */
function isNonEmptyString(val) {
  return val !== undefined && val !== null && String(val).trim().length > 0
}

/**
 * Parses raw text of rules.csv into an array of DiscountRule objects.
 * Enforces strict validation for all fields.
 * If any row is invalid, the entire import is rejected (All-or-Nothing Policy),
 * returning { data: [], errors: [...] } to prevent partial or corrupted rulebooks.
 */
export function parseRulesCSV(csvText) {
  const cleanedText = (csvText || '').replace(/^\uFEFF/, '').trim()
  const { data: rows, errors: parseErrors } = Papa.parse(cleanedText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // account for header row
    const missing = []

    if (!isNonEmptyString(row.rule_id)) missing.push('rule_id')
    if (!isNonEmptyString(row.scope)) missing.push('scope')
    if (!isNonEmptyString(row.applies_to)) missing.push('applies_to')
    if (!isNonEmptyString(row.type)) missing.push('type')
    if (!isNonEmptyString(row.value)) missing.push('value')
    if (!isNonEmptyString(row.stackable)) missing.push('stackable')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const scope = String(row.scope).trim().toLowerCase()
    if (scope !== 'brand' && scope !== 'platform' && scope !== 'cart') {
      errors.push(`Row ${rowNum}: scope must be "brand", "platform", or "cart", got "${row.scope}"`)
      return
    }

    const type = String(row.type).trim().toLowerCase()
    if (type !== 'percentage' && type !== 'flat') {
      errors.push(`Row ${rowNum}: type must be "percentage" or "flat", got "${row.type}"`)
      return
    }

    // Strict numeric validation for discount value: reject partial numbers (15abc, 10%)
    const rawValStr = String(row.value).trim().replace(/^(?:rs\.?|inr|₹|\$)\s*/i, '').replace(/,/g, '')
    if (!/^\d+(?:\.\d+)?$/.test(rawValStr)) {
      errors.push(`Row ${rowNum}: value must be a valid positive number, got "${row.value}"`)
      return
    }
    const value = Number(rawValStr)
    if (value <= 0) {
      errors.push(`Row ${rowNum}: value must be a positive number, got "${row.value}"`)
      return
    }
    if (type === 'percentage' && value > 100) {
      errors.push(`Row ${rowNum}: percentage value cannot exceed 100%, got "${row.value}"`)
      return
    }

    // Strict boolean validation for stackable: accept only true, false, 1, 0, yes, no
    const stackableStr = String(row.stackable).trim().toLowerCase()
    let stackable
    if (['true', '1', 'yes'].includes(stackableStr)) {
      stackable = true
    } else if (['false', '0', 'no'].includes(stackableStr)) {
      stackable = false
    } else {
      errors.push(`Row ${rowNum}: stackable must be a valid boolean (true, false, yes, no, 1, 0), got "${row.stackable}"`)
      return
    }

    // Strict minimum spend validation for cart rules
    let minSpend = 0
    if (scope === 'cart') {
      if (row.min_spend !== undefined && String(row.min_spend).trim() !== '') {
        const cleanMinStr = String(row.min_spend).trim().replace(/^(?:rs\.?|inr|₹|\$)\s*/i, '').replace(/,/g, '')
        if (!/^\d+(?:\.\d+)?$/.test(cleanMinStr)) {
          errors.push(`Row ${rowNum}: invalid minimum spend threshold for cart rule, got "${row.min_spend}"`)
          return
        }
        minSpend = Number(cleanMinStr)
      } else {
        const appliesToRaw = String(row.applies_to).trim().toLowerCase()
        if (appliesToRaw !== 'all' && appliesToRaw !== 'cart' && appliesToRaw !== 'total') {
          const cleanApplies = appliesToRaw.replace(/^(?:min:|orders\s*>=?\s*|>=?\s*|rs\.?\s*)/i, '').replace(/,/g, '').trim()
          if (/^\d+(?:\.\d+)?$/.test(cleanApplies)) {
            minSpend = Number(cleanApplies)
          } else {
            errors.push(`Row ${rowNum}: invalid minimum spend threshold for cart rule, got "${row.applies_to}"`)
            return
          }
        }
      }
      if (isNaN(minSpend) || minSpend < 0) {
        errors.push(`Row ${rowNum}: invalid minimum spend threshold for cart rule, got "${row.min_spend || row.applies_to}"`)
        return
      }
    }

    data.push({
      ruleId: String(row.rule_id).trim(),
      scope,
      appliesTo: String(row.applies_to).trim(),
      type,
      value,
      stackable,
      minSpend,
    })
  })

  // All-or-nothing policy: if any row has an error, reject entire dataset
  if (errors.length > 0) {
    return { data: [], errors }
  }

  return { data, errors: [] }
}

/**
 * Validates and normalizes a single cart row into a CartItem object.
 * Returns { item, error } where either item is a valid CartItem or error is a descriptive string.
 * Shared by both csvParser and pdfParser to guarantee identical validation rules.
 */
export function normalizeCartRow(row, rowNum = null) {
  const prefix = rowNum !== null ? `Row ${rowNum}: ` : ''
  const missing = []

  const itemId = row.item_id ?? row.itemId
  const product = row.product
  const brand = row.brand
  const platform = row.platform
  const rawPrice = row.base_price ?? row.basePrice

  if (!isNonEmptyString(itemId)) missing.push('item_id')
  if (!isNonEmptyString(product)) missing.push('product')
  if (!isNonEmptyString(brand)) missing.push('brand')
  if (!isNonEmptyString(platform)) missing.push('platform')
  if (!isNonEmptyString(rawPrice)) missing.push('base_price')

  if (missing.length > 0) {
    return { item: null, error: `${prefix}missing fields — ${missing.join(', ')}` }
  }

  // Strict numeric validation: support Indian comma formatting and optional currency symbols
  const rawPriceStr = String(rawPrice).trim()
  const cleanPriceStr = rawPriceStr.replace(/^(?:rs\.?|inr|₹|\$)\s*/i, '').replace(/,/g, '').trim()

  if (!/^\d+(?:\.\d+)?$/.test(cleanPriceStr)) {
    return { item: null, error: `${prefix}base_price must be a positive number, got "${rawPrice}"` }
  }

  const basePrice = Number(cleanPriceStr)
  if (isNaN(basePrice) || basePrice <= 0) {
    return { item: null, error: `${prefix}base_price must be a positive number, got "${rawPrice}"` }
  }

  return {
    item: {
      itemId: String(itemId).trim(),
      product: String(product).trim(),
      brand: String(brand).trim(),
      platform: String(platform).trim(),
      basePrice: Math.round(basePrice),
    },
    error: null,
  }
}

/**
 * Parses the raw text of cart.csv into an array of CartItem objects.
 * Enforces:
 *  - Unique item IDs per cart (case-sensitive SKU matching).
 *  - Strict field and numeric validation.
 *  - All-or-Nothing Import Policy: if any row has an error, rejects entire import.
 */
export function parseCartCSV(csvText) {
  const cleanedText = (csvText || '').replace(/^\uFEFF/, '').trim()
  const { data: rows, errors: parseErrors } = Papa.parse(cleanedText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []
  const seenItemIds = new Set()

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const { item, error } = normalizeCartRow(row, rowNum)
    if (error) {
      errors.push(error)
      return
    }

    if (seenItemIds.has(item.itemId)) {
      errors.push(`Row ${rowNum}: duplicate item ID "${item.itemId}"`)
      return
    }

    seenItemIds.add(item.itemId)
    data.push(item)
  })

  // All-or-nothing policy: if any row fails, reject entire cart import
  if (errors.length > 0) {
    return { data: [], errors }
  }

  return { data, errors: [] }
}
