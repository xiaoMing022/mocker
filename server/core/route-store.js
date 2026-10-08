import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { patternKey, validateRoutePath } from "./path-template.js"
import { getConfigRoot } from "./paths.js"
import { normalizeHeaderMap } from "./util/headers.js"
import {
  normalizePagination,
  validateEffectivePagination,
  validatePaginationFields,
} from "./pagination.js"

function projectsConfigDir() {
  return path.join(getConfigRoot(), "projects")
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/
const MAX_TAGS = 8

/**
 * Stored tags. Invalid entries are dropped. Missing input is an empty list.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeTags(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {string[]} */
  const tags = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const tag = item.trim().toLowerCase()
    if (!TAG_RE.test(tag) || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

/**
 * Tags written in an apply document. A bad entry is an error.
 * @param {unknown} raw
 * @returns {{ ok: true, tags: string[] } | { ok: false, error: string }}
 */
export function readDocumentTags(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: "tags must be an array of strings" }
  if (raw.length > MAX_TAGS) return { ok: false, error: "tags has more than 8 items" }
  /** @type {string[]} */
  const tags = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: "tags must be an array of strings" }
    const tag = item.trim().toLowerCase()
    if (!TAG_RE.test(tag)) return { ok: false, error: `invalid tag ${JSON.stringify(item)}` }
    if (seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return { ok: true, tags }
}

/** @param {unknown} value */
function normalizeOrigin(value) {
  return value === "spec" ? "spec" : "console"
}

/**
 * @typedef {{
 *   headers?: Record<string, string>,
 *   query?: Record<string, string>,
 *   body?: Record<string, string>
 * }} ScenarioMatch
 *
 * @typedef {{
 *   event?: string,
 *   data: unknown,
 *   id?: string,
 *   retry?: number,
 *   delayMs?: number
 * }} SseEvent
 *
 * @typedef {{
 *   events: SseEvent[],
 *   endWithDone: boolean,
 *   keepAliveMs: number
 * }} ScenarioStream
 *
 * @typedef {import("./pagination.js").PaginationConfig} PaginationConfig
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   statusCode: number,
 *   delayMs: number,
 *   response: unknown,
 *   headers: Record<string, string>,
 *   match: ScenarioMatch | null,
 *   mode: "json" | "sse",
 *   stream: ScenarioStream | null,
 *   pagination: PaginationConfig | null,
 *   tags: string[],
 *   origin: "spec" | "console"
 * }} Scenario
 *
 * @typedef {{
 *   headers?: Record<string, string>,
 *   query?: Record<string, string>,
 *   body?: unknown
 * }} RequestExample
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   method: string,
 *   path: string,
 *   enabled: boolean,
 *   activeScenarioId: string,
 *   scenarios: Scenario[],
 *   note: string,
 *   requestExample: RequestExample | null,
 *   proxyHeaders: Record<string, string>,
 *   pagination: PaginationConfig | null,
 *   origin: "spec" | "console"
 * }} DynamicRoute
 */

export function getRoutesPath(slug) {
  return path.join(projectsConfigDir(), slug, "routes.json")
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
    const { routes, migrated } = normalizeRouteList(list)
    if (migrated) {
      saveRoutes(slug, routes)
      console.log(`[routes:${slug}] migrated legacy flat routes → scenario model`)
    }
    return routes
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
  const dir = path.join(projectsConfigDir(), slug)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const filePath = getRoutesPath(slug)
  const tmpPath = `${filePath}.tmp`
  const payload = `${JSON.stringify({ version: 2, routes }, null, 2)}\n`
  writeFileSync(tmpPath, payload, "utf8")
  renameSync(tmpPath, filePath)
}

/**
 * @param {unknown[]} list
 * @returns {{ routes: DynamicRoute[], migrated: boolean }}
 */
export function normalizeRouteList(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return { routes: [], migrated: false }
  }

  const looksLegacy = list.some(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item.scenarios) &&
      (item.response !== undefined || item.statusCode !== undefined),
  )

  if (looksLegacy) {
    return { routes: migrateLegacyRoutes(list), migrated: true }
  }

  /** @type {DynamicRoute[]} */
  const routes = []
  for (const item of list) {
    const route = normalizeRoute(item)
    if (route) routes.push(route)
  }
  return { routes, migrated: false }
}

/**
 * Group legacy flat rows (one row per response) into one route per method+path.
 * @param {unknown[]} list
 * @returns {DynamicRoute[]}
 */
