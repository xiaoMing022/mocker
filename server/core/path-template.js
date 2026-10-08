/**
 * Route paths are exact, or templates with one :param per segment.
 * A parameter is `:name`. It matches exactly one non-empty segment.
 */

const PARAM_RE = /^:[A-Za-z_][A-Za-z0-9_]*$/

/**
 * @param {string} routePath
 * @returns {string[] | null} segments after the leading slash. `/` is `[]`.
 */
export function splitRoutePath(routePath) {
  const raw = String(routePath || "")
  if (!raw.startsWith("/")) return null
  if (raw.includes("?") || raw.includes("#") || /\s/.test(raw)) return null
  if (raw === "/") return []
  const segments = raw.split("/").slice(1)
  if (segments.some((segment) => segment.length === 0)) return null
  return segments
}

/**
 * @param {string} segment
 */
export function isParamSegment(segment) {
  return PARAM_RE.test(segment)
}

/**
 * @param {string} routePath
 * @returns {string | null} error, or null when the path can be stored
 */
export function validateRoutePath(routePath) {
  const segments = splitRoutePath(routePath)
  if (!segments) {
    return "path must start with / and contain no empty, query, hash, or whitespace segments"
  }
  /** @type {Set<string>} */
  const names = new Set()
  for (const segment of segments) {
    if (!segment.startsWith(":")) continue
    if (!isParamSegment(segment)) return `invalid path parameter ${segment}`
    const name = segment.slice(1)
    if (names.has(name)) return `duplicate path parameter ${segment}`
    names.add(name)
  }
  return null
}

/**
 * Identity of the pattern. Parameter names do not distinguish two templates.
 * @param {string} method
 * @param {string} routePath
 */
export function patternKey(method, routePath) {
  const verb = String(method || "GET").toUpperCase()
  const segments = splitRoutePath(routePath)
  if (!segments) return `${verb} ${routePath}`
  const shape = segments.map((segment) => (isParamSegment(segment) ? ":" : segment)).join("/")
  return `${verb} /${shape}`
}

/**
 * @param {string} template
 * @param {string} actualPath
 * @returns {Record<string, string> | null}
 */
export function matchPath(template, actualPath) {
  const want = splitRoutePath(template)
  const got = splitRoutePath(actualPath)
  if (!want || !got || want.length !== got.length) return null
  /** @type {Record<string, string>} */
  const params = {}
  for (let i = 0; i < want.length; i += 1) {
    if (isParamSegment(want[i])) {
      params[want[i].slice(1)] = got[i]
      continue
    }
    if (want[i] !== got[i]) return null
  }
  return params
}

/**
 * Left-to-right: a static segment outranks a parameter.
 * @param {string} left
 * @param {string} right
 * @returns {number} positive when left is more specific
 */
function compareSpecificity(left, right) {
  const a = splitRoutePath(left) || []
  const b = splitRoutePath(right) || []
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const av = a[i] == null ? -1 : isParamSegment(a[i]) ? 0 : 1
    const bv = b[i] == null ? -1 : isParamSegment(b[i]) ? 0 : 1
    if (av !== bv) return av - bv
  }
  return 0
}

/**
 * Most specific enabled route wins. Equal specificity keeps the earlier route.
 * @param {Array<{ method?: string, path?: string, enabled?: boolean }>} routes
 * @param {string} method
 * @param {string} actualPath
 * @param {{ includeDisabled?: boolean }} [options]
 */
export function findMatchingRoute(routes, method, actualPath, options = {}) {
  const verb = String(method || "").toUpperCase()
  /** @type {{ method?: string, path?: string, enabled?: boolean } | null} */
  let best = null
  for (const route of routes || []) {
    if (!route) continue
    if (!options.includeDisabled && route.enabled === false) continue
    if (String(route.method || "").toUpperCase() !== verb) continue
    if (!matchPath(String(route.path || ""), actualPath)) continue
    if (!best || compareSpecificity(String(route.path), String(best.path)) > 0) {
      best = route
    }
  }
  return best
}

/**
 * Concrete path used by `mocker check`. Each :param becomes the segment `1`.
 * @param {string} routePath
 */
export function probePathForTemplate(routePath) {
  const segments = splitRoutePath(routePath)
  if (!segments) return routePath
  return `/${segments
    .map((segment) => (isParamSegment(segment) ? "1" : encodeURIComponent(segment)))
    .join("/")}`
}
