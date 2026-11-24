/**
 * server/index.js
 *
 * Backend API server for Opptra Discount Engine.
 * Provides secure endpoints for LLM rule interpretation and health monitoring.
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import ruleRoutes from './routes/ruleRoutes.js'

dotenv.config()

export const app = express()
const PORT = process.env.PORT || 3001

// Reliable path resolution relative to this server file (not process.cwd)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const DIST_DIR = path.resolve(__dirname, '../dist')
export const INDEX_HTML = path.join(DIST_DIR, 'index.html')

/**
 * Resolves CORS options based on runtime environment.
 * In development: permits all local origins for seamless DX.
 * In production: enforces FRONTEND_ORIGIN whitelist, while permitting same-origin/server-to-server requests.
 */
export function getCorsOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  const configuredOrigin = process.env.FRONTEND_ORIGIN

  if (!isProd) {
    return { origin: true }
  }

  const allowedOrigins = configuredOrigin
    ? configuredOrigin.split(',').map((o) => o.trim()).filter(Boolean)
    : []

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin without Origin header, curl, server-to-server)
      if (!origin) {
        return callback(null, true)
      }
      // In production, default-deny: origin must be explicitly listed in FRONTEND_ORIGIN whitelist
      if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS policy rejection: origin "${origin}" not permitted by FRONTEND_ORIGIN.`))
    },
  }
}

// Middleware
app.use(cors(getCorsOptions()))
app.use(express.json({ limit: '10kb' })) // Request size protection

// CORS error handler
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS policy rejection')) {
    return res.status(403).json({ status: 'error', message: err.message })
  }
  next(err)
})

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'discount-engine-backend',
    provider: process.env.LLM_PROVIDER || 'gemini',
    hasKey: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
  })
})

// Natural language rule interpretation routes
app.use('/api/rules', ruleRoutes)

// Fallback 404 handler for unknown /api/* routes (guaranteed JSON response, never HTML)
app.use('/api', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl || req.url} not found.`,
  })
})

// ── Production Static File Serving & Frontend SPA Fallback ──────────────────
// When NODE_ENV === 'production' and NOT running on Vercel (where Vercel CDN
// serves static assets from dist/ directly at the edge), serve compiled assets.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    if (!fs.existsSync(DIST_DIR)) {
      return res.status(500).type('text/plain').send(
        "Production build directory (dist/) not found. Please run 'npm run build' before starting the production server."
      )
    }
    return express.static(DIST_DIR)(req, res, next)
  }
  next()
})

// SPA catch-all fallback for unhandled non-API GET requests
// (Express 5 compatible: uses middleware catch-all rather than path-to-regexp wildcard)
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next()
  }

  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    if (fs.existsSync(INDEX_HTML)) {
      return res.sendFile(INDEX_HTML)
    }
    return res.status(500).type('text/plain').send(
      "Production build directory (dist/) not found. Please run 'npm run build' before starting the production server."
    )
  }

  // Development standalone landing page (when accessing port 3001 directly outside Vite)
  if (req.path === '/') {
    return res.type('html').send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 2rem; background: #f7f7f9; color: #131A48;">
          <h2>Opptra Discount Engine — Development API Gateway</h2>
          <p>API gateway is running on port ${PORT}.</p>
          <p>Open the interactive Vite development frontend at: <a href="http://localhost:5173">http://localhost:5173</a></p>
        </body>
      </html>
    `)
  }

  res.status(404).send('Not Found')
})

// Start server ONLY when executed directly as entrypoint, not when imported in tests
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  app.listen(PORT, () => {
    console.log(`[Opptra Backend] Running on http://localhost:${PORT}`)
  })
}