function migrateLegacyRoutes(list) {
  /** @type {Map<string, { meta: any, rows: any[] }>} */
  const groups = new Map()

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue
    const method = String(raw.method || "GET").toUpperCase()
    const routePath = String(raw.path || "").trim()
    if (!METHODS.has(method) || !routePath.startsWith("/")) continue
    const key = `${method} ${routePath}`
    if (!groups.has(key)) {
      groups.set(key, { meta: raw, rows: [] })
    }
    groups.get(key).rows.push(raw)
  }

  /** @type {DynamicRoute[]} */
  const routes = []
  for (const { meta, rows } of groups.values()) {
    const scenarios = rows.map((row, index) =>
      normalizeScenario({
        id: row.id || randomUUID(),
        name: deriveScenarioName(row, index),
        statusCode: row.statusCode,
        delayMs: row.delayMs,
        response: row.response,
        headers: row.headers,
      }),
    )

    // Prefer first enabled legacy row as active; else first scenario
    const enabledRow = rows.find((r) => r.enabled !== false)
    const activeScenarioId =
      (enabledRow && scenarios.find((s) => s.id === enabledRow.id)?.id) ||
      scenarios[0]?.id ||
      ""

    // Strip scenario names from route name if they look like "投票成功 A"
    const routeName = String(meta.name || "")
      .replace(/成功\s*[AB].*$/i, "")
      .replace(/（.*?）/g, "")
      .replace(/\(.*?\)$/g, "")
      .trim() || `${meta.method} ${meta.path}`

    const route = normalizeRoute({
      id: meta.id || randomUUID(),
      name: routeName,
      method: meta.method,
      path: meta.path,
      enabled: rows.some((r) => r.enabled !== false),
      activeScenarioId,
      scenarios,
      note: "",
    })
    if (route) routes.push(route)
  }
  return routes
}

function deriveScenarioName(row, index) {
  if (typeof row.name === "string" && row.name.trim()) {
    // Prefer the distinctive part of legacy names
    const name = row.name
    if (/成功\s*A|winner.*A|choice.*A/i.test(name)) return "成功 A"
    if (/成功\s*B|winner.*B|choice.*B/i.test(name)) return "成功 B"
    if (/非法|invalid|error|失败|400/.test(name)) return "非法 / 失败"
    if (/备用|disabled|关闭/.test(name)) return name.replace(/^\[.*?\]\s*/, "").trim() || `场景 ${index + 1}`
    // strip [web] prefix noise
    const cleaned = name.replace(/^\[.*?\]\s*/, "").trim()
    if (cleaned && cleaned !== name) {
      // if whole name is endpoint name, use 默认
      if (!/成功|失败|非法|错误|超时|空/.test(cleaned)) return "默认"
      return cleaned
    }
    return cleaned || `场景 ${index + 1}`
  }
  return index === 0 ? "默认" : `场景 ${index + 1}`
}

/**
 * @param {unknown} input
 * @returns {Scenario | null}
 */
export function normalizeScenario(input) {
  if (!input || typeof input !== "object") return null

  const statusCode = Number(input.statusCode ?? 200)
  const delayMs = Number(input.delayMs ?? 0)

  /** @type {Record<string, string>} */
  const headers = {}
  if (input.headers && typeof input.headers === "object") {
    for (const [k, v] of Object.entries(input.headers)) {
      if (typeof v === "string") headers[k] = v
    }
  }

  const mode = input.mode === "sse" ? "sse" : "json"
  const stream = mode === "sse" ? normalizeStream(input.stream) : null

  const response = input.response === undefined ? {} : input.response
  try {
    JSON.stringify(response)
  } catch {
    return null
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "未命名场景",
    statusCode:
      Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? statusCode
        : 200,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? Math.min(delayMs, 60_000) : 0,
    response,
    headers,
    match: normalizeMatch(input.match),
    mode,
    stream,
    pagination: normalizePagination(input.pagination),
    tags: normalizeTags(input.tags),
    origin: normalizeOrigin(input.origin),
  }
}

/**
 * @param {unknown} raw
 * @returns {ScenarioStream}
 */
function normalizeStream(raw) {
  const src = raw && typeof raw === "object" ? raw : {}
  /** @type {SseEvent[]} */
  const events = []
  if (Array.isArray(src.events)) {
    for (const item of src.events) {
      const evt = normalizeSseEvent(item)
      if (evt) events.push(evt)
    }
  }
  const keepAliveRaw = Number(src.keepAliveMs ?? 0)
  const keepAliveMs =
    Number.isFinite(keepAliveRaw) && keepAliveRaw > 0
      ? Math.min(Math.floor(keepAliveRaw), 60_000)
      : 0
  return {
    events,
    endWithDone: Boolean(src.endWithDone),
    keepAliveMs,
  }
}

