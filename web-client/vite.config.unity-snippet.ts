// Agregar este plugin a tu vite.config.ts existente (dentro del array `plugins`).
// Sin esto, el dev server de Vite sirve los .br sin Content-Encoding: br
// y Unity falla en silencio (canvas negro, sin error en consola).

import type { Plugin } from "vite";

export function unityBrotliHeaders(): Plugin {
  return {
    name: "unity-brotli-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes("/unity-build/")) return next();

        if (req.url.endsWith(".br")) {
          res.setHeader("Content-Encoding", "br");
          if (req.url.includes(".wasm")) {
            res.setHeader("Content-Type", "application/wasm");
          } else if (req.url.includes(".js")) {
            res.setHeader("Content-Type", "application/javascript");
          } else {
            res.setHeader("Content-Type", "application/octet-stream");
          }
        }
        next();
      });
    },
  };
}

// En vite.config.ts:
//
// import { unityBrotliHeaders } from "./vite.config.unity-snippet";
//
// export default defineConfig({
//   plugins: [react(), unityBrotliHeaders()],
// });