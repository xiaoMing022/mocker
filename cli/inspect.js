import { normalizeTags } from "../server/core/route-store.js"

/**
 * Compact project row for `mocker project list`.
 * @param {Record<string, any>} project
 */
export function summarizeProject(project) {
  return {
    slug: project.slug,
    name: project.name,
    status: project.status,
    port: project.port,
    url: project.url ?? null,
    enabled: Boolean(project.enabled),
    activeEnvironment: project.activeEnvironment || null,
    routeCount: project.routeCount ?? 0,
    enabledRouteCount: project.enabledRouteCount ?? 0,
    warning: project.warning ?? null,
    lastError: project.lastError ?? null,
  }
}

/**
 * @param {Record<string, any>} scenario
 * @param {string | undefined} activeId
 */
function summarizeScenario(scenario, activeId) {
  return {
    name: scenario.name,
    origin: scenario.origin === "spec" ? "spec" : "console",
    tags: Array.isArray(scenario.tags) ? scenario.tags : [],
    statusCode: scenario.statusCode,
    active: Boolean(activeId && scenario.id === activeId),
  }
}

/**
 * Compact route row for `mocker route list`. Response bodies stay on `route get`.
 * @param {Record<string, any>} route
 */
export function summarizeRoute(route) {
  const scenarios = Array.isArray(route.scenarios) ? route.scenarios : []
  const active =
    scenarios.find((scenario) => scenario.id === route.activeScenarioId) || scenarios[0] || null
  return {
    method: route.method,
    path: route.path,
    name: route.name || "",
    enabled: route.enabled !== false,
    active: active ? summarizeScenario(active, active.id) : null,
    scenarios: scenarios.map((scenario) => summarizeScenario(scenario, active?.id)),
  }
}

/**
 * @param {Record<string, any>} route
 * @param {string} tag
 * @returns {{ ok: true, scenario: Record<string, any> } | { ok: false, message: string, scenarios: string[] }}
 */
export function selectScenarioByTag(route, tag) {
  const want = String(tag || "").trim().toLowerCase()
  const matches = (route?.scenarios || []).filter(
    (scenario) => Array.isArray(scenario.tags) && scenario.tags.includes(want),
  )
  if (matches.length === 1) return { ok: true, scenario: matches[0] }
  if (!matches.length) {
    return { ok: false, message: `no scenario tagged ${want}`, scenarios: [] }
  }
  return {
    ok: false,
    message: `tag ${want} matches more than one scenario`,
    scenarios: matches.map((scenario) => scenario.name),
  }
}

/**
 * @param {unknown} current
 * @param {string[]} add
 * @param {string[]} remove
 */
export function editTags(current, add = [], remove = []) {
  const removed = new Set(normalizeTags(remove))
  const kept = normalizeTags(current).filter((tag) => !removed.has(tag))
  return normalizeTags([...kept, ...normalizeTags(add)])
}

/**
 * @param {unknown} route
 * @param {string} tag
 */
export function routeHasTag(route, tag) {
  const want = String(tag || "").trim().toLowerCase()
  if (!want) return true
  return (route?.scenarios || []).some(
    (scenario) => Array.isArray(scenario.tags) && scenario.tags.includes(want),
  )
}
