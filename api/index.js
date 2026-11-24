/**
 * api/index.js
 *
 * Vercel Serverless Function entry point for the Opptra Discount Engine API.
 * Mounts the Express application to handle /api/health and /api/rules/* routes.
 *
 * On Vercel, static frontend assets are served directly from dist/ by Vercel CDN,
 * while API requests are routed to this serverless function.
 */

import { app } from '../server/index.js'

export default function handler(req, res) {
  // Normalize req.url to guarantee the /api prefix is preserved for Express routing
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url === '/' ? '' : req.url}`
  }
  return app(req, res)
}
