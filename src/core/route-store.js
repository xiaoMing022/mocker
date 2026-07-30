import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const projectsConfigDir = path.join(rootDir, "config", "projects")

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   method: string,
 *   path: string,
 *   enabled: boolean,
 *   statusCode: number,
 *   delayMs: number,
 *   response: unknown,
 *   headers: Record<string, string>
 * }} DynamicRoute
 */

/**
 * @param {string} slug
 */
export function getRoutesPath(slug) {
  return path.join(projectsConfigDir, slug, "routes.json")
}

/**
 * @param {string} slug
 * @returns {DynamicRoute[]}
 */
export function loadRoutes(slug) {
  const filePath = getRoutesPath(slug)
  if (!existsSync(filePath)) return []

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"))
    const list = Array.isArray(parsed?.routes) ? parsed.routes : []
    return list.map(normalizeRoute).filter(Boolean)
  } catch (error) {
    console.warn(`[routes:${slug}] failed to read routes.json: ${error.message}`)
    return []
  }
}

/**
 * @param {string} slug
 * @param {DynamicRoute[]} routes
 */
export function saveRoutes(slug, routes) {
  const dir = path.join(projectsConfigDir, slug)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const filePath = getRoutesPath(slug)
  const tmpPath = `${filePath}.tmp`
  const payload = `${JSON.stringify({ routes }, null, 2)}\n`
  writeFileSync(tmpPath, payload, "utf8")
  renameSync(tmpPath, filePath)
}

/**
 * @param {unknown} input
 * @returns {DynamicRoute | null}
 */
function normalizeRoute(input) {
  if (!input || typeof input !== "object") return null
  const method = String(input.method || "GET").toUpperCase()
  const routePath = String(input.path || "").trim()
  if (!METHODS.has(method)) return null
  if (!routePath.startsWith("/")) return null

  const statusCode = Number(input.statusCode ?? 200)
  const delayMs = Number(input.delayMs ?? 0)

  /** @type {Record<string, string>} */
  const headers = {}
  if (input.headers && typeof input.headers === "object") {
    for (const [k, v] of Object.entries(input.headers)) {
      if (typeof v === "string") headers[k] = v
    }
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    name: typeof input.name === "string" ? input.name : "",
    method,
    path: routePath,
    enabled: input.enabled !== false,
    statusCode: Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : 200,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.min(delayMs, 60_000) : 0,
    response: input.response === undefined ? {} : input.response,
    headers,
  }
}

/**
 * @param {unknown} routesInput
 * @returns {{ ok: true, routes: DynamicRoute[] } | { ok: false, errors: string[] }}
 */
export function validateRoutesPayload(routesInput) {
  if (!Array.isArray(routesInput)) {
    return { ok: false, errors: ["routes must be an array"] }
  }

  /** @type {string[]} */
  const errors = []
  /** @type {DynamicRoute[]} */
  const routes = []
  /** @type {Map<string, string>} */
  const enabledKeys = new Map()

  for (let i = 0; i < routesInput.length; i += 1) {
    const raw = routesInput[i]
    const route = normalizeRoute(raw)
    if (!route) {
      errors.push(`routes[${i}] is invalid (method/path)`)
      continue
    }

    if (raw.response !== undefined) {
      try {
        // Ensure JSON-serializable
        JSON.stringify(raw.response)
      } catch {
        errors.push(`routes[${i}] response must be JSON-serializable`)
        continue
      }
    }

    if (route.enabled) {
      const key = `${route.method} ${route.path}`
      if (enabledKeys.has(key)) {
        errors.push(`duplicate enabled route: ${key}`)
        continue
      }
      enabledKeys.set(key, route.id)
    }

    routes.push(route)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, routes }
}

/**
 * @param {unknown} patch
 * @param {DynamicRoute} current
 */
export function applyRoutePatch(current, patch) {
  return normalizeRoute({
    ...current,
    ...patch,
    id: current.id,
    headers:
      patch?.headers !== undefined
        ? patch.headers
        : current.headers,
    response: patch?.response !== undefined ? patch.response : current.response,
  })
}

export function createRouteId() {
  return randomUUID()
}

export { METHODS }
