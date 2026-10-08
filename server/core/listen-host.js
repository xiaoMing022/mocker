/**
 * Admin and project ports bind here.
 * Unset means loopback. `ADMIN_HOST` overrides both.
 * An empty string means Node's default: all interfaces.
 * @param {string | undefined} explicit runtime option, when the caller already chose
 */
export function resolveListenHost(explicit) {
  if (explicit !== undefined) return explicit
  if (process.env.ADMIN_HOST !== undefined) return process.env.ADMIN_HOST
  return "127.0.0.1"
}

/**
 * @param {import("express").Express} app
 * @param {number} port
 * @param {string | undefined} host
 * @returns {Promise<import("node:http").Server>}
 */
export function listenOn(app, port, host) {
  return new Promise((resolve, reject) => {
    const onListen = () => resolve(server)
    const server =
      host !== undefined && host !== ""
        ? app.listen(port, host, onListen)
        : app.listen(port, onListen)
    server.once("error", (error) => {
      try {
        server.close()
      } catch {
        /* ignore */
      }
      reject(error)
    })
  })
}
