import { sendJson } from "../lib/http.js"
import { getActiveScenario } from "./route-store.js"

/**
 * @param {{
 *   getRoutes: () => import("./route-store.js").DynamicRoute[]
 * }} options
 */
export function createDynamicRoutesMiddleware({ getRoutes }) {
  return async function dynamicRoutesMiddleware(req, res, next) {
    const method = req.method.toUpperCase()
    const reqPath = req.path

    const routes = getRoutes()
    const hit = routes.find(
      (r) => r.enabled && r.method === method && r.path === reqPath,
    )

    if (!hit) {
      next()
      return
    }

    const scenario = getActiveScenario(hit)
    if (!scenario) {
      next()
      return
    }

    res.locals.mockSource = "dynamic"
    res.locals.mockRouteId = hit.id
    res.locals.mockScenarioId = scenario.id
    res.locals.mockScenarioName = scenario.name
    res.locals.mockRouteName = hit.name || `${hit.method} ${hit.path}`

    for (const [key, value] of Object.entries(scenario.headers || {})) {
      res.setHeader(key, value)
    }
    res.setHeader("X-Mock-Route", hit.id)
    res.setHeader("X-Mock-Scenario", scenario.id)
    if (scenario.name) {
      res.setHeader("X-Mock-Scenario-Name", encodeURIComponent(scenario.name))
    }

    await sendJson(res, scenario.response, scenario.statusCode, scenario.delayMs)
  }
}
