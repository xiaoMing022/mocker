/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function normalizeHeaderMap(raw) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || "").trim()
    if (!key || v == null) continue
    const val = String(v).trim()
    if (!val) continue
    out[key] = val
  }
  return out
}

/**
 * @param {import("http").IncomingHttpHeaders | Record<string, unknown> | null | undefined} headers
 * @returns {Record<string, string>}
 */
export function flattenHeaders(headers) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!headers || typeof headers !== "object") return out
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue
    out[String(key)] = Array.isArray(value) ? String(value[0]) : String(value)
  }
  return out
}
