import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API target is overridable so a second checkout (e.g. a git worktree)
// can run its own server on another port without fighting this one for 5001:
//   VITE_API_PROXY=http://localhost:5002 npm run dev
const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:5001';

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
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        ws: true, // WebSocket support for Socket.io
        changeOrigin: true,
      },
    },
  },
})
