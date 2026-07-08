import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { unityBrotliHeaders } from "./vite.config.unity-snippet";


export default defineConfig({
  plugins:[react(), unityBrotliHeaders()], // ← agregado unityBrotliHeaders()
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
