import { createProxyMiddleware } from "http-proxy-middleware"

import { isProxyActive, isValidHttpUrl } from "./config-store.js"

/**
 * @param {{ slug: string, enabled: boolean, target: string }} options
 */
export function createProxyFallback({ slug, enabled, target }) {
  const active = isProxyActive(enabled, target)

  if (!active) {
    return function unmatchedHandler(req, res) {
      const reason =
        enabled && target && !isValidHttpUrl(target)
          ? "proxy target is invalid"
          : enabled && !target
            ? "proxy target is empty"
            : "proxy disabled"

      res.status(404).json({
        code: 404,
        message: `No mock route for ${req.method} ${req.path} (${reason})`,
        data: {
          project: slug,
          method: req.method,
          path: req.path,
        },
      })
    }
  }

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    // Express 5 / path-to-regexp v8 rejects bare "*" ; match any remaining path
    pathFilter: () => true,
    on: {
      proxyReq(proxyReq, req) {
        // express.json() consumed the stream; re-send parsed body for JSON requests
        if (
          req.body !== undefined &&
          req.body !== null &&
          (req.method === "POST" ||
            req.method === "PUT" ||
            req.method === "PATCH" ||
            req.method === "DELETE")
        ) {
          const contentType = req.headers["content-type"] ?? ""
          if (contentType.includes("application/json")) {
            const body = JSON.stringify(req.body)
            proxyReq.setHeader("Content-Type", "application/json")
            proxyReq.setHeader("Content-Length", Buffer.byteLength(body))
            proxyReq.write(body)
          }
        }
      },
      error(err, req, res) {
        if (res.headersSent) return
        res.status(502).json({
          code: 502,
          message: `Proxy error for project "${slug}": ${err.message}`,
          data: {
            project: slug,
            target,
            method: req.method,
            path: req.path,
          },
        })
      },
    },
  })

  return proxy
}
