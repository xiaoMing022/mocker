import { createAdminApp } from "./admin/app.js"
import { resolveAdminPort } from "./core/config-store.js"
import { createProjectManager } from "./core/project-manager.js"
import { projects as codeProjects } from "./projects/index.js"

const manager = createProjectManager({ codeProjects })

await manager.startAll()

const config = manager.getConfig()
const adminPort = resolveAdminPort(config)
const adminApp = createAdminApp({ manager })

const adminServer = adminApp.listen(adminPort, () => {
  console.log(`Admin console listening on http://localhost:${adminPort}`)
  console.log(`Config API: http://localhost:${adminPort}/__mock/projects`)
})

adminServer.on("error", (error) => {
  console.error(`[admin] failed to listen on ${adminPort}: ${error.message}`)
  process.exit(1)
})

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`)
  await new Promise((resolve) => {
    adminServer.close(() => resolve())
    setTimeout(() => resolve(), 2000).unref?.()
  })
  await manager.stopAll()
  process.exit(0)
}

process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
