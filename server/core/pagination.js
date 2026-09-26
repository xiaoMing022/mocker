/**
 * Pagination response transform for JSON mock scenarios.
 * Pure helpers — no HTTP / side effects (except optional skip reason).
 */

import { getByPath } from "./match.js"

const PARAM_SOURCES = new Set([
  "query",
  "body",
  "query-then-body",
  "body-then-query",
])

const STYLES = new Set(["page", "offset"])

const PRESETS = new Set(["page-pageSize", "pageNum-pageSize", "offset-limit"])

/** Dot-path: identifiers joined by `.` (e.g. data.list) */
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/

/**
 * @typedef {{
 *   enabled?: boolean,
 *   preset?: string | null,
 *   paramSource?: string,
 *   pageParam?: string,
 *   pageSizeParam?: string,
 *   offsetParam?: string,
 *   limitParam?: string,
 *   style?: string,
 *   pageBase?: number,
 *   defaultPageSize?: number,
 *   maxPageSize?: number,
 *   listPath?: string,
 *   totalPath?: string | null,
 *   pagePath?: string | null,
 *   pageSizePath?: string | null,
 *   totalPagesPath?: string | null,
 *   hasMorePath?: string | null,
 * }} PaginationConfig
 */

/**
 * @typedef {{
 *   applied: boolean,
 *   skipped?: boolean,
 *   reason?: string,
 *   page?: number,
 *   pageSize?: number,
 *   total?: number,
 *   body: unknown,
 * }} PaginationResult
 */

/**
 * @param {string | null | undefined} path
 * @returns {boolean}
 */
export function isValidDotPath(path) {
  if (path == null || path === "") return true
  return PATH_RE.test(String(path))
}

/**
 * @param {unknown} raw
 * @returns {PaginationConfig | null}
 */
export function normalizePagination(raw) {
  if (raw == null) return null
  if (typeof raw !== "object" || Array.isArray(raw)) return null

  /** @type {PaginationConfig} */
  const out = {}

  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled

  if (raw.preset != null && PRESETS.has(String(raw.preset))) {
    out.preset = String(raw.preset)
  } else if (raw.preset === null) {
    out.preset = null
  }

  if (raw.paramSource != null && PARAM_SOURCES.has(String(raw.paramSource))) {
    out.paramSource = String(raw.paramSource)
  }

  if (raw.style != null && STYLES.has(String(raw.style))) {
    out.style = String(raw.style)
  }

  for (const key of [
    "pageParam",
    "pageSizeParam",
    "offsetParam",
    "limitParam",
  ]) {
    if (raw[key] != null && String(raw[key]).trim()) {
      out[key] = String(raw[key]).trim()
    }
  }

  if (raw.pageBase === 0 || raw.pageBase === 1) {
    out.pageBase = raw.pageBase
  } else if (raw.pageBase != null && Number.isFinite(Number(raw.pageBase))) {
    const n = Number(raw.pageBase)
    if (n === 0 || n === 1) out.pageBase = n
  }

  for (const key of ["defaultPageSize", "maxPageSize"]) {
    if (raw[key] != null && Number.isFinite(Number(raw[key]))) {
      const n = Math.floor(Number(raw[key]))
      if (n > 0) out[key] = n
    }
  }

  for (const key of [
    "listPath",
    "totalPath",
    "pagePath",
    "pageSizePath",
    "totalPagesPath",
    "hasMorePath",
  ]) {
    if (raw[key] === null) {
      out[key] = null
      continue
    }
    if (raw[key] != null && String(raw[key]).trim()) {
      const p = String(raw[key]).trim()
      if (isValidDotPath(p)) out[key] = p
    }
  }

  // Drop empty objects that only appeared as {}
  if (Object.keys(out).length === 0) return null
  return out
}

/**
 * Expand a preset into base field defaults (does not set enabled).
 * @param {string} preset
 * @returns {PaginationConfig}
 */
export function expandPreset(preset) {
  switch (preset) {
    case "pageNum-pageSize":
      return {
        preset: "pageNum-pageSize",
        paramSource: "query",
        style: "page",
        pageParam: "pageNum",
        pageSizeParam: "pageSize",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.records",
        totalPath: "data.total",
      }
    case "offset-limit":
      return {
        preset: "offset-limit",
        paramSource: "query",
        style: "offset",
        offsetParam: "offset",
        limitParam: "limit",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.items",
        totalPath: "data.total",
      }
    case "page-pageSize":
    default:
      return {
        preset: "page-pageSize",
        paramSource: "query",
        style: "page",
        pageParam: "page",
        pageSizeParam: "pageSize",
        pageBase: 1,
        defaultPageSize: 10,
        maxPageSize: 100,
        listPath: "data.list",
        totalPath: "data.total",
      }
  }
}

