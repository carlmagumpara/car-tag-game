import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base keeps the same build working at a GitHub Pages project URL
// (https://<user>.github.io/<repo>/) and at a local dev/preview root.
// Override with VITE_BASE_PATH when deploying to a custom-domain root.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
