import { applyPagination, mergePagination } from "../server/core/pagination.js"

const DIFF_LIMIT = 20

/**
 * Query and body `mocker check` sends. Path parameters are still substituted separately.
 * @param {{ requestExample?: { query?: Record<string, unknown>, body?: unknown } | null } | null | undefined} route
 */
export function probeRequest(route) {
  const example =
    route?.requestExample && typeof route.requestExample === "object" && !Array.isArray(route.requestExample)
      ? route.requestExample
      : {}
  /** @type {Record<string, string>} */
  const query = {}
  if (example.query && typeof example.query === "object" && !Array.isArray(example.query)) {
    for (const [key, value] of Object.entries(example.query)) {
      if (value == null || String(value) === "") continue
      query[key] = String(value)
    }
  }
  return {
    query,
    body: Object.prototype.hasOwnProperty.call(example, "body") ? example.body : undefined,
  }
}

/**
 * Body `mocker check` compares for a JSON scenario.
 * Pagination uses the probe query and body, which default to the document requestExample.
 * SSE scenarios are not JSON documents; callers skip this.
 * @param {{ pagination?: object | null, requestExample?: { query?: Record<string, unknown>, body?: unknown } | null, scenarios?: object[] }} route
 * @param {{ mode?: string, response?: unknown, pagination?: object | null } | undefined} scenario
 * @param {{ query?: Record<string, string>, body?: unknown }} [request]
 */
export function expectedJsonBody(route, scenario, request) {
  const raw = scenario?.response === undefined ? {} : scenario.response
  const pagination = mergePagination(route?.pagination, scenario?.pagination)
  if (!pagination) return raw
  const req = request || probeRequest(route)
  return applyPagination(raw, { query: req.query || {}, body: req.body }, pagination).body
}

/**
 * @param {unknown} expected
 * @param {unknown} actual
 * @returns {string[]}
 */
export function diffJson(expected, actual) {
  /** @type {string[]} */
  const problems = []
  walk(expected, actual, "response", problems)
  if (problems.length > DIFF_LIMIT) {
    const extra = problems.length - DIFF_LIMIT
    problems.length = DIFF_LIMIT
    problems.push(`response: ${extra} more differences omitted`)
  }
  return problems
}

/**
 * @param {unknown} expected
 * @param {unknown} actual
 * @param {string} where
 * @param {string[]} problems
 */
function walk(expected, actual, where, problems) {
  if (problems.length > DIFF_LIMIT) return
  if (Object.is(expected, actual)) return
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    for (const key of keys) {
      const child = `${where}.${key}`
      if (!Object.prototype.hasOwnProperty.call(actual, key)) {
        problems.push(`${child}: missing`)
      } else if (!Object.prototype.hasOwnProperty.call(expected, key)) {
        problems.push(`${child}: unexpected`)
      } else {
        walk(expected[key], actual[key], child, problems)
      }
    }
    return
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      problems.push(`${where}.length: ${actual.length} != ${expected.length}`)
    }
    const count = Math.min(expected.length, actual.length)
    for (let i = 0; i < count; i += 1) {
      walk(expected[i], actual[i], `${where}[${i}]`, problems)
    }
    return
  }
  problems.push(`${where}: ${preview(actual)} != ${preview(expected)}`)
}

/**
 * @param {unknown} value
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * @param {unknown} value
 */
function preview(value) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text == null) return String(value)
  if (text.length > 80) return `${text.slice(0, 77)}...`
  return text
}

/**
 * Decide whether a live probe hit the document's baseline scenario and JSON body.
 * @param {{
 *   method: string,
 *   path: string,
 *   pagination?: object | null,
 *   scenarios?: Array<{ name?: string, statusCode?: number, mode?: string, response?: unknown, pagination?: object | null }>
 * }} route
 * @param {{
 *   status: number | null,
 *   origin: string | null,
 *   scenarioName: string | null,
 *   body?: unknown,
 *   bodyError?: string,
 *   error?: string
 * }} probe
 */
export function judgeProbe(route, probe) {
  const expected = (route.scenarios || [])
    .map((scenario) => (typeof scenario.name === "string" ? scenario.name : ""))
    .filter(Boolean)
  /** @type {string[]} */
  const problems = []
  if (probe.error) problems.push(probe.error)
  if (!probe.origin) problems.push("response did not come from a mock scenario")
  else if (probe.origin !== "spec") {
    problems.push(
      `hit ${probe.origin} scenario ${probe.scenarioName || "(unnamed)"}; switch to a 基准 scenario in the console`,
    )
  } else if (!expected.includes(probe.scenarioName || "")) {
    problems.push(`hit spec scenario ${probe.scenarioName || "(unnamed)"} which is not in the document`)
  } else {
    const spec = (route.scenarios || []).find((scenario) => scenario.name === probe.scenarioName)
    const want = Number.isInteger(spec?.statusCode) ? spec.statusCode : 200
    if (probe.status !== want) problems.push(`status ${probe.status} != ${want}`)
    if (spec?.mode !== "sse") {
      if (probe.bodyError) problems.push(probe.bodyError)
      else if (Object.prototype.hasOwnProperty.call(probe, "body")) {
        problems.push(...diffJson(expectedJsonBody(route, spec), probe.body))
      }
    }
  }
  return {
    method: route.method,
    path: route.path,
    ok: problems.length === 0,
    status: probe.status,
    origin: probe.origin,
    scenarioName: probe.scenarioName,
    expected,
    problems,
  }
}

/**
 * @param {string | null | undefined} value
 */
export function decodeScenarioName(value) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
