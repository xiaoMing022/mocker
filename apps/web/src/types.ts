export type ProxyRule = {
  pathPrefix: string
  target?: string
  enabled?: boolean
}

export type ProxyConfig = {
  enabled: boolean
  target: string
  active?: boolean
  rules?: ProxyRule[]
  /** Extra request headers attached when proxying under this environment */
  headers?: Record<string, string>
}

export type ProjectEnvironment = {
  name: string
  proxy: ProxyConfig
}

export type Project = {
  slug: string
  name: string
  description?: string
  enabled: boolean
  /** true when project is paused (port released, config kept) */
  paused?: boolean
  port: number
  /** Active environment id (test / gray / prod / default …) */
  activeEnvironment?: string
  /** Named environments; routes are shared across environments */
  environments?: Record<string, ProjectEnvironment>
  proxy: ProxyConfig
  status: string
  lastError?: string | null
  warning?: string | null
  url?: string | null
  routeCount?: number
  enabledRouteCount?: number
  managed?: boolean
}

export type ScenarioMatch = {
  headers?: Record<string, string>
  query?: Record<string, string>
  body?: Record<string, string>
}

export type RequestExample = {
  headers?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
}

export type ScenarioMode = "json" | "sse"

export type SseEvent = {
  event?: string
  data?: unknown
  id?: string
  retry?: number
  delayMs?: number
}

export type ScenarioStream = {
  events: SseEvent[]
  endWithDone?: boolean
  keepAliveMs?: number
}

export type Scenario = {
  id: string
  name: string
  statusCode: number
  delayMs: number
  response: unknown
  headers: Record<string, string>
  match?: ScenarioMatch | null
  mode?: ScenarioMode
  stream?: ScenarioStream | null
}

export type Route = {
  id: string
  name: string
  method: string
  path: string
  enabled: boolean
  activeScenarioId: string
  scenarios: Scenario[]
  note?: string
  requestExample?: RequestExample | null
  /**
   * Extra request headers when this path is proxied to upstream
   * (merged after client headers; same-name keys override).
   */
  proxyHeaders?: Record<string, string>
}

export type RequestLog = {
  id: string
  ts: string
  method: string
  path: string
  query?: Record<string, string> | null
  requestHeaders?: Record<string, string> | null
  requestBody?: unknown
  responseBody?: unknown
  status: number | null
  durationMs: number | null
  source: "dynamic" | "code" | "proxy" | "miss" | "unknown" | string
  scenarioName?: string | null
  routeName?: string | null
  matchedByCondition?: boolean
  proxyTarget?: string | null
}

export type TabKey = "overview" | "routes" | "logs"
