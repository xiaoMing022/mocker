import { createProxyMiddleware } from "http-proxy-middleware"

import { isProxyActive, isValidHttpUrl } from "./config-store.js"
import { applyCorsHeaders } from "./cors.js"
import { resolveProxyTarget } from "./match.js"
import { flattenHeaders, normalizeHeaderMap } from "./util/headers.js"

export { flattenHeaders, normalizeHeaderMap }

/** Hop-by-hop / unsafe headers that must not be re-forwarded as-is. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Host is set by changeOrigin to the upstream host
  "host",
  // Will be recomputed when we re-write a parsed JSON body
  "content-length",
])

/**
 * Apply client + extra headers onto the outgoing proxy request.
 * Order: client headers (full) → env headers → route headers (later wins).
 *
 * @param {import("http").ClientRequest} proxyReq
 * @param {import("http").IncomingMessage & { headers: import("http").IncomingHttpHeaders, body?: unknown }} req
 * @param {{
 *   extraHeaders?: Record<string, string>,
 *   rewriteJsonBody?: boolean,
 *   targetHost?: string,
 * }} [options]
 */
export function applyProxyRequestHeaders(proxyReq, req, options = {}) {
  const client = flattenHeaders(req.headers)
  const extra = normalizeHeaderMap(options.extraHeaders)

  /** @type {Record<string, string>} */
  const merged = {}
  for (const [k, v] of Object.entries(client)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    merged[k] = v
  }
  for (const [k, v] of Object.entries(extra)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    // Preserve original casing preference of extra keys; overwrite case-insensitively
    const lower = k.toLowerCase()
    for (const existing of Object.keys(merged)) {
      if (existing.toLowerCase() === lower) delete merged[existing]
    }
    merged[k] = v
  }

  // Keep Host set by changeOrigin (or explicit targetHost) after rebuild.
  const previousHost =
    options.targetHost ||
    proxyReq.getHeader("host") ||
    proxyReq.getHeader("Host")

  for (const name of proxyReq.getHeaderNames()) {
    proxyReq.removeHeader(name)
  }
  for (const [k, v] of Object.entries(merged)) {
    try {
      proxyReq.setHeader(k, v)
    } catch {
      /* ignore invalid header names */
    }
  }
  if (previousHost) {
    proxyReq.setHeader("host", previousHost)
  }

  const method = String(req.method || "GET").toUpperCase()
  const canHaveBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method)
  if (
    options.rewriteJsonBody !== false &&
    canHaveBody &&
    req.body !== undefined &&
    req.body !== null
  ) {
    const contentType =
      merged["content-type"] ||
      merged["Content-Type"] ||
      req.headers["content-type"] ||
      ""
    if (String(contentType).includes("application/json")) {
      const body = JSON.stringify(req.body)
      proxyReq.setHeader("Content-Type", "application/json")
      proxyReq.setHeader("Content-Length", Buffer.byteLength(body))
      proxyReq.write(body)
    }
  }
}

/**
 * Resolve extra headers for a proxied request: env-level + matching route proxyHeaders.
 * @param {{
 *   envHeaders?: Record<string, string>,
 *   method: string,
 *   path: string,
 *   routes?: Array<{ method: string, path: string, proxyHeaders?: Record<string, string> }>,
 * }} opts
 */
export function resolveProxyExtraHeaders(opts) {
  /** @type {Record<string, string>} */
  const extra = { ...normalizeHeaderMap(opts.envHeaders) }
  const method = String(opts.method || "GET").toUpperCase()
  const reqPath = opts.path || "/"
  const routes = opts.routes || []
  const hit = routes.find(
    (r) =>
      String(r.method || "").toUpperCase() === method &&
      String(r.path || "") === reqPath,
  )
  if (hit?.proxyHeaders) {
    Object.assign(extra, normalizeHeaderMap(hit.proxyHeaders))
  }
  return extra
}

/**
 * @param {{
 *   slug: string,
 *   enabled: boolean,
 *   target: string,
 *   rules?: Array<{ pathPrefix: string, target?: string, enabled?: boolean }>,
 *   headers?: Record<string, string>,
 *   getRoutes?: () => Array<{ method: string, path: string, proxyHeaders?: Record<string, string> }>,
 * }} options
 */
export function createProxyFallback({
  slug,
  enabled,
  target,
  rules = [],
  headers = {},
  getRoutes,
}) {
  /** @type {Map<string, ReturnType<typeof createProxyMiddleware>>} */
  const proxyByTarget = new Map()

  function getProxy(resolvedTarget) {
    let proxy = proxyByTarget.get(resolvedTarget)
    if (proxy) return proxy

    proxy = createProxyMiddleware({
      target: resolvedTarget,
      changeOrigin: true,
      pathFilter: () => true,
      on: {
        proxyReq(proxyReq, reqInner) {
          const reqPath =
            // @ts-expect-error express
            reqInner.path ||
            String(reqInner.url || "/").split("?")[0] ||
            "/"
          const method = reqInner.method || "GET"
          const routes = typeof getRoutes === "function" ? getRoutes() : []
          const extraHeaders = resolveProxyExtraHeaders({
            envHeaders: headers,
            method,
            path: reqPath,
            routes,
          })
          let targetHost
          try {
            targetHost = new URL(resolvedTarget).host
          } catch {
            targetHost = undefined
          }
          applyProxyRequestHeaders(proxyReq, reqInner, {
            extraHeaders,
            rewriteJsonBody: true,
            targetHost,
          })
        },
        proxyRes(proxyRes, reqInner, resInner) {
          resInner.locals.mockSource = "proxy"
          resInner.locals.proxyTarget = resolvedTarget
          // Upstream CORS targets the real host; rewrite for browser → mock.
          applyCorsHeaders(reqInner, resInner, proxyRes)
        },
        error(err, reqInner, resInner) {
          if (resInner.headersSent) return
          resInner.locals.mockSource = "proxy"
          applyCorsHeaders(reqInner, resInner)
          resInner.status(502).json({
            code: 502,
            message: `Proxy error for project "${slug}": ${err.message}`,
            data: {
              project: slug,
              target: resolvedTarget,
              method: reqInner.method,
              path: reqInner.path,
            },
          })
        },
      },
    })
    proxyByTarget.set(resolvedTarget, proxy)
    return proxy
  }

  return function proxyOrMiss(req, res, next) {
    const resolved = resolveProxyTarget(req.path, rules, { enabled, target })

    const active = isProxyActive(resolved.enabled, resolved.target)

    if (!active) {
      const reason =
        resolved.rule && resolved.rule.enabled === false
          ? `proxy rule disabled for ${resolved.rule.pathPrefix}`
          : enabled && target && !isValidHttpUrl(target)
            ? "proxy target is invalid"
            : enabled && !target
              ? "proxy target is empty"
              : resolved.target && !isValidHttpUrl(resolved.target)
                ? "proxy rule target is invalid"
                : "proxy disabled"

      res.locals.mockSource = "miss"
      res.status(404).json({
        code: 404,
        message: `No mock route for ${req.method} ${req.path} (${reason})`,
        data: {
          project: slug,
          method: req.method,
          path: req.path,
        },
      })
      return
    }

    return getProxy(resolved.target)(req, res, next)
  }
}
