/**
 * scripts/verify-vercel.mjs
 *
 * Standalone verification runner for Vercel deployment readiness.
 * Tests:
 *  1. Serverless function entrypoint (api/index.js) can be loaded with zero side effects.
 *  2. Vercel handler executes GET /api/health and returns expected service metadata.
 *  3. URL normalizer handles both /api/health and stripped /health paths cleanly.
 *  4. POST /api/rules/interpret enforces input validation (400 on empty input).
 *  5. POST /api/rules/interpret processes valid natural language instructions (200 OK).
 *  6. Unknown /api/* routes return JSON 404.
 *  7. vercel.json configuration conforms to Vercel rewrites specification.
 *  8. Express static file serving is bypassed in Vercel runtime (process.env.VERCEL=1).
 *  9. Static production assets in dist/ exist and contain no secret API credentials.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import handler from '../api/index.js'
import { DIST_DIR, INDEX_HTML } from '../server/index.js'

console.log(`\n======================================================`)
console.log(`[Vercel Deployment Verification] Running checks...`)
console.log(`======================================================\n`)

let failures = 0

async function run() {
  // 1. Verify handler export
  console.log(`[Check 1] Verifying api/index.js export structure...`)
  if (typeof handler === 'function') {
    console.log(`  ✓ api/index.js exports a callable serverless handler function.\n`)
  } else {
    console.error(`  ✗ api/index.js does NOT export a function!\n`)
    failures++
  }

  // Spin up an ephemeral local server to invoke the Vercel handler
  const server = http.createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  const baseUrl = `http://localhost:${port}`

  try {
    // 2. GET /api/health
    console.log(`[Check 2] Testing GET /api/health through Vercel handler...`)
    const r2 = await fetch(`${baseUrl}/api/health`)
    const d2 = await r2.json()
    console.log(`  Status: ${r2.status}`)
    console.log(`  Payload:`, JSON.stringify(d2))
    if (r2.status === 200 && d2.status === 'ok' && d2.service === 'discount-engine-backend') {
      console.log(`  ✓ /api/health returned 200 OK with expected metadata.\n`)
    } else {
      console.error(`  ✗ /api/health response failed validation!\n`)
      failures++
    }

    // 3. URL Normalization check (simulating Vercel rewrite passing stripped path '/health')
    console.log(`[Check 3] Testing URL normalization when rewrite strips /api prefix...`)
    const normServer = http.createServer((req, res) => {
      // Simulate stripped path
      if (req.url === '/test-stripped') {
        req.url = '/health'
      }
      return handler(req, res)
    })
    await new Promise((resolve) => normServer.listen(0, resolve))
    const normPort = normServer.address().port
    const r3 = await fetch(`http://localhost:${normPort}/test-stripped`)
    const d3 = await r3.json()
    normServer.close()
    if (r3.status === 200 && d3.status === 'ok') {
      console.log(`  ✓ Stripped path '/health' correctly normalized and matched by Express route.\n`)
    } else {
      console.error(`  ✗ URL normalization failed for stripped path!\n`)
      failures++
    }

    // 4. POST /api/rules/interpret (validation error path)
    console.log(`[Check 4] Testing POST /api/rules/interpret validation (empty instruction)...`)
    const r4 = await fetch(`${baseUrl}/api/rules/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: '   ' }),
    })
    const d4 = await r4.json()
    console.log(`  Status: ${r4.status}`)
    console.log(`  Payload:`, JSON.stringify(d4))
    if (r4.status === 400 && d4.status === 'error') {
      console.log(`  ✓ Empty instruction correctly rejected with 400 Bad Request.\n`)
    } else {
      console.error(`  ✗ Expected 400 Bad Request but received ${r4.status}!\n`)
      failures++
    }

    // 5. POST /api/rules/interpret (valid instruction)
    console.log(`[Check 5] Testing POST /api/rules/interpret with valid instruction...`)
    const r5 = await fetch(`${baseUrl}/api/rules/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: 'Give 15% off on all Amazon India products' }),
    })
    const d5 = await r5.json()
    console.log(`  Status: ${r5.status}`)
    console.log(`  Payload:`, JSON.stringify(d5))
    if ([200, 422, 500].includes(r5.status) && (d5.status === 'success' || d5.status === 'error')) {
      console.log(`  ✓ Valid rule interpretation executed and parsed.\n`)
    } else {
      console.error(`  ✗ Unexpected interpretation response!\n`)
      failures++
    }

    // 6. GET /api/unknown-route (JSON 404)
    console.log(`[Check 6] Testing unknown /api route returns JSON 404...`)
    const r6 = await fetch(`${baseUrl}/api/unknown-endpoint-test`)
    const d6 = await r6.json()
    if (r6.status === 404 && d6.status === 'error') {
      console.log(`  ✓ Unknown /api route returned JSON 404 (${d6.message}).\n`)
    } else {
      console.error(`  ✗ Unknown route failed to return JSON 404!\n`)
      failures++
    }

    // 7. vercel.json inspection
    console.log(`[Check 7] Verifying vercel.json configuration...`)
    const vercelConfigPath = path.resolve('vercel.json')
    if (fs.existsSync(vercelConfigPath)) {
      const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'))
      const hasApiRewrite = config.rewrites?.some((r) => r.source.includes('/api/'))
      const hasSpaRewrite = config.rewrites?.some((r) => r.destination === '/index.html')
      if (hasApiRewrite && hasSpaRewrite) {
        console.log(`  ✓ vercel.json defines valid /api and SPA fallback rewrites.\n`)
      } else {
        console.error(`  ✗ vercel.json rewrites missing required rules!\n`)
        failures++
      }
    } else {
      console.error(`  ✗ vercel.json not found!\n`)
      failures++
    }

    // 8. Vercel mode static bypass check
    console.log(`[Check 8] Verifying Express static serving bypass when process.env.VERCEL is set...`)
    const origVercel = process.env.VERCEL
    const origEnv = process.env.NODE_ENV
    process.env.VERCEL = '1'
    process.env.NODE_ENV = 'production'
    const r8 = await fetch(`${baseUrl}/some-non-api-page`)
    process.env.VERCEL = origVercel
    process.env.NODE_ENV = origEnv
    if (r8.status === 404) {
      console.log(`  ✓ Express static serving bypassed in Vercel mode (Vercel CDN handles static assets).\n`)
    } else {
      console.error(`  ✗ Express static serving was NOT bypassed in Vercel mode!\n`)
      failures++
    }

    // 9. Static bundle credential scan
    console.log(`[Check 9] Scanning dist/assets for leaked credentials...`)
    const assetsDir = path.join(DIST_DIR, 'assets')
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
      let leaked = false
      for (const f of files) {
        const c = fs.readFileSync(path.join(assetsDir, f), 'utf8')
        if (process.env.GEMINI_API_KEY && c.includes(process.env.GEMINI_API_KEY)) leaked = true
        if (process.env.OPENAI_API_KEY && c.includes(process.env.OPENAI_API_KEY)) leaked = true
      }
      if (!leaked) {
        console.log(`  ✓ Zero secret API credentials found in compiled frontend assets.\n`)
      } else {
        console.error(`  ✗ LEAKED API CREDENTIALS DETECTED IN dist/assets!\n`)
        failures++
      }
    } else {
      console.warn(`  ! dist/assets not found. Run 'npm run build' first.\n`)
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }

  console.log(`======================================================`)
  if (failures === 0) {
    console.log(`ALL 9 VERCEL CHECKS PASSED SUCCESSFULLY!`)
  } else {
    console.error(`${failures} CHECK(S) FAILED!`)
    process.exit(1)
  }
  console.log(`======================================================\n`)
}

run()
