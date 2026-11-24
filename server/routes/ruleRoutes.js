/**
 * ruleRoutes.js
 *
 * Express route handler for natural language rule interpretation.
 */

import { Router } from 'express'
import { interpretDiscountInstruction } from '../services/llmRuleParser.js'

const router = Router()

// In-memory IP rate limiter to protect paid LLM quota
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30     // 30 requests per minute per IP

/**
 * Resets the in-memory rate limiter (useful for test suites).
 */
export function clearRateLimiter() {
  rateLimitMap.clear()
}

/**
 * Lightweight rate-limiting and authorization middleware.
 */
function rateLimitAndAuthMiddleware(req, res, next) {
  // 1. Optional API Secret Key Authentication (if configured in environment)
  const apiSecretKey = process.env.API_SECRET_KEY
  if (apiSecretKey) {
    const authHeader = req.headers['authorization'] || ''
    const customHeader = req.headers['x-api-key'] || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

    if (customHeader !== apiSecretKey && bearerToken !== apiSecretKey) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: invalid or missing API key.',
      })
    }
  }

  // 2. IP Rate Limiting
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client'
  const now = Date.now()
  const timestamps = rateLimitMap.get(ip) || []

  // Retain only requests within the active sliding window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please wait a moment before trying again.',
    })
  }

  recent.push(now)
  rateLimitMap.set(ip, recent)
  next()
}

/**
 * POST /api/rules/interpret
 * Body: { instruction: string }
 */
router.post('/interpret', rateLimitAndAuthMiddleware, async (req, res) => {
  const { instruction } = req.body || {}

  if (!instruction || typeof instruction !== 'string' || instruction.trim() === '') {
    return res.status(400).json({
      status: 'error',
      message: 'Request body must contain a non-empty "instruction" string.',
    })
  }

  try {
    const result = await interpretDiscountInstruction(instruction)

    if (result.status === 'success') {
      return res.status(200).json(result)
    }

    if (result.status === 'needs_clarification') {
      return res.status(200).json(result)
    }

    return res.status(422).json(result)
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error while processing discount instruction.',
    })
  }
})

export default router
