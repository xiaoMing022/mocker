import { createProxyMiddleware } from "http-proxy-middleware"

import { isProxyActive, isValidHttpUrl } from "./config-store.js"
import { resolveProxyTarget } from "./match.js"

/**
 * @param {{
 *   slug: string,
 *   enabled: boolean,
 *   target: string,
 *   rules?: Array<{ pathPrefix: string, target?: string, enabled?: boolean }>
 * }} options
 */
export function createProxyFallback({ slug, enabled, target, rules = [] }) {
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
          if (
            reqInner.body !== undefined &&
            reqInner.body !== null &&
            (reqInner.method === "POST" ||
              reqInner.method === "PUT" ||
              reqInner.method === "PATCH" ||
              reqInner.method === "DELETE")
          ) {
            const contentType = reqInner.headers["content-type"] ?? ""
            if (contentType.includes("application/json")) {
              const body = JSON.stringify(reqInner.body)
              proxyReq.setHeader("Content-Type", "application/json")
              proxyReq.setHeader("Content-Length", Buffer.byteLength(body))
              proxyReq.write(body)
            }
          }
        },
        proxyRes(proxyRes, reqInner, resInner) {
          resInner.locals.mockSource = "proxy"
          resInner.locals.proxyTarget = resolvedTarget
        },
        error(err, reqInner, resInner) {
          if (resInner.headersSent) return
          resInner.locals.mockSource = "proxy"
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
