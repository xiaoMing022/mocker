import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    // Repo root public/console (served by server + packaged desktop)
    outDir: path.resolve(rootDir, "../../public/console"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: {
      "/__mock": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
})
