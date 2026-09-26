/**
 * Turn newest-first request logs into an apply document.
 * One route per method+path, using the newest log.
 * Misses become an empty 200 scenario so a 404 page is not copied in as the mock.
 * @param {string} project
 * @param {Array<{
 *   method: string,
 *   path: string,
 *   source?: string,
 *   status?: number | null,
 *   scenarioName?: string | null,
 *   query?: Record<string, string> | null,
 *   requestBody?: unknown,
 *   responseBody?: unknown
 * }>} logs
 */
export function logsToDocument(project, logs) {
  /** @type {Map<string, (typeof logs)[number]>} */
  const newest = new Map()
  for (const log of logs) {
    if (!log?.method || !log?.path) continue
    const key = `${String(log.method).toUpperCase()} ${log.path}`
    if (!newest.has(key)) newest.set(key, log)
  }

  const routes = []
  for (const log of newest.values()) {
    const miss = log.source === "miss"
    /** @type {Record<string, unknown>} */
    const route = {
      method: String(log.method).toUpperCase(),
      path: log.path,
      scenarios: [
        {
          name: !miss && log.scenarioName ? String(log.scenarioName) : "captured",
          statusCode: miss ? 200 : normalizeStatus(log.status),
          response: miss || log.responseBody == null ? {} : log.responseBody,
        },
      ],
    }
    /** @type {Record<string, unknown>} */
    const requestExample = {}
    if (log.query && Object.keys(log.query).length) requestExample.query = log.query
    if (log.requestBody != null) requestExample.body = log.requestBody
    if (Object.keys(requestExample).length) route.requestExample = requestExample
    routes.push(route)
  }

  return { project, routes }
}

/**
 * @param {number | null | undefined} status
 */
function normalizeStatus(status) {
  const code = Number(status)
  if (Number.isInteger(code) && code >= 100 && code <= 599) return code
  return 200
}
