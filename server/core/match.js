/**
 * Scenario / proxy matching helpers (pure, testable).
 */

/**
 * @param {unknown} obj
 * @param {string} path  // a.b.c
 */
export function getByPath(obj, path) {
  if (!path || obj == null) return undefined
  const parts = String(path).split(".").filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * @param {Record<string, string>|undefined} expected
 * @param {Record<string, string|string[]|undefined>} actual
 * @param {{ caseInsensitive?: boolean }} [opts]
 */
export function matchRecord(expected, actual, opts = {}) {
  if (!expected || Object.keys(expected).length === 0) return true
  const actualMap = actual || {}
  for (const [key, want] of Object.entries(expected)) {
    const raw = actualMap[key] ?? actualMap[key.toLowerCase()]
    const got = Array.isArray(raw) ? raw[0] : raw
    if (got == null) return false
    const a = opts.caseInsensitive ? String(got).toLowerCase() : String(got)
    const b = opts.caseInsensitive ? String(want).toLowerCase() : String(want)
    if (a !== b) return false
  }
  return true
}

/**
 * @param {{ headers?: Record<string,string>, query?: Record<string,string>, body?: Record<string,string> }|null|undefined} match
 * @param {{ headers: Record<string,string>, query: Record<string,string>, body: unknown }} req
 */
export function scenarioMatches(match, req) {
  if (!match || typeof match !== "object") return true
  if (!matchRecord(match.headers, req.headers, { caseInsensitive: true })) return false
  if (!matchRecord(match.query, req.query)) return false
  if (match.body && typeof match.body === "object") {
    for (const [path, want] of Object.entries(match.body)) {
      const got = getByPath(req.body, path)
      if (got == null || String(got) !== String(want)) return false
    }
  }
  return true
}

/**
 * Pick scenario: first matching conditional, else activeScenarioId, else first.
 * @param {import("./route-store.js").DynamicRoute} route
 * @param {{ headers: Record<string,string>, query: Record<string,string>, body: unknown }} req
 */
export function pickScenario(route, req) {
  if (!route?.scenarios?.length) return null

  const conditionals = route.scenarios.filter(
    (s) => s.match && hasMatchRules(s.match),
  )
  for (const s of conditionals) {
    if (scenarioMatches(s.match, req)) return s
  }

  const active =
    route.scenarios.find((s) => s.id === route.activeScenarioId) ||
    route.scenarios.find((s) => !s.match || !hasMatchRules(s.match)) ||
    route.scenarios[0]
  return active || null
}

/**
 * @param {{ headers?: object, query?: object, body?: object }|null|undefined} match
 */
export function hasMatchRules(match) {
  if (!match || typeof match !== "object") return false
  return Boolean(
    (match.headers && Object.keys(match.headers).length) ||
      (match.query && Object.keys(match.query).length) ||
      (match.body && Object.keys(match.body).length),
  )
}

/**
 * Path-prefix proxy rule selection (first match wins).
 * @param {string} reqPath
 * @param {{ pathPrefix: string, target?: string, enabled?: boolean }[]} rules
 * @param {{ enabled: boolean, target: string }} defaults
 * @returns {{ enabled: boolean, target: string, rule?: object }|null}
 */
export function resolveProxyTarget(reqPath, rules, defaults) {
  const list = Array.isArray(rules) ? rules : []
  for (const rule of list) {
    if (!rule || typeof rule !== "object") continue
    const prefix = String(rule.pathPrefix || "")
    if (!prefix || !reqPath.startsWith(prefix)) continue
    if (rule.enabled === false) {
      return { enabled: false, target: "", rule }
    }
    const target = (rule.target && String(rule.target).trim()) || defaults.target
    return {
      enabled: Boolean(defaults.enabled || rule.target),
      target,
      rule,
    }
  }
  if (!defaults.enabled || !defaults.target) {
    return { enabled: false, target: "", rule: null }
  }
  return { enabled: true, target: defaults.target, rule: null }
}

/**
 * Simple path prefix match for filter (includes).
 * @param {string} path
 * @param {string} filter
 */
export function pathFilterMatch(path, filter) {
  if (!filter) return true
  return String(path).toLowerCase().includes(String(filter).toLowerCase())
}

export function truncateJson(value, maxLen = 8192) {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value)
    if (s.length <= maxLen) {
      return typeof value === "string" ? tryParse(s) : value
    }
    return {
      _truncated: true,
      preview: s.slice(0, maxLen),
      originalLength: s.length,
    }
  } catch {
    return { _error: "unserializable" }
  }
}

function tryParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/** Pick useful request headers for logging (avoid huge Cookie dumps). */
export function pickLogHeaders(headers) {
  const allow = [
    "content-type",
    "accept",
    "authorization",
    "x-session-token",
    "x-request-id",
    "x-requested-with",
    "origin",
    "referer",
    "user-agent",
  ]
  /** @type {Record<string, string>} */
  const out = {}
  if (!headers) return out
  for (const key of allow) {
    const v = headers[key] ?? headers[key.toLowerCase()]
    if (v != null) {
      const s = Array.isArray(v) ? String(v[0]) : String(v)
      // keep UA short in the list view
      out[key] = key === "user-agent" && s.length > 160 ? `${s.slice(0, 160)}…` : s
    }
  }
  return out
}