/**
 * @param {unknown} raw
 * @returns {SseEvent | null}
 */
function normalizeSseEvent(raw) {
  if (!raw || typeof raw !== "object") return null
  /** @type {SseEvent} */
  const evt = { data: raw.data === undefined ? "" : raw.data }
  try {
    JSON.stringify(evt.data)
  } catch {
    evt.data = String(raw.data)
  }
  if (raw.event != null && String(raw.event).trim()) {
    evt.event = String(raw.event).trim()
  }
  if (raw.id != null && String(raw.id).trim()) {
    evt.id = String(raw.id).trim()
  }
  if (raw.retry != null && Number.isFinite(Number(raw.retry))) {
    evt.retry = Math.floor(Number(raw.retry))
  }
  const d = Number(raw.delayMs ?? 0)
  if (Number.isFinite(d) && d > 0) {
    evt.delayMs = Math.min(Math.floor(d), 60_000)
  }
  return evt
}

/**
 * @param {unknown} raw
 * @returns {ScenarioMatch | null}
 */
function normalizeMatch(raw) {
  if (!raw || typeof raw !== "object") return null
  /** @type {ScenarioMatch} */
  const match = {}
  if (raw.headers && typeof raw.headers === "object") {
    /** @type {Record<string, string>} */
    const headers = {}
    for (const [k, v] of Object.entries(raw.headers)) {
      if (v != null && String(v).trim()) headers[k] = String(v)
    }
    if (Object.keys(headers).length) match.headers = headers
  }
  if (raw.query && typeof raw.query === "object") {
    /** @type {Record<string, string>} */
    const query = {}
    for (const [k, v] of Object.entries(raw.query)) {
      if (v != null && String(v).trim()) query[k] = String(v)
    }
    if (Object.keys(query).length) match.query = query
  }
  if (raw.body && typeof raw.body === "object" && !Array.isArray(raw.body)) {
    /** @type {Record<string, string>} */
    const body = {}
    for (const [k, v] of Object.entries(raw.body)) {
      if (v != null && String(v).trim() !== "") body[k] = String(v)
    }
    if (Object.keys(body).length) match.body = body
  }
  if (!match.headers && !match.query && !match.body) return null
  return match
}

/**
 * @param {unknown} raw
 * @returns {RequestExample | null}
 */
function normalizeRequestExample(raw) {
  if (!raw || typeof raw !== "object") return null
  /** @type {RequestExample} */
  const ex = {}
  if (raw.headers && typeof raw.headers === "object") {
    /** @type {Record<string, string>} */
    const headers = {}
    for (const [k, v] of Object.entries(raw.headers)) {
      if (typeof v === "string") headers[k] = v
    }
    if (Object.keys(headers).length) ex.headers = headers
  }
  if (raw.query && typeof raw.query === "object") {
    /** @type {Record<string, string>} */
    const query = {}
    for (const [k, v] of Object.entries(raw.query)) {
      if (v != null) query[k] = String(v)
    }
    if (Object.keys(query).length) ex.query = query
  }
  if (raw.body !== undefined) {
    try {
      JSON.stringify(raw.body)
      ex.body = raw.body
    } catch {
      /* skip */
    }
  }
  if (!ex.headers && !ex.query && ex.body === undefined) return null
  return ex
}

/**
 * @param {unknown} input
 * @returns {DynamicRoute | null}
 */
export function normalizeRoute(input) {
  if (!input || typeof input !== "object") return null
  const method = String(input.method || "GET").toUpperCase()
  const routePath = String(input.path || "").trim()
  if (!METHODS.has(method)) return null
  if (!routePath.startsWith("/")) return null

  let scenarios = []
  if (Array.isArray(input.scenarios) && input.scenarios.length > 0) {
    scenarios = input.scenarios.map(normalizeScenario).filter(Boolean)
  } else {
    // Accept partial create payload: top-level response becomes first scenario
    const scenario = normalizeScenario({
      id: input.scenarioId,
      name: input.scenarioName || "默认",
      statusCode: input.statusCode,
      delayMs: input.delayMs,
      response: input.response,
      headers: input.headers,
    })
    if (scenario) scenarios = [scenario]
  }

  if (scenarios.length === 0) {
    scenarios = [
      normalizeScenario({
        name: "默认",
        statusCode: 200,
        delayMs: 0,
        response: {},
        headers: {},
      }),
    ]
  }

  let activeScenarioId =
    typeof input.activeScenarioId === "string" ? input.activeScenarioId : ""
  if (!scenarios.some((s) => s.id === activeScenarioId)) {
    activeScenarioId = scenarios[0].id
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    name: typeof input.name === "string" ? input.name : "",
    method,
    path: routePath,
    enabled: input.enabled !== false,
    activeScenarioId,
    scenarios,
    note: typeof input.note === "string" ? input.note : "",
    requestExample: normalizeRequestExample(input.requestExample),
    proxyHeaders: normalizeHeaderMap(input.proxyHeaders),
    pagination: normalizePagination(input.pagination),
    origin: normalizeOrigin(input.origin),
  }
}

