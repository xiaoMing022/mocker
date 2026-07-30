import express from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { registerAdminRoutes } from "./routes.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const consoleDir = path.join(rootDir, "public", "console")

/**
 * @param {{
 *   manager: ReturnType<import("../core/project-manager.js").createProjectManager>
 * }} options
 */
export function createAdminApp({ manager }) {
  const app = express()

  app.use(express.json())

  registerAdminRoutes(app, { manager })

  app.use(express.static(consoleDir))

  app.get("/", (_req, res) => {
    res.sendFile(path.join(consoleDir, "index.html"))
  })

  return app
}
