/**
 * Browser-friendly CORS for mock project apps.
 *
 * SoulX (and most SPAs) call fetch with credentials: 'include'. Browsers then
 * require a concrete Allow-Origin (not *) plus Allow-Credentials: true.
 * Custom request headers (e.g. sso-version) must appear in Allow-Headers.
 */

const BASE_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Session-Token",
  "X-Requested-With",
  "Idempotency-Key",
  // SoulX http_utils default request headers
  "sso-version",
  "soul-request-type",
]

const DEFAULT_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

/**
 * Resolve Access-Control-Allow-Origin for a request.
 * Prefer reflecting the request Origin so credentialed cross-origin works.
 * @param {import("http").IncomingMessage} req
 */
export function resolveAllowOrigin(req) {
  const configured = process.env.CORS_ORIGIN?.trim()
  if (configured && configured !== "*") {
    return configured
  }

  const origin = req.headers?.origin
  if (typeof origin === "string" && origin) {
    return origin
  }

  // Non-browser / same-origin tooling
  return configured || "*"
}

/**
 * Merge base allow-list with preflight Access-Control-Request-Headers.
 * @param {import("http").IncomingMessage} req
 */
export function resolveAllowHeaders(req) {
  const requested = req.headers?.["access-control-request-headers"]
  const extras =
    typeof requested === "string"
      ? requested.split(",").map((h) => h.trim()).filter(Boolean)
      : []

  const merged = new Map()
  for (const h of [...BASE_ALLOW_HEADERS, ...extras]) {
    merged.set(h.toLowerCase(), h)
  }
  return [...merged.values()].join(", ")
}

/**
 * Apply CORS headers onto a Node response (Express or raw).
 * Safe to call multiple times; overwrites upstream proxy CORS if present.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {{ headers?: Record<string, string | number | string[] | undefined> } | null} [proxyRes]
 */
export function applyCorsHeaders(req, res, proxyRes = null) {
  const allowOrigin = resolveAllowOrigin(req)
  const allowHeaders = resolveAllowHeaders(req)

  // Drop upstream CORS so they cannot conflict with local ones.
  if (proxyRes?.headers) {
    for (const key of Object.keys(proxyRes.headers)) {
      if (key.toLowerCase().startsWith("access-control-")) {
        delete proxyRes.headers[key]
      }
    }
  }

  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Headers", allowHeaders)
    res.setHeader("Access-Control-Allow-Methods", DEFAULT_ALLOW_METHODS)
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Mock-Route, X-Mock-Scenario, X-Mock-Scenario-Name, Authorization",
    )
    // Also write onto proxyRes so http-proxy-middleware forwards our values.
    if (proxyRes?.headers) {
      proxyRes.headers["access-control-allow-origin"] = allowOrigin
      proxyRes.headers["access-control-allow-credentials"] = "true"
      proxyRes.headers["access-control-allow-headers"] = allowHeaders
      proxyRes.headers["access-control-allow-methods"] = DEFAULT_ALLOW_METHODS
    }
    if (allowOrigin !== "*") {
      res.setHeader("Vary", "Origin")
    }
  }
}

/**
 * Express middleware: CORS + short-circuit OPTIONS.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function corsMiddleware(req, res, next) {
  applyCorsHeaders(req, res)

  if (req.method === "OPTIONS") {
    res.status(204).send()
    return
  }

  next()
}
