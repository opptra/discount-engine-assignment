import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRuleCandidate,
  validateLlmResponse,
} from '../server/validators/discountRuleSchema.js'
import { interpretDiscountInstruction } from '../server/services/llmRuleParser.js'
import { app } from '../server/index.js'

describe('Natural Language Rule Validator — Schema Invariants', () => {
  it('validates a valid brand percentage rule', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'percentage',
      value: 20,
      stackable: false,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, true)
    assert.equal(res.rule.scope, 'brand')
    assert.equal(res.rule.appliesTo, 'Natura Casa')
    assert.equal(res.rule.value, 20)
    assert.equal(res.rule.stackable, false)
    assert.equal(res.rule.minSpend, 0)
  })

  it('validates a valid platform stackable rule', () => {
    const candidate = {
      scope: 'platform',
      appliesTo: 'Amazon India',
      type: 'percentage',
      value: 15,
      stackable: true,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, true)
    assert.equal(res.rule.scope, 'platform')
    assert.equal(res.rule.stackable, true)
  })

  it('validates a valid cart rule with minimum spend threshold', () => {
    const candidate = {
      scope: 'cart',
      type: 'percentage',
      value: 10,
      minSpend: 4000,
      stackable: false,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, true)
    assert.equal(res.rule.scope, 'cart')
    assert.equal(res.rule.minSpend, 4000)
    assert.equal(res.rule.appliesTo, 'cart')
  })

  it('rejects unsupported scope', () => {
    const candidate = {
      scope: 'category',
      appliesTo: 'Electronics',
      type: 'percentage',
      value: 10,
      stackable: false,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /Invalid scope "category"/)
  })

  it('rejects percentage discount exceeding 100%', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'percentage',
      value: 150,
      stackable: false,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /cannot exceed 100%/)
  })

  it('rejects non-numeric and negative values', () => {
    const res1 = validateRuleCandidate({ scope: 'brand', appliesTo: 'X', type: 'flat', value: -50, stackable: false })
    assert.equal(res1.isValid, false)
    assert.match(res1.errors[0], /greater than zero/)

    const res2 = validateRuleCandidate({ scope: 'brand', appliesTo: 'X', type: 'flat', value: 'free', stackable: false })
    assert.equal(res2.isValid, false)
    assert.match(res2.errors[0], /valid finite number/)
  })

  it('rejects non-boolean stackable attribute', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'percentage',
      value: 10,
      stackable: 'yes', // must be strict boolean
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /strict boolean/)
  })

  it('rejects missing appliesTo for brand/platform scope', () => {
    const candidate = {
      scope: 'brand',
      appliesTo: '',
      type: 'flat',
      value: 100,
      stackable: false,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /requires a non-empty "appliesTo" target/)
  })

  it('rejects negative minimum spend', () => {
    const candidate = {
      scope: 'cart',
      type: 'percentage',
      value: 10,
      stackable: false,
      minSpend: -100,
    }
    const res = validateRuleCandidate(candidate)
    assert.equal(res.isValid, false)
    assert.match(res.errors[0], /cannot be negative/)
  })
})

describe('Natural Language Rule Service — Mock Provider & Clarification', () => {
  it('successfully interprets a brand percentage prompt', async () => {
    const mockCall = async () => ({
      status: 'success',
      rule: {
        scope: 'brand',
        appliesTo: 'Natura Casa',
        type: 'percentage',
        value: 20,
        stackable: false,
        minSpend: 0,
      },
      message: '20% off on Natura Casa',
    })

    const res = await interpretDiscountInstruction('Give 20% off on Natura Casa products', { mockCall })
    assert.equal(res.status, 'success')
    assert.equal(res.rule.scope, 'brand')
    assert.equal(res.rule.value, 20)
  })

  it('correctly handles clarification response for ambiguous instruction', async () => {
    const mockCall = async () => ({
      status: 'needs_clarification',
      question: 'What discount percentage or flat amount should be given to Natura Casa?',
    })

    const res = await interpretDiscountInstruction('Give a discount to Natura Casa', { mockCall })
    assert.equal(res.status, 'needs_clarification')
    assert.match(res.question, /What discount percentage/)
  })

  it('rejects empty input without calling provider', async () => {
    let called = false
    const mockCall = async () => {
      called = true
    }

    const res = await interpretDiscountInstruction('', { mockCall })
    assert.equal(called, false)
    assert.equal(res.status, 'error')
    assert.match(res.message, /Instruction cannot be empty/)
  })

  it('rejects excessively long prompt without calling provider', async () => {
    let called = false
    const mockCall = async () => {
      called = true
    }

    const longText = 'a'.repeat(501)
    const res = await interpretDiscountInstruction(longText, { mockCall })
    assert.equal(called, false)
    assert.equal(res.status, 'error')
    assert.match(res.message, /Instruction is too long/)
  })

  it('handles provider timeout gracefully', async () => {
    const mockCall = async () => {
      throw new Error('LLM request timed out after 10 seconds.')
    }

    const res = await interpretDiscountInstruction('15% off Amazon India', { mockCall })
    assert.equal(res.status, 'error')
    assert.match(res.message, /timed out/)
  })

  it('handles provider rate limit gracefully', async () => {
    const mockCall = async () => {
      throw new Error('LLM rate limit reached. Please wait a moment and try again.')
    }

    const res = await interpretDiscountInstruction('15% off Amazon India', { mockCall })
    assert.equal(res.status, 'error')
    assert.match(res.message, /rate limit reached/)
  })
})

describe('Backend Express API Endpoint — Integration', () => {
  it('GET /api/health returns 200 with service metadata', async () => {
    const server = app.listen(0) // dynamic test port
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/api/health`)
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.status, 'ok')
      assert.equal(data.service, 'discount-engine-backend')
    } finally {
      server.close()
    }
  })

  it('POST /api/rules/interpret rejects missing instruction field with 400', async () => {
    const server = app.listen(0)
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/api/rules/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.equal(response.status, 400)
      const data = await response.json()
      assert.equal(data.status, 'error')
      assert.match(data.message, /must contain a non-empty "instruction" string/)
    } finally {
      server.close()
    }
  })
})
