import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const BACKEND_PORT = process.env.BACKEND_PORT ?? '4317'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
    },
  },
})
