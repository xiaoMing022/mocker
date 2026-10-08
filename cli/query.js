import { readDocumentTags } from "../server/core/route-store.js"
import { adminFetch, requireProject } from "./commands.js"
import { editTags, routeHasTag, summarizeProject, summarizeRoute } from "./inspect.js"
import { fail, ok } from "./output.js"

/**
 * @param {string} admin
 */
export async function listProjects(admin) {
  const response = await adminFetch(admin, "/__mock/projects")
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ projects: (payload.projects || []).map(summarizeProject) })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 */
export async function getProject(admin, project) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: payload.project })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {"pause" | "resume"} action
 */
export async function setProjectRunning(admin, project, action) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/${action}`, {
    method: "POST",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: summarizeProject(payload.project || {}) })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} id
 */
export async function setProjectEnvironment(admin, project, id) {
  const slug = requireProject(project)
  const environmentId = typeof id === "string" ? id.trim() : ""
  if (!environmentId) fail({ ok: false, message: "mocker project environment requires --id" })
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/environment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: environmentId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({
    project: slug,
    activeEnvironment: payload.project?.activeEnvironment || environmentId,
  })
}

/**
 * @param {string} admin
 * @param {string} slug
 */
export async function fetchRoutes(admin, slug) {
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/routes`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  return payload.routes || []
}

/**
 * @param {Array<Record<string, any>>} routes
 * @param {string} method
 * @param {string} routePath
 */
export function findRoute(routes, method, routePath) {
  const verb = String(method || "").toUpperCase()
  const path = typeof routePath === "string" ? routePath : ""
  if (!verb || !path.startsWith("/")) {
    fail({ ok: false, message: "Pass --method and --path. The path must start with /." })
  }
  const route = routes.find((item) => item.method === verb && item.path === path)
  if (!route) fail({ ok: false, message: `Route not found: ${verb} ${path}` })
  return route
}

/**
 * @param {{ admin: string, project?: string, tag?: string }} input
 */
export async function listRoutes({ admin, project, tag }) {
  const slug = requireProject(project)
  const routes = await fetchRoutes(admin, slug)
  const listed = routes
    .filter((route) => routeHasTag(route, tag || ""))
    .map(summarizeRoute)
  ok({ project: slug, routes: listed })
}

/**
 * @param {{ admin: string, project?: string, method?: string, path?: string }} input
 */
export async function getRoute({ admin, project, method, path }) {
  const slug = requireProject(project)
  const routes = await fetchRoutes(admin, slug)
  const route = findRoute(routes, method || "", path || "")
  ok({ project: slug, route })
}

/**
 * @param {string[] | undefined} values
 * @param {string} flag
 */
function requireTagList(values, flag) {
  /** @type {string[]} */
  const tags = []
  for (const item of values || []) {
    const parsed = readDocumentTags([item])
    if (!parsed.ok) fail({ ok: false, message: `${flag} ${parsed.error}` })
    tags.push(...parsed.tags)
  }
  return tags
}

/**
 * @param {{
 *   admin: string,
 *   project?: string,
 *   method?: string,
 *   path?: string,
 *   name?: string,
 *   add?: string[],
 *   remove?: string[]
 * }} input
 */
export async function tagScenario({ admin, project, method, path, name, add, remove }) {
  const slug = requireProject(project)
  const scenarioName = typeof name === "string" ? name.trim() : ""
  if (!scenarioName) fail({ ok: false, message: "mocker scenario tag requires --name" })
  const added = requireTagList(add, "--add")
  const removed = requireTagList(remove, "--remove")
  if (!added.length && !removed.length) {
    fail({ ok: false, message: "mocker scenario tag requires --add or --remove" })
  }
  const routes = await fetchRoutes(admin, slug)
  const route = findRoute(routes, method || "", path || "")
  const matches = (route.scenarios || []).filter((scenario) => scenario.name === scenarioName)
  const scenario = matches.find((item) => item.origin === "spec") || matches[0]
  if (!scenario) {
    fail({ ok: false, message: `Scenario not found: ${scenarioName} on ${route.method} ${route.path}` })
  }
  const tags = editTags(scenario.tags, added, removed)
  const scenarios = route.scenarios.map((item) =>
    item.id === scenario.id ? { ...item, tags } : item,
  )
  const response = await adminFetch(
    admin,
    `/__mock/projects/${encodeURIComponent(slug)}/routes/${encodeURIComponent(route.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarios }),
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  const saved = (payload.route?.scenarios || []).find((item) => item.id === scenario.id)
  ok({
    ok: true,
    project: slug,
    method: route.method,
    path: route.path,
    name: scenario.name,
    origin: scenario.origin === "spec" ? "spec" : "console",
    tags: saved?.tags || tags,
  })
}