/**
 * Shallow-merge route + scenario pagination, then apply runtime defaults.
 * @param {PaginationConfig | null | undefined} routePag
 * @param {PaginationConfig | null | undefined} scenarioPag
 * @returns {PaginationConfig | null} effective config, or null if disabled
 */
export function mergePagination(routePag, scenarioPag) {
  const route = routePag && typeof routePag === "object" ? routePag : null
  const scenario =
    scenarioPag && typeof scenarioPag === "object" ? scenarioPag : null

  if (!route && !scenario) return null

  /** @type {PaginationConfig} */
  const merged = { ...(route || {}), ...(scenario || {}) }

  const enabled = scenario?.enabled ?? route?.enabled ?? false
  if (!enabled) return null

  // Runtime defaults
  if (!merged.paramSource || !PARAM_SOURCES.has(merged.paramSource)) {
    merged.paramSource = "query"
  }
  if (!merged.style || !STYLES.has(merged.style)) {
    merged.style = "page"
  }
  if (merged.pageBase !== 0 && merged.pageBase !== 1) {
    merged.pageBase = 1
  }
  if (!merged.pageParam) merged.pageParam = "page"
  if (!merged.pageSizeParam) merged.pageSizeParam = "pageSize"
  if (!merged.offsetParam) merged.offsetParam = "offset"
  if (!merged.limitParam) merged.limitParam = "limit"
  if (!merged.defaultPageSize || merged.defaultPageSize < 1) {
    merged.defaultPageSize = 10
  }
  if (!merged.maxPageSize || merged.maxPageSize < 1) {
    merged.maxPageSize = 100
  }
  if (!merged.listPath || !String(merged.listPath).trim()) {
    return null
  }

  merged.enabled = true
  return merged
}

/**
 * Validate a single pagination object for save (fields that are present).
 * @param {unknown} raw
 * @param {string} label
 * @returns {string[]}
 */
