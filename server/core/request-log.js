import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { pathFilterMatch } from "./match.js"

/**
 * @typedef {{
 *   id: string,
 *   ts: string,
 *   method: string,
 *   path: string,
 *   routePath?: string | null,
 *   query?: Record<string, string> | null,
 *   requestHeaders?: Record<string, string> | null,
 *   requestBody?: unknown,
 *   responseBody?: unknown,
 *   status: number | null,
 *   durationMs: number | null,
 *   source: 'dynamic' | 'code' | 'proxy' | 'miss' | 'unknown',
 *   scenarioName?: string | null,
 *   scenarioOrigin?: "spec" | "console" | null,
 *   routeName?: string | null,
 *   matchedByCondition?: boolean,
 *   proxyTarget?: string | null
 * }} RequestLogEntry
 */

const DEFAULT_LIMIT = 200

/**
 * Newest-first ring, at most `maxPerProject` entries.
 * `fileForSlug` keeps that ring in the config directory across restarts.
 * @param {{
 *   maxPerProject?: number,
 *   fileForSlug?: (slug: string) => string | null
 * }} [options]
 */
export function createRequestLogStore({ maxPerProject = DEFAULT_LIMIT, fileForSlug } = {}) {
  /**
   * @typedef {{ seq: number, logs: RequestLogEntry[], loaded: boolean }} LogState
   * @type {Map<string, LogState>}
   */
  const states = new Map()

  /**
   * @param {string} slug
   * @returns {LogState}
   */
  function ensure(slug) {
    const existing = states.get(slug)
    if (existing?.loaded) return existing
    const loaded = readState(slug)
    states.set(slug, loaded)
    return loaded
  }

  /**
   * @param {string} slug
   * @returns {LogState}
   */
  function readState(slug) {
    const file = logFile(slug)
    if (!file) return { seq: 0, logs: [], loaded: true }
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"))
      const logs = Array.isArray(raw?.logs)
        ? raw.logs.map(sanitizeEntry).filter(Boolean).slice(0, maxPerProject)
        : []
      const seqFromFile = Number(raw?.seq)
      const maxId = logs.reduce((max, entry) => {
        const match = /^log-(\d+)$/.exec(entry.id)
        return match ? Math.max(max, Number(match[1])) : max
      }, 0)
      const seq = Number.isInteger(seqFromFile) && seqFromFile >= maxId ? seqFromFile : maxId
      return { seq, logs, loaded: true }
    } catch {
      return { seq: 0, logs: [], loaded: true }
    }
  }

  /**
   * @param {string} slug
   */
  function logFile(slug) {
    if (!fileForSlug || !/^[a-z0-9-]+$/.test(slug)) return null
    const file = fileForSlug(slug)
    return typeof file === "string" && file ? file : null
  }

  /**
   * @param {string} slug
   * @param {LogState} state
   */
  function persist(slug, state) {
    const file = logFile(slug)
    if (!file) return
    try {
      mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ seq: state.seq, logs: state.logs }))
      renameSync(tmp, file)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[logs:${slug}] failed to persist request logs: ${message}`)
    }
  }

  /**
   * @param {string} slug
   * @param {Omit<RequestLogEntry, 'id' | 'ts'> & { ts?: string }} entry
   */
  function append(slug, entry) {
    const state = ensure(slug)
    state.seq += 1
    state.logs.unshift({
      id: `log-${state.seq}`,
      ts: entry.ts || new Date().toISOString(),
      method: entry.method,
      path: entry.path,
      routePath: entry.routePath || null,
      query: entry.query ?? null,
      requestHeaders: entry.requestHeaders ?? null,
      requestBody: entry.requestBody ?? null,
      responseBody: entry.responseBody ?? null,
      status: entry.status ?? null,
      durationMs: entry.durationMs ?? null,
      source: entry.source || "unknown",
      scenarioName: entry.scenarioName ?? null,
      scenarioOrigin: entry.scenarioOrigin === "spec" ? "spec" : entry.scenarioOrigin === "console" ? "console" : null,
      routeName: entry.routeName ?? null,
      matchedByCondition: Boolean(entry.matchedByCondition),
      proxyTarget: entry.proxyTarget ?? null,
    })
    if (state.logs.length > maxPerProject) {
      state.logs.length = maxPerProject
    }
    persist(slug, state)
    return state.logs[0]
  }

  /**
   * @param {string} slug
   * @param {{ limit?: number, source?: string, method?: string, path?: string }} [filter]
   */
  function list(slug, filter = {}) {
    const state = ensure(slug)
    const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), maxPerProject)
    const source = filter.source ? String(filter.source).toLowerCase() : ""
    const method = filter.method ? String(filter.method).toUpperCase() : ""
    const pathFilter = filter.path ? String(filter.path) : ""

    return state.logs
      .filter((entry) => {
        if (source && entry.source !== source) return false
        if (method && entry.method !== method) return false
        if (
          pathFilter &&
          !pathFilterMatch(entry.path, pathFilter) &&
          !pathFilterMatch(entry.routePath || "", pathFilter)
        ) {
          return false
        }
        return true
      })
      .slice(0, limit)
  }

  /**
   * @param {string} slug
   * @param {string} id
   */
  function get(slug, id) {
    return ensure(slug).logs.find((entry) => entry.id === id) || null
  }

  function clear(slug) {
    const state = ensure(slug)
    state.logs = []
    persist(slug, state)
  }

  return { append, list, get, clear }
}

/**
 * @param {unknown} entry
 * @returns {RequestLogEntry | null}
 */
function sanitizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null
  const row = /** @type {RequestLogEntry} */ (entry)
  if (!row.method || !row.path || !row.id) return null
  return {
    id: String(row.id),
    ts: typeof row.ts === "string" ? row.ts : new Date().toISOString(),
    method: String(row.method),
    path: String(row.path),
    routePath: typeof row.routePath === "string" ? row.routePath : null,
    query: row.query ?? null,
    requestHeaders: row.requestHeaders ?? null,
    requestBody: row.requestBody ?? null,
    responseBody: row.responseBody ?? null,
    status: row.status ?? null,
    durationMs: row.durationMs ?? null,
    source: row.source || "unknown",
    scenarioName: row.scenarioName ?? null,
    scenarioOrigin: row.scenarioOrigin === "spec" ? "spec" : row.scenarioOrigin === "console" ? "console" : null,
    routeName: row.routeName ?? null,
    matchedByCondition: Boolean(row.matchedByCondition),
    proxyTarget: row.proxyTarget ?? null,
  }
}
