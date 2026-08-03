import { sendJson } from "../lib/http.js"
import { sendSse } from "../lib/sse.js"
import { hasMatchRules, pickScenario, scenarioMatches } from "./match.js"

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

    /** @type {Record<string, string>} */
    const flatHeaders = {}
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (v == null) continue
      flatHeaders[k.toLowerCase()] = Array.isArray(v) ? String(v[0]) : String(v)
    }
    /** @type {Record<string, string>} */
    const flatQuery = {}
    for (const [k, v] of Object.entries(req.query || {})) {
      if (v == null) continue
      flatQuery[k] = Array.isArray(v) ? String(v[0]) : String(v)
    }

    const reqCtx = {
      headers: flatHeaders,
      query: flatQuery,
      body: req.body,
    }
    const scenario = pickScenario(hit, reqCtx)

    if (!scenario) {
      next()
      return
    }

    const matchedByCondition = Boolean(
      scenario.match &&
        hasMatchRules(scenario.match) &&
        scenarioMatches(scenario.match, reqCtx),
    )

    res.locals.mockSource = "dynamic"
    res.locals.mockRouteId = hit.id
    res.locals.mockScenarioId = scenario.id
    res.locals.mockScenarioName = scenario.name
    res.locals.mockRouteName = hit.name || `${hit.method} ${hit.path}`
    res.locals.mockMatchedByCondition = matchedByCondition

    const mockHeaders = {
      "X-Mock-Route": hit.id,
      "X-Mock-Scenario": scenario.id,
    }
    if (scenario.name) {
      mockHeaders["X-Mock-Scenario-Name"] = encodeURIComponent(scenario.name)
    }

    if (scenario.mode === "sse") {
      // Do not use req "close" — it fires after the body is read, not only on abort.
      const abort = { aborted: false }
      const onResClose = () => {
        if (!res.writableFinished) abort.aborted = true
      }
      res.on("close", onResClose)
      try {
        await sendSse(res, {
          statusCode: scenario.statusCode,
          delayMs: scenario.delayMs,
          headers: { ...scenario.headers, ...mockHeaders },
          stream: scenario.stream || { events: [] },
          signal: abort,
        })
      } finally {
        res.off("close", onResClose)
      }
      return
    }

    for (const [key, value] of Object.entries(scenario.headers || {})) {
      res.setHeader(key, value)
    }
    for (const [key, value] of Object.entries(mockHeaders)) {
      res.setHeader(key, value)
    }

    await sendJson(res, scenario.response, scenario.statusCode, scenario.delayMs)
  }
}