/**
 * Active scenario helper for runtime matching.
 * @param {DynamicRoute} route
 * @returns {Scenario | null}
 */
export function getActiveScenario(route) {
  if (!route?.scenarios?.length) return null
  return (
    route.scenarios.find((s) => s.id === route.activeScenarioId) ||
    route.scenarios[0] ||
    null
  )
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
  const keys = new Map()
  /** @type {Map<string, string>} */
  const shapes = new Map()

  for (let i = 0; i < routesInput.length; i += 1) {
    const raw = routesInput[i]
    const route = normalizeRoute(raw)
    if (!route) {
      errors.push(`routes[${i}] is invalid (method/path/scenarios)`)
      continue
    }

    const pathError = validateRoutePath(route.path)
    if (pathError) {
      errors.push(`routes[${i}] ${pathError}`)
      continue
    }

    if (route.scenarios.length === 0) {
      errors.push(`routes[${i}] must have at least one scenario`)
      continue
    }

    const key = `${route.method} ${route.path}`
    if (keys.has(key)) {
      errors.push(`duplicate interface: ${key} (one entry per method+path)`)
      continue
    }
    const shape = patternKey(route.method, route.path)
    const previous = shapes.get(shape)
    if (previous) {
      errors.push(`routes[${i}] overlaps ${previous} (${key})`)
      continue
    }
    keys.set(key, route.id)
    shapes.set(shape, key)

    const scenarioIds = new Set()
    for (const s of route.scenarios) {
      if (scenarioIds.has(s.id)) {
        errors.push(`routes[${i}] duplicate scenario id ${s.id}`)
      }
      scenarioIds.add(s.id)
    }

    // Validate raw pagination (normalize drops unknown values)
    if (raw && typeof raw === "object" && "pagination" in raw) {
      errors.push(
        ...validatePaginationFields(
          raw.pagination,
          `routes[${i}].pagination`,
        ),
      )
    }
    if (raw && typeof raw === "object" && Array.isArray(raw.scenarios)) {
      for (let si = 0; si < raw.scenarios.length; si += 1) {
        const rawSc = raw.scenarios[si]
        if (rawSc && typeof rawSc === "object" && "pagination" in rawSc) {
          errors.push(
            ...validatePaginationFields(
              rawSc.pagination,
              `routes[${i}].scenarios[${si}].pagination`,
            ),
          )
        }
      }
    }

    for (let si = 0; si < route.scenarios.length; si += 1) {
      errors.push(
        ...validateEffectivePagination(
          route.pagination,
          route.scenarios[si].pagination,
          `routes[${i}].scenarios[${si}]`,
        ),
      )
    }

    routes.push(route)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, routes }
}

/**
 * @param {DynamicRoute} current
 * @param {unknown} patch
 */
export function applyRoutePatch(current, patch) {
  if (!patch || typeof patch !== "object") return current

  const merged = {
    ...current,
    ...patch,
    id: current.id,
    scenarios:
      patch.scenarios !== undefined ? patch.scenarios : current.scenarios,
    activeScenarioId:
      patch.activeScenarioId !== undefined
        ? patch.activeScenarioId
        : current.activeScenarioId,
    requestExample:
      patch.requestExample !== undefined
        ? patch.requestExample
        : current.requestExample,
    proxyHeaders:
      patch.proxyHeaders !== undefined
        ? patch.proxyHeaders
        : current.proxyHeaders,
    pagination:
      patch.pagination !== undefined ? patch.pagination : current.pagination,
  }

  return normalizeRoute(merged)
}

export function createRouteId() {
  return randomUUID()
}

export function createScenarioId() {
  return randomUUID()
}

export { METHODS }
