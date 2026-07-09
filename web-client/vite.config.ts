import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { unityBrotliHeaders } from "./vite.config.unity-snippet";


export default defineConfig({
  plugins:[react(), unityBrotliHeaders()], // ← agregado unityBrotliHeaders()
  server: {
    port: 5173,
    host: true, // escuchar en 0.0.0.0 para poder probar desde el Quest en la misma red
    // Sin esto Vite responde 403 cuando entrás por un dominio ngrok (Host distinto de localhost).
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io"],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