export function validatePaginationFields(raw, label = "pagination") {
  /** @type {string[]} */
  const errors = []
  if (raw == null) return errors
  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${label} must be an object or null`)
    return errors
  }
  if (raw.paramSource != null && !PARAM_SOURCES.has(String(raw.paramSource))) {
    errors.push(`${label}.paramSource is invalid`)
  }
  if (raw.style != null && !STYLES.has(String(raw.style))) {
    errors.push(`${label}.style is invalid`)
  }
  if (raw.preset != null && raw.preset !== null && !PRESETS.has(String(raw.preset))) {
    errors.push(`${label}.preset is invalid`)
  }
  for (const key of ["defaultPageSize", "maxPageSize"]) {
    if (raw[key] != null) {
      const n = Number(raw[key])
      if (!Number.isFinite(n) || n < 1) {
        errors.push(`${label}.${key} must be a positive integer`)
      }
    }
  }
  for (const key of [
    "listPath",
    "totalPath",
    "pagePath",
    "pageSizePath",
    "totalPagesPath",
    "hasMorePath",
  ]) {
    if (raw[key] != null && raw[key] !== "" && !isValidDotPath(String(raw[key]))) {
      errors.push(`${label}.${key} is not a valid dot path`)
    }
  }
  if (raw.enabled === true) {
    // listPath may come from route after merge; checked at route level
    if (raw.listPath != null && !String(raw.listPath).trim()) {
      errors.push(`${label}.listPath must be non-empty when enabled`)
    }
  }
  return errors
}

/**
 * After normalize, ensure merge(route, scenario) has listPath when enabled.
 * @param {PaginationConfig | null | undefined} routePag
 * @param {PaginationConfig | null | undefined} scenarioPag
 * @param {string} label
 * @returns {string[]}
 */
export function validateEffectivePagination(routePag, scenarioPag, label) {
  const enabled = scenarioPag?.enabled ?? routePag?.enabled ?? false
  if (!enabled) return []
  const effective = mergePagination(routePag, scenarioPag)
  if (!effective || !effective.listPath) {
    return [`${label}: pagination enabled but listPath is missing after merge`]
  }
  return []
}

/**
 * @param {unknown} target
 * @param {string} path
 * @param {unknown} value
 * @returns {boolean} false if intermediate is non-object
 */
export function setByPath(target, path, value) {
  if (!path || target == null || typeof target !== "object") return false
  const parts = String(path).split(".").filter(Boolean)
  if (parts.length === 0) return false
  let cur = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i]
    if (cur[p] == null) {
      cur[p] = {}
    } else if (typeof cur[p] !== "object" || Array.isArray(cur[p])) {
      return false
    }
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
  return true
}

/**
 * @param {Record<string, string>} query
 * @param {unknown} body
 * @param {string} key
 * @param {string} source
 * @returns {string | undefined}
 */
function readParam(query, body, key, source) {
  const q =
    query && Object.prototype.hasOwnProperty.call(query, key)
      ? query[key]
      : undefined
  let b
  if (body && typeof body === "object" && !Array.isArray(body)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const v = body[key]
      b = v == null ? undefined : String(v)
    }
  }

  switch (source) {
    case "query":
      return q
    case "body":
      return b
    case "body-then-query":
      return b !== undefined ? b : q
    case "query-then-body":
    default:
      return q !== undefined ? q : b
  }
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseIntOr(raw, fallback) {
  if (raw == null || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

/**
 * Apply pagination transform to a JSON response body.
 * @param {unknown} response
 * @param {{ query?: Record<string, string>, body?: unknown }} req
 * @param {PaginationConfig} config  // already mergePagination result
 * @returns {PaginationResult}
 */
export function applyPagination(response, req, config) {
  /** @type {unknown} */
  let body
  try {
    body = structuredClone(response)
  } catch {
    try {
      body = JSON.parse(JSON.stringify(response))
    } catch {
      return {
        applied: false,
        skipped: true,
        reason: "unclonable",
        body: response,
      }
    }
  }

  const listPath = config.listPath
  if (!listPath) {
    return { applied: false, skipped: true, reason: "no-listPath", body }
  }

  const list = getByPath(body, listPath)
  if (!Array.isArray(list)) {
    return {
      applied: false,
      skipped: true,
      reason: "list-not-array",
      body,
    }
  }

  const query = req?.query || {}
  const reqBody = req?.body
  const source = config.paramSource || "query"
  const pageBase = config.pageBase === 0 ? 0 : 1
  const defaultPageSize = config.defaultPageSize || 10
  const maxPageSize = config.maxPageSize || 100
  const style = config.style === "offset" ? "offset" : "page"

  let page
  let pageSize
  let offset

  if (style === "offset") {
    const rawOffset = readParam(
      query,
      reqBody,
      config.offsetParam || "offset",
      source,
    )
    const rawLimit = readParam(
      query,
      reqBody,
      config.limitParam || "limit",
      source,
    )
    offset = Math.max(0, parseIntOr(rawOffset, 0))
    pageSize = clamp(parseIntOr(rawLimit, defaultPageSize), 1, maxPageSize)
    page = Math.floor(offset / pageSize) + pageBase
  } else {
    const rawPage = readParam(
      query,
      reqBody,
      config.pageParam || "page",
      source,
    )
    const rawSize = readParam(
      query,
      reqBody,
      config.pageSizeParam || "pageSize",
      source,
    )
    page = parseIntOr(rawPage, pageBase)
    if (page < pageBase) page = pageBase
    pageSize = clamp(parseIntOr(rawSize, defaultPageSize), 1, maxPageSize)
    offset = (page - pageBase) * pageSize
  }

  const total = list.length
  const pageItems = list.slice(offset, offset + pageSize)
  setByPath(body, listPath, pageItems)

  if (config.totalPath) {
    setByPath(body, config.totalPath, total)
  }
  if (config.pagePath) {
    setByPath(body, config.pagePath, page)
  }
  if (config.pageSizePath) {
    setByPath(body, config.pageSizePath, pageSize)
  }
  if (config.totalPagesPath) {
    const pages = pageSize === 0 ? 0 : Math.ceil(total / pageSize)
    setByPath(body, config.totalPagesPath, pages)
  }
  if (config.hasMorePath) {
    setByPath(body, config.hasMorePath, offset + pageItems.length < total)
  }

  return {
    applied: true,
    page,
    pageSize,
    total,
    body,
  }
}
