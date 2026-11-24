/**
 * test/vercelDeployment.test.js
 *
 * Automated verification suite for Vercel deployment architecture:
 *  1. Verifies that api/index.js can be imported without launching a background listener.
 *  2. Verifies that the Vercel serverless handler processes GET /api/health with 200 OK.
 *  3. Verifies URL normalization if Vercel rewrites strip the /api prefix (e.g. req.url = '/health').
 *  4. Verifies POST /api/rules/interpret handles invalid input with 400 Bad Request.
 *  5. Verifies POST /api/rules/interpret handles valid instructions with 200 OK.
 *  6. Verifies that vercel.json specifies valid rewrites for API and SPA routing.
 *  7. Verifies that Express static file serving is disabled in Vercel environment (process.env.VERCEL=1).
 *  8. Verifies that the compiled production bundle does not contain secret LLM credentials.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import handler from '../api/index.js'
import { DIST_DIR } from '../server/index.js'

describe('Vercel Deployment Architecture & Serverless Function Handler', () => {
  it('Requirement 3: api/index.js exports handler without starting a local listener', () => {
    assert.equal(typeof handler, 'function')
    // Handler can be called with (req, res) directly
    assert.ok(handler.length >= 2)
  })

  it('Requirement 4 & 5: GET /api/health executes successfully via Vercel handler', async () => {
    // Spin up an ephemeral HTTP server invoking the exported Vercel handler
    const server = http.createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/api/health`)
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.status, 'ok')
      assert.equal(data.service, 'discount-engine-backend')
      assert.equal(typeof data.hasKey, 'boolean')
      assert.equal(data.GEMINI_API_KEY, undefined)
      assert.equal(data.OPENAI_API_KEY, undefined)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Requirement 5: URL normalization restores /api prefix if Vercel rewrite strips it', async () => {
    // If Vercel rewrote /api/health and passed req.url as '/health', the handler must normalize it
    const server = http.createServer((req, res) => {
      // Simulate Vercel rewrite passing stripped path '/health'
      if (req.url === '/test-stripped-health') {
        req.url = '/health'
      }
      return handler(req, res)
    })
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/test-stripped-health`)
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.status, 'ok')
      assert.equal(data.service, 'discount-engine-backend')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Requirement 5: POST /api/rules/interpret validates invalid input with 400 Bad Request', async () => {
    const server = http.createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/api/rules/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: '   ' }),
      })
      assert.equal(response.status, 400)
      const data = await response.json()
      assert.equal(data.status, 'error')
      assert.match(data.message, /non-empty "instruction" string/)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Requirement 5: POST /api/rules/interpret processes valid instruction through handler', async () => {
    const server = http.createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      const response = await fetch(`http://localhost:${port}/api/rules/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: 'Give 15% off on all Amazon India products' }),
      })
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.status, 'success')
      assert.ok(data.rule)
      assert.equal(data.rule.scope, 'platform')
      assert.equal(data.rule.appliesTo, 'Amazon India')
      assert.equal(data.rule.value, 15)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Requirement 6: vercel.json contains valid rewrites for API and SPA routing', () => {
    const vercelConfigPath = path.resolve('vercel.json')
    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json must exist in project root')

    const raw = fs.readFileSync(vercelConfigPath, 'utf8')
    const config = JSON.parse(raw)

    assert.ok(Array.isArray(config.rewrites), 'vercel.json must define rewrites array')

    const apiRewrite = config.rewrites.find((r) => r.source.includes('/api/'))
    assert.ok(apiRewrite, 'vercel.json must define rewrite for /api/(.*)')
    assert.equal(apiRewrite.destination, '/api')

    const spaRewrite = config.rewrites.find((r) => r.destination === '/index.html')
    assert.ok(spaRewrite, 'vercel.json must define SPA fallback rewrite to /index.html')
  })

  it('Requirement 4: Express does not serve static files when process.env.VERCEL is set', async () => {
    const originalVercel = process.env.VERCEL
    const originalEnv = process.env.NODE_ENV
    process.env.VERCEL = '1'
    process.env.NODE_ENV = 'production'

    const server = http.createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      // In Vercel mode, non-API requests falling to Express return 404 because
      // Vercel Edge CDN handles static assets, NOT Express
      const res = await fetch(`http://localhost:${port}/some-non-api-page`)
      assert.equal(res.status, 404)
    } finally {
      process.env.VERCEL = originalVercel
      process.env.NODE_ENV = originalEnv
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Requirement 7: Frontend production bundle does not contain secret credentials', () => {
    const assetsDir = path.join(DIST_DIR, 'assets')
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
      for (const f of files) {
        const content = fs.readFileSync(path.join(assetsDir, f), 'utf8')
        if (process.env.GEMINI_API_KEY) {
          assert.ok(!content.includes(process.env.GEMINI_API_KEY), `Bundle file ${f} leaks GEMINI_API_KEY`)
        }
        if (process.env.OPENAI_API_KEY) {
          assert.ok(!content.includes(process.env.OPENAI_API_KEY), `Bundle file ${f} leaks OPENAI_API_KEY`)
        }
      }
    }
  })
})
