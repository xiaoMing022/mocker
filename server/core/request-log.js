import { pathFilterMatch } from "./match.js"

/**
 * @typedef {{
 *   id: string,
 *   ts: string,
 *   method: string,
 *   path: string,
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
 * @param {{ maxPerProject?: number }} [options]
 */
export function createRequestLogStore({ maxPerProject = DEFAULT_LIMIT } = {}) {
  /** @type {Map<string, RequestLogEntry[]>} */
  const logs = new Map()
  let seq = 0

  function ensure(slug) {
    if (!logs.has(slug)) logs.set(slug, [])
    return logs.get(slug)
  }

  /**
   * @param {string} slug
   * @param {Omit<RequestLogEntry, 'id' | 'ts'> & { ts?: string }} entry
   */
  function append(slug, entry) {
    const list = ensure(slug)
    seq += 1
    list.unshift({
      id: `log-${seq}`,
      ts: entry.ts || new Date().toISOString(),
      method: entry.method,
      path: entry.path,
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
    if (list.length > maxPerProject) {
      list.length = maxPerProject
    }
    return list[0]
  }

  /**
   * @param {string} slug
   * @param {{ limit?: number, source?: string, method?: string, path?: string }} [filter]
   */
  function list(slug, filter = {}) {
    const listEntries = ensure(slug)
    const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), maxPerProject)
    const source = filter.source ? String(filter.source).toLowerCase() : ""
    const method = filter.method ? String(filter.method).toUpperCase() : ""
    const path = filter.path ? String(filter.path) : ""

    return listEntries
      .filter((e) => {
        if (source && e.source !== source) return false
        if (method && e.method !== method) return false
        if (path && !pathFilterMatch(e.path, path)) return false
        return true
      })
      .slice(0, limit)
  }

  /**
   * @param {string} slug
   * @param {string} id
   */
  function get(slug, id) {
    return ensure(slug).find((e) => e.id === id) || null
  }

  function clear(slug) {
    logs.set(slug, [])
  }

  return { append, list, get, clear }
}
