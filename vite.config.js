import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { app } from './server/index.js'

export default defineConfig({
  cacheDir: './.vite',
  plugins: [
    react(),
    {
      name: 'api-server-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/api')) {
            return app(req, res, next)
          }
          next()
        })
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      // Fallback proxy in case backend is run on port 3001
      '/api-standalone': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
