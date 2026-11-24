/**
 * discountRuleSchema.js
 *
 * Independent validator for LLM-interpreted discount rules.
 * Enforces strict domain invariants matching the existing DiscountRule model.
 */

const ALLOWED_SCOPES = ['brand', 'platform', 'cart']
const ALLOWED_TYPES = ['percentage', 'flat']
const ALLOWED_CANDIDATE_KEYS = new Set(['scope', 'appliesTo', 'type', 'value', 'stackable', 'minSpend'])
const ALLOWED_RESPONSE_KEYS = new Set(['status', 'rule', 'message', 'question'])

/**
 * Validates a candidate rule object.
 * Returns { isValid: boolean, rule?: Object, errors?: string[] }
 */
export function validateRuleCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { isValid: false, errors: ['Rule must be a non-null object.'] }
  }

  const errors = []

  // Check for unexpected fields
  const extraKeys = Object.keys(candidate).filter((k) => !ALLOWED_CANDIDATE_KEYS.has(k))
  if (extraKeys.length > 0) {
    errors.push(`Unexpected field(s) in rule candidate: ${extraKeys.map((k) => `"${k}"`).join(', ')}.`)
  }

  // Required field checks
  if (candidate.scope === undefined || candidate.scope === null) {
    errors.push('Missing required field "scope".')
  }
  if (candidate.type === undefined || candidate.type === null) {
    errors.push('Missing required field "type".')
  }
  if (candidate.value === undefined || candidate.value === null) {
    errors.push('Missing required field "value".')
  }
  if (candidate.stackable === undefined || candidate.stackable === null) {
    errors.push('Missing required field "stackable".')
  }

  // 1. Scope validation
  const scope = typeof candidate.scope === 'string' ? candidate.scope.trim().toLowerCase() : ''
  if (candidate.scope !== undefined && !ALLOWED_SCOPES.includes(scope)) {
    errors.push(`Invalid scope "${candidate.scope}". Must be one of: ${ALLOWED_SCOPES.join(', ')}.`)
  }

  // 2. Type validation
  const type = typeof candidate.type === 'string' ? candidate.type.trim().toLowerCase() : ''
  if (candidate.type !== undefined && !ALLOWED_TYPES.includes(type)) {
    errors.push(`Invalid discount type "${candidate.type}". Must be "percentage" or "flat".`)
  }

  // 3. Value validation
  const value = candidate.value
  if (value !== undefined && value !== null) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
      errors.push(`Discount value must be a valid finite number, got "${value}".`)
    } else if (value <= 0) {
      errors.push(`Discount value must be greater than zero, got ${value}.`)
    } else if (type === 'percentage' && value > 100) {
      errors.push(`Percentage discount cannot exceed 100%, got ${value}%.`)
    }
  }

  // 4. Stackable validation
  if (candidate.stackable !== undefined && typeof candidate.stackable !== 'boolean') {
    errors.push(`Stackable must be a strict boolean (true or false), got "${candidate.stackable}".`)
  }

  // 5. AppliesTo & scope consistency validation
  let appliesTo = candidate.appliesTo
  if (scope === 'brand' || scope === 'platform') {
    if (!appliesTo || typeof appliesTo !== 'string' || appliesTo.trim() === '') {
      errors.push(`Rule with scope "${scope}" requires a non-empty "appliesTo" target.`)
    } else {
      const trimmedTarget = appliesTo.trim()
      if (['cart', 'all'].includes(trimmedTarget.toLowerCase())) {
        errors.push(`Rule with scope "${scope}" cannot have appliesTo "${trimmedTarget}".`)
      } else {
        appliesTo = trimmedTarget
      }
    }
    // minSpend on item-level rules is inconsistent
    if (candidate.minSpend !== undefined && candidate.minSpend !== null && candidate.minSpend > 0) {
      errors.push(`Minimum spend condition (minSpend) is only supported for cart-level rules, not for ${scope} rules.`)
    }
  } else if (scope === 'cart') {
    if (appliesTo !== undefined && typeof appliesTo === 'string' && appliesTo.trim() !== '') {
      const trimmedTarget = appliesTo.trim()
      if (!['cart', 'all'].includes(trimmedTarget.toLowerCase())) {
        errors.push(`Cart-level rule cannot target a specific brand or platform ("${trimmedTarget}").`)
      }
    }
    appliesTo = 'cart'
  }

  // 6. Minimum spend validation (cart rules or optional condition)
  let minSpend = 0
  if (candidate.minSpend !== undefined && candidate.minSpend !== null) {
    if (typeof candidate.minSpend !== 'number' || !Number.isFinite(candidate.minSpend) || Number.isNaN(candidate.minSpend)) {
      errors.push(`Minimum spend threshold must be a valid number, got "${candidate.minSpend}".`)
    } else if (candidate.minSpend < 0) {
      errors.push(`Minimum spend threshold cannot be negative, got ${candidate.minSpend}.`)
    } else {
      minSpend = Math.round(candidate.minSpend)
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors }
  }

  return {
    isValid: true,
    rule: {
      scope,
      appliesTo,
      type,
      value: type === 'percentage' ? Number(value.toFixed(2)) : Math.round(value),
      stackable: candidate.stackable,
      minSpend,
    },
  }
}

/**
 * Validates the full structured response from the LLM service.
 */
export function validateLlmResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      status: 'error',
      message: 'Malformed response received: expected JSON object.',
    }
  }

  // Reject unexpected top-level fields
  const extraKeys = Object.keys(payload).filter((k) => !ALLOWED_RESPONSE_KEYS.has(k))
  if (extraKeys.length > 0) {
    return {
      status: 'error',
      message: `Malformed response: unexpected top-level field(s) ${extraKeys.map((k) => `"${k}"`).join(', ')}.`,
    }
  }

  // Case 1: Model asks for clarification on ambiguous input
  if (payload.status === 'needs_clarification') {
    const question = typeof payload.question === 'string' ? payload.question.trim() : ''
    if (!question) {
      return {
        status: 'error',
        message: 'Model requested clarification but provided no question.',
      }
    }
    return {
      status: 'needs_clarification',
      question,
    }
  }

  // Case 2: Model successfully produced a rule
  if (payload.status === 'success') {
    if (!payload.rule) {
      return {
        status: 'error',
        message: 'Response status marked "success" but contained no "rule" object.',
      }
    }

    const validation = validateRuleCandidate(payload.rule)
    if (!validation.isValid) {
      return {
        status: 'error',
        message: `Rule validation failed: ${validation.errors.join(' ')}`,
      }
    }

    return {
      status: 'success',
      rule: validation.rule,
      message: payload.message || 'Rule interpreted successfully.',
    }
  }

  // Case 3: Model returned an explicit error or unhandled status
  return {
    status: 'error',
    message: payload.message || 'Unable to interpret the discount instruction into a valid rule.',
  }
}
