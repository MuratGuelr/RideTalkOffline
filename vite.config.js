import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import localSignalingPlugin from './vite-plugin-signaling.js'

export default defineConfig({
  plugins: [
    react(),
    localSignalingPlugin(),
  ],
  server: {
    host: true,
    port: 5173,
  },
})
