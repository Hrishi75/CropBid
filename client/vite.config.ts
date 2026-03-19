import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // PROXY CONFIGURATION — This is key for development!
    //
    // WHY? During development:
    //   - React runs on port 5173 (Vite dev server)
    //   - Express runs on port 5000
    //   - Browsers block cross-origin requests by default
    //
    // The proxy makes /api/health from the browser hit Express transparently.
    // In the browser, you just call fetch('/api/health') — no port number needed.
    // Vite intercepts it and forwards to Express on port 5000.
    //
    // In production, both would be served from the same origin, so no proxy needed.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true, // WebSocket support for Socket.io
        changeOrigin: true,
      },
    },
  },
})
