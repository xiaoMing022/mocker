import express from "express"

import { createDynamicRoutesMiddleware } from "./dynamic-routes.js"
import { createProxyFallback } from "./proxy.js"

/**
 * @param {{
 *   project: { slug: string, createRouter: () => import("express").Router },
 *   runtime: { proxy: { enabled: boolean, target: string } },
 *   getRoutes: () => import("./route-store.js").DynamicRoute[],
 *   onRequestLog?: (entry: {
 *     method: string,
 *     path: string,
 *     status: number | null,
 *     durationMs: number | null,
 *     source: string
 *   }) => void
 * }} options
 */
export function createProjectApp({ project, runtime, getRoutes, onRequestLog }) {
  const app = express()

  app.use(corsMiddleware)
  app.use(express.json({ limit: "10mb" }))

  app.use(function requestLogMiddleware(req, res, next) {
    const started = Date.now()

    res.on("finish", () => {
      if (!onRequestLog) return
      // Skip noisy CORS preflight
      if (req.method === "OPTIONS") return

      const source = res.locals.mockSource || (res.statusCode === 404 ? "miss" : "code")
      onRequestLog({
        method: req.method,
        path: req.originalUrl?.split("?")[0] || req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
        source,
      })
    })

    next()
  })

  // 1) Console dynamic routes (highest priority)
  app.use(createDynamicRoutesMiddleware({ getRoutes }))

  // 2) Code-defined routes
  const router = project.createRouter()
  app.use(router)

  // 3) Proxy or 404 — sets res.locals.mockSource to proxy | miss
  app.use(
    createProxyFallback({
      slug: project.slug,
      enabled: runtime.proxy.enabled,
      target: runtime.proxy.target,
    }),
  )

  return app
}

function corsMiddleware(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*")
  res.setHeader(
    "Access-Control-Allow-Headers",
    ["Content-Type", "Authorization", "X-Session-Token", "X-Requested-With"].join(
      ", ",
    ),
  )
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  )

  if (req.method === "OPTIONS") {
    res.status(204).send()
    return
  }

  next()
}
