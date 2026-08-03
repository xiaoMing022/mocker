import type { Project, RequestExample, RequestLog, Route } from "../types"

function shellQuote(s: string) {
  return `'${String(s).replaceAll("'", `'\\''`)}'`
}

export function buildCurlFromRoute(route: Route, project: Project | null) {
  const base = project?.url || `http://localhost:${project?.port || 4001}`
  const ex: RequestExample = route.requestExample || {}
  const query = ex.query && typeof ex.query === "object" ? ex.query : null
  let url = `${base}${route.path}`
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v != null) qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const active =
    route.scenarios?.find((s) => s.id === route.activeScenarioId) ||
    route.scenarios?.[0]
  const isSse = active?.mode === "sse"

  const parts = [
    isSse ? `curl -sS -N -X ${route.method}` : `curl -sS -X ${route.method}`,
  ]
  const headers: Record<string, string> = { ...(ex.headers || {}) }
  const method = route.method.toUpperCase()
  if (isSse) {
    if (!headers.Accept && !headers.accept) {
      headers.Accept = "text/event-stream"
    }
  }
  if (method !== "GET" && method !== "HEAD") {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json"
    }
  }
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`)
  }
  if (method !== "GET" && method !== "HEAD") {
    const body = ex.body !== undefined ? JSON.stringify(ex.body) : "{}"
    parts.push(`-d ${shellQuote(body)}`)
  }
  parts.push(shellQuote(url))
  return parts.join(" ")
}

export function buildFetchFromRoute(route: Route, project: Project | null) {
  const base = project?.url || `http://localhost:${project?.port || 4001}`
  const ex: RequestExample = route.requestExample || {}
  const query = ex.query && typeof ex.query === "object" ? ex.query : null
  let url = `${base}${route.path}`
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v != null) qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  const active =
    route.scenarios?.find((s) => s.id === route.activeScenarioId) ||
    route.scenarios?.[0]
  const isSse = active?.mode === "sse"

  const headers: Record<string, string> = { ...(ex.headers || {}) }
  if (isSse && !headers.Accept && !headers.accept) {
    headers.Accept = "text/event-stream"
  }
  const method = route.method
  const init: RequestInit = { method, headers: { ...headers } }
  if (method !== "GET" && method !== "HEAD") {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      init.headers = { ...init.headers, "Content-Type": "application/json" }
    }
    init.body = ex.body !== undefined ? JSON.stringify(ex.body) : "{}"
  }
  return { url, init, isSse: Boolean(isSse) }
}

export function buildCurlFromLog(log: RequestLog, project: Project | null) {
  const base = project?.url || ""
  let url = `${base}${log.path || ""}`
  if (log.query && Object.keys(log.query).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(log.query)) {
      if (v != null) qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  const parts = [`curl -sS -X ${log.method || "GET"}`]
  const headers = log.requestHeaders || {}
  let hasContentType = false
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === "content-type") hasContentType = true
    parts.push(`-H ${shellQuote(`${k}: ${v}`)}`)
  }
  const method = String(log.method || "GET").toUpperCase()
  if (method !== "GET" && method !== "HEAD" && log.requestBody != null) {
    if (!hasContentType) {
      parts.push(`-H ${shellQuote("Content-Type: application/json")}`)
    }
    const body =
      typeof log.requestBody === "string"
        ? log.requestBody
        : JSON.stringify(log.requestBody)
    parts.push(`-d ${shellQuote(body)}`)
  }
  parts.push(shellQuote(url.startsWith("http") ? url : `${base}${log.path || ""}`))
  return parts.join(" ")
}
