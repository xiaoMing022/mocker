import { sendJson } from "../lib/http.js"

/**
 * @param {{
 *   getRoutes: () => import("./route-store.js").DynamicRoute[]
 * }} options
 */
export function createDynamicRoutesMiddleware({ getRoutes }) {
  return async function dynamicRoutesMiddleware(req, res, next) {
    const method = req.method.toUpperCase()
    // Use path without query; express req.path is pathname
    const reqPath = req.path

    const routes = getRoutes()
    const hit = routes.find(
      (r) => r.enabled && r.method === method && r.path === reqPath,
    )

    if (!hit) {
      next()
      return
    }

    res.locals.mockSource = "dynamic"
    res.locals.mockRouteId = hit.id

    for (const [key, value] of Object.entries(hit.headers || {})) {
      res.setHeader(key, value)
    }

    await sendJson(res, hit.response, hit.statusCode, hit.delayMs)
  }
}
