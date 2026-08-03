import express from "express"
import { existsSync } from "node:fs"
import path from "node:path"

import { getConsoleDir } from "../core/paths.js"
import { registerAdminRoutes } from "./routes.js"

/**
 * @param {{
 *   manager: ReturnType<import("../core/project-manager.js").createProjectManager>
 * }} options
 */
export function createAdminApp({ manager }) {
  const app = express()

  app.use(express.json())

  registerAdminRoutes(app, { manager })

  const consoleDir = getConsoleDir()
  app.use(express.static(consoleDir, { index: false }))

  app.get("/", (_req, res) => {
    sendConsole(res)
  })

  // SPA fallback for non-API GET paths without file extension
  app.get(/^(?!\/__mock(?:\/|$)|\/health$).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next()
      return
    }
    if (path.extname(req.path)) {
      res.status(404).end()
      return
    }
    sendConsole(res)
  })

  return app
}

/** @param {import("express").Response} res */
function sendConsole(res) {
  const consoleIndex = path.join(getConsoleDir(), "index.html")
  if (!existsSync(consoleIndex)) {
    res
      .status(503)
      .type("html")
      .send(
        `<!doctype html><meta charset="utf-8"><title>Mock Server</title>
<body style="font-family:system-ui;padding:2rem;line-height:1.5">
<h1>控制台尚未构建</h1>
<p>请先执行：</p>
<pre style="background:#f5f5f5;padding:1rem;border-radius:8px">npm run build
npm start</pre>
<p>开发时请用：</p>
<pre style="background:#f5f5f5;padding:1rem;border-radius:8px">npm run dev</pre>
<p>然后打开 <a href="http://localhost:5173">http://localhost:5173</a></p>
</body>`,
      )
    return
  }
  res.sendFile(consoleIndex)
}
