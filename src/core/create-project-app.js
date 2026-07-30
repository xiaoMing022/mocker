import express from "express"

import { createProxyFallback } from "./proxy.js"

/**
 * @param {{
 *   project: { slug: string, createRouter: () => import("express").Router },
 *   runtime: { proxy: { enabled: boolean, target: string } }
 * }} options
 */
export function createProjectApp({ project, runtime }) {
  const app = express()

  app.use(corsMiddleware)
  app.use(express.json({ limit: "10mb" }))

  const router = project.createRouter()
  app.use(router)

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
