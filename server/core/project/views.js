import { isProxyActive, resolveEffectiveProxy } from "../config-store.js"

/**
 * Build API-facing project view from runtime pieces.
 * @param {{
 *   slug: string,
 *   def: { slug: string, name: string, description?: string, managed?: boolean },
 *   rt: import("../config-store.js").ProjectRuntime,
 *   state: { status: string, lastError: string | null, warning: string | null },
 *   routes: import("../route-store.js").DynamicRoute[],
 *   managed: boolean,
 * }} args
 */
export function buildProjectView({ slug, def, rt, state, routes, managed }) {
  if (!def || !rt || !state) return null

  const effectiveProxy = resolveEffectiveProxy(rt)
  const proxyActive = isProxyActive(effectiveProxy.enabled, effectiveProxy.target)
  let warning = state.warning
  if (effectiveProxy.enabled && !proxyActive) {
    warning =
      warning ||
      (effectiveProxy.target
        ? "proxy enabled but target is invalid; forwarding is off"
        : "proxy enabled but target is empty; forwarding is off")
  }

  // Prefer paused over generic stopped when project is disabled
  let status = state.status
  if (!rt.enabled) {
    status = "paused"
  }

  const environments = {}
  for (const [id, env] of Object.entries(rt.environments || {})) {
    environments[id] = {
      name: env.name,
      proxy: {
        enabled: env.proxy.enabled,
        target: env.proxy.target,
        rules: env.proxy.rules || [],
        headers: env.proxy.headers || {},
      },
    }
  }

  return {
    slug: def.slug || slug,
    name: def.name,
    description: def.description ?? "",
    enabled: rt.enabled,
    paused: !rt.enabled,
    port: rt.port,
    activeEnvironment: rt.activeEnvironment || "default",
    environments,
    proxy: {
      enabled: effectiveProxy.enabled,
      target: effectiveProxy.target,
      active: proxyActive,
      rules: effectiveProxy.rules || [],
      headers: effectiveProxy.headers || {},
    },
    status,
    lastError: state.lastError,
    warning,
    url: status === "listening" ? `http://localhost:${rt.port}` : null,
    routeCount: routes.length,
    enabledRouteCount: routes.filter((r) => r.enabled).length,
    managed,
  }
}
