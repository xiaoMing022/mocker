/**
 * Pick the scenario to activate. Same name: prefer origin spec.
 * @param {{ scenarios?: Array<{ id: string, name: string, origin?: string }> }} route
 * @param {string} name
 */
export function selectScenario(route, name) {
  const matches = (route?.scenarios || []).filter((scenario) => scenario.name === name)
  if (!matches.length) return null
  return matches.find((scenario) => scenario.origin === "spec") || matches[0]
}

/**
 * Each document route activates the first listed scenario name.
 * @param {{ routes?: unknown }} document
 * @returns {{ ok: true, targets: { method: string, path: string, name: string }[] } | { ok: false, message: string }}
 */
export function activationTargets(document) {
  if (!document || !Array.isArray(document.routes) || document.routes.length === 0) {
    return { ok: false, message: "document.routes must be a non-empty array" }
  }
  /** @type {{ method: string, path: string, name: string }[]} */
  const targets = []
  for (let i = 0; i < document.routes.length; i += 1) {
    const route = document.routes[i]
    const method = String(route?.method || "").toUpperCase()
    const routePath = typeof route?.path === "string" ? route.path : ""
    const name = route?.scenarios?.[0]?.name
    if (!method || !routePath.startsWith("/") || typeof name !== "string" || !name.trim()) {
      return {
        ok: false,
        message: `routes[${i}] needs method, a path starting with /, and scenarios[0].name`,
      }
    }
    targets.push({ method, path: routePath, name: name.trim() })
  }
  return { ok: true, targets }
}
