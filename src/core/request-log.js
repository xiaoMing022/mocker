/**
 * In-memory ring buffer of request logs per project.
 */

/**
 * @typedef {{
 *   id: string,
 *   ts: string,
 *   method: string,
 *   path: string,
 *   status: number | null,
 *   durationMs: number | null,
 *   source: 'dynamic' | 'code' | 'proxy' | 'miss' | 'unknown'
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

  /**
   * @param {string} slug
   */
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
      status: entry.status ?? null,
      durationMs: entry.durationMs ?? null,
      source: entry.source || "unknown",
    })
    if (list.length > maxPerProject) {
      list.length = maxPerProject
    }
  }

  /**
   * @param {string} slug
   * @param {number} [limit]
   */
  function list(slug, limit = 50) {
    const listEntries = ensure(slug)
    const n = Math.min(Math.max(Number(limit) || 50, 1), maxPerProject)
    return listEntries.slice(0, n)
  }

  /**
   * @param {string} slug
   */
  function clear(slug) {
    logs.set(slug, [])
  }

  return { append, list, clear }
}
