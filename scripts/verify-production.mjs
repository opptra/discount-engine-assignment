/**
 * scripts/verify-production.mjs
 *
 * Standalone verification runner for Phase 4.3.
 * Boots the Express production server on port 3001, performs live HTTP requests,
 * prints the exact HTTP response statuses, headers, and payloads, then exits cleanly.
 */

import { app, DIST_DIR, INDEX_HTML } from '../server/index.js'
import fs from 'fs'
import path from 'path'

process.env.NODE_ENV = 'production'
const PORT = 3001

const server = app.listen(PORT, async () => {
  console.log(`\n======================================================`)
  console.log(`[Production Server Verification] Listening on http://localhost:${PORT}`)
  console.log(`======================================================\n`)

  try {
    // 1. GET /
    const r1 = await fetch(`http://localhost:${PORT}/`)
    const t1 = await r1.text()
    console.log(`[Check 1] GET /`)
    console.log(`Status: ${r1.status}`)
    console.log(`Content-Type: ${r1.headers.get('content-type')}`)
    console.log(`Body preview: ${t1.slice(0, 150)}...\n`)

    // 2. GET /assets/...
    const indexHtml = fs.readFileSync(INDEX_HTML, 'utf8')
    const jsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/)
    const cssMatch = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/)

    if (jsMatch) {
      const rJs = await fetch(`http://localhost:${PORT}${jsMatch[1]}`)
      console.log(`[Check 2A] GET ${jsMatch[1]}`)
      console.log(`Status: ${rJs.status}`)
      console.log(`Content-Type: ${rJs.headers.get('content-type')}\n`)
    }

    if (cssMatch) {
      const rCss = await fetch(`http://localhost:${PORT}${cssMatch[1]}`)
      console.log(`[Check 2B] GET ${cssMatch[1]}`)
      console.log(`Status: ${rCss.status}`)
      console.log(`Content-Type: ${rCss.headers.get('content-type')}\n`)
    }

    // 3. GET /api/health
    const r3 = await fetch(`http://localhost:${PORT}/api/health`)
    const d3 = await r3.json()
    console.log(`[Check 3] GET /api/health`)
    console.log(`Status: ${r3.status}`)
    console.log(`Payload:`, JSON.stringify(d3), '\n')

    // 4. POST /api/rules/interpret (validation check)
    const r4 = await fetch(`http://localhost:${PORT}/api/rules/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: '' }),
    })
    const d4 = await r4.json()
    console.log(`[Check 4] POST /api/rules/interpret (Input validation)`)
    console.log(`Status: ${r4.status}`)
    console.log(`Payload:`, JSON.stringify(d4), '\n')

    // 5. GET /api/unknown-route (JSON 404 check)
    const r5 = await fetch(`http://localhost:${PORT}/api/unknown-route`)
    const d5 = await r5.json()
    console.log(`[Check 5] GET /api/unknown-route (JSON 404)`)
    console.log(`Status: ${r5.status}`)
    console.log(`Content-Type: ${r5.headers.get('content-type')}`)
    console.log(`Payload:`, JSON.stringify(d5), '\n')

    // 6. GET /cart (SPA route refresh check)
    const r6 = await fetch(`http://localhost:${PORT}/cart`)
    const t6 = await r6.text()
    console.log(`[Check 6] GET /cart (SPA Client Routing Fallback)`)
    console.log(`Status: ${r6.status}`)
    console.log(`Contains #root: ${t6.includes('id="root"')}\n`)

    // 7. POST /api/rules/interpret (Live interpretation check)
    console.log(`[Check 7] POST /api/rules/interpret (Live rule interpretation)...`)
    const r7 = await fetch(`http://localhost:${PORT}/api/rules/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: 'Give 15% off on all Natura Casa products' }),
    })
    const d7 = await r7.json()
    console.log(`Status: ${r7.status}`)
    console.log(`Payload:`, JSON.stringify(d7), '\n')

    // 8. Credentials check in dist/
    const assetsDir = path.join(DIST_DIR, 'assets')
    const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
    let leaked = false
    for (const f of files) {
      const c = fs.readFileSync(path.join(assetsDir, f), 'utf8')
      if (process.env.GEMINI_API_KEY && c.includes(process.env.GEMINI_API_KEY)) leaked = true
      if (process.env.OPENAI_API_KEY && c.includes(process.env.OPENAI_API_KEY)) leaked = true
    }
    console.log(`[Check 8] Secret API Key Leakage Scan in dist/assets`)
    console.log(`Leaked credentials in frontend bundle: ${leaked ? 'YES (FAIL)' : 'NO (PASSED)'}\n`)

    console.log(`All 8 production checks executed successfully!`)
  } catch (err) {
    console.error('Production check error:', err)
  } finally {
    server.close(() => process.exit(0))
  }
})
