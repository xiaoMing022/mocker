import express from "express"

import { corsMiddleware } from "./cors.js"
import { createDynamicRoutesMiddleware } from "./dynamic-routes.js"
import { pickLogHeaders, truncateJson } from "./match.js"
import { createProxyFallback } from "./proxy.js"

/**
 * @param {{
 *   project: { slug: string, createRouter: () => import("express").Router },
 *   runtime: {
 *     proxy: {
 *       enabled: boolean,
 *       target: string,
 *       rules?: Array<{ pathPrefix: string, target?: string, enabled?: boolean }>,
 *       headers?: Record<string, string>
 *     }
 *   },
 *   getRoutes: () => import("./route-store.js").DynamicRoute[],
 *   onRequestLog?: (entry: object) => void
 * }} options
 */
export function createProjectApp({ project, runtime, getRoutes, onRequestLog }) {
  const app = express()

  app.use(corsMiddleware)
  app.use(express.json({ limit: "10mb" }))

  app.use(function requestLogMiddleware(req, res, next) {
    const started = Date.now()

    // Capture response body for logs
    const originalJson = res.json.bind(res)
    res.json = function jsonWithCapture(body) {
      res.locals.responseBody = truncateJson(body)
      return originalJson(body)
    }

    res.on("finish", () => {
      if (!onRequestLog) return
      if (req.method === "OPTIONS") return

      const source = res.locals.mockSource || (res.statusCode === 404 ? "miss" : "code")

      /** @type {Record<string, string>} */
      const query = {}
      for (const [k, v] of Object.entries(req.query || {})) {
        if (v == null) continue
        query[k] = Array.isArray(v) ? String(v[0]) : String(v)
      }

      onRequestLog({
        method: req.method,
        path: req.originalUrl?.split("?")[0] || req.path,
        routePath: res.locals.mockRoutePath || null,
        query: Object.keys(query).length ? query : null,
        requestHeaders: pickLogHeaders(req.headers),
        requestBody:
          req.body !== undefined && req.body !== null && Object.keys(req.body || {}).length
            ? truncateJson(req.body)
            : req.body !== undefined && req.body !== null && typeof req.body !== "object"
              ? truncateJson(req.body)
              : null,
        responseBody: res.locals.responseBody ?? null,
        status: res.statusCode,
        durationMs: Date.now() - started,
        source,
        scenarioName: res.locals.mockScenarioName || null,
        scenarioOrigin: res.locals.mockScenarioOrigin || null,
        routeName: res.locals.mockRouteName || null,
        matchedByCondition: Boolean(res.locals.mockMatchedByCondition),
        proxyTarget: res.locals.proxyTarget || null,
      })
    })

    next()
  })

  app.use(createDynamicRoutesMiddleware({ getRoutes }))

  const router = project.createRouter()
  app.use(router)

  app.use(
    createProxyFallback({
      slug: project.slug,
      enabled: runtime.proxy.enabled,
      target: runtime.proxy.target,
      rules: runtime.proxy.rules || [],
      headers: runtime.proxy.headers || {},
      getRoutes,
    }),
  )

  return app
}
