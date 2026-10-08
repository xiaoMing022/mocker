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

export type PaginationParamSource =
  | "query"
  | "body"
  | "query-then-body"
  | "body-then-query"

export type PaginationStyle = "page" | "offset"

export type PaginationPreset =
  | "page-pageSize"
  | "pageNum-pageSize"
  | "offset-limit"

/** Route default or scenario override for JSON list pagination. */
export type PaginationConfig = {
  enabled?: boolean
  preset?: PaginationPreset | null
  paramSource?: PaginationParamSource
  pageParam?: string
  pageSizeParam?: string
  offsetParam?: string
  limitParam?: string
  style?: PaginationStyle
  pageBase?: 0 | 1
  defaultPageSize?: number
  maxPageSize?: number
  listPath?: string
  totalPath?: string | null
  pagePath?: string | null
  pageSizePath?: string | null
  totalPagesPath?: string | null
  hasMorePath?: string | null
}

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
  /** null/undefined = inherit route; { enabled: false } = off; else override */
  pagination?: PaginationConfig | null
  /** spec scenarios are owned by `mocker apply`; console scenarios are local adjustments */
  origin?: "spec" | "console"
  /** Lowercase labels used to filter and switch scenarios. Not a second name. */
  tags?: string[]
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
  /** Interface-level default pagination transform */
  pagination?: PaginationConfig | null
  origin?: "spec" | "console"
}

export type ChannelKind = "websocket" | "rtc"

export type Channel = {
  id: string
  name: string
  kind: ChannelKind
  enabled: boolean
  bind?: { path: string } | null
  origin?: "spec" | "console"
  /** Always unimplemented until a protocol runtime is attached */
  runtime: "unimplemented"
}

export type RequestLog = {
  id: string
  ts: string
  method: string
  path: string
  /** Matched route template, such as /api/orders/:id, when the request path differs. */
  routePath?: string | null
  query?: Record<string, string> | null
  requestHeaders?: Record<string, string> | null
  requestBody?: unknown
  responseBody?: unknown
  status: number | null
  durationMs: number | null
  source: "dynamic" | "code" | "proxy" | "miss" | "unknown" | string
  scenarioName?: string | null
  scenarioOrigin?: "spec" | "console" | null
  routeName?: string | null
  matchedByCondition?: boolean
  proxyTarget?: string | null
}

export type TabKey = "overview" | "routes" | "logs" | "channels"
