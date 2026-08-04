import { createAdminApp } from "./admin/app.js"
import { ensureConfigSeeded } from "./core/config-seed.js"
import { resolveAdminPort } from "./core/config-store.js"
import { createProjectManager } from "./core/project-manager.js"
import { projects as codeProjects } from "./projects/index.js"

/**
 * @typedef {{
 *   manager: ReturnType<typeof createProjectManager>,
 *   adminPort: number,
 *   adminUrl: string,
 *   adminServer: import("node:http").Server,
 *   stop: () => Promise<void>
 * }} MockRuntime
 */

/**
 * Start project mock ports + admin console/API.
 * Shared by CLI (`server.js`) and Electron main.
 *
 * @param {{
 *   codeProjects?: typeof codeProjects,
 *   host?: string,
 *   onAdminListening?: (info: { port: number, url: string }) => void
 * }} [options] `host` binds admin only; omit for Node default (all interfaces).
 * @returns {Promise<MockRuntime>}
 */
export async function startMockRuntime(options = {}) {
  const host =
    options.host !== undefined
      ? options.host
      : process.env.ADMIN_HOST || undefined
  const projects = options.codeProjects || codeProjects

  ensureConfigSeeded()

  const manager = createProjectManager({ codeProjects: projects })
  await manager.startAll()

  const config = manager.getConfig()
  const adminPort = resolveAdminPort(config)
  const adminApp = createAdminApp({ manager })

  const adminServer = await listen(adminApp, adminPort, host)
  // Always give a loopback URL for opening the console locally.
  const adminUrl = `http://127.0.0.1:${adminPort}`

  console.log(`Admin console listening on ${adminUrl}`)
  if (host) {
    console.log(`Admin bind: ${host}:${adminPort}`)
  }
  console.log(`Config API: ${adminUrl}/__mock/projects`)
  options.onAdminListening?.({ port: adminPort, url: adminUrl })

  let stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    await closeServer(adminServer)
    await manager.stopAll()
  }

  return {
    manager,
    adminPort,
    adminUrl,
    adminServer,
    stop,
  }
}

/**
 * @param {import("express").Express} app
 * @param {number} port
 * @param {string | undefined} host
 * @returns {Promise<import("node:http").Server>}
 */
function listen(app, port, host) {
  return new Promise((resolve, reject) => {
    const onListen = () => resolve(server)
    const server =
      host !== undefined && host !== ""
        ? app.listen(port, host, onListen)
        : app.listen(port, onListen)
    server.once("error", reject)
  })
}

/**
 * @param {import("node:http").Server} server
 */
function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve())
    setTimeout(() => resolve(), 2000).unref?.()
  })
}
