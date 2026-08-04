export class ApiError extends Error {
  status: number
  errors?: string[]

  constructor(message: string, status: number, errors?: string[]) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.errors = errors
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (data as { message?: string }).message ||
      (data as { errors?: string[] }).errors?.join("; ") ||
      `HTTP ${res.status}`
    throw new ApiError(message, res.status, (data as { errors?: string[] }).errors)
  }
  return data
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parse(res) as Promise<T>
}

export const mockApi = {
  health: () => api<{ ok: boolean; projects?: unknown[] }>("GET", "/health"),

  listProjects: () => api<{ projects: import("../types").Project[] }>("GET", "/__mock/projects"),

  createProject: (body: unknown) =>
    api<{ project: import("../types").Project }>("POST", "/__mock/projects", body),

  updateProject: (slug: string, body: unknown) =>
    api<{ project: import("../types").Project }>("PATCH", `/__mock/projects/${slug}`, body),

  pauseProject: (slug: string) =>
    api<{ project: import("../types").Project }>("POST", `/__mock/projects/${slug}/pause`),

  resumeProject: (slug: string) =>
    api<{ project: import("../types").Project }>("POST", `/__mock/projects/${slug}/resume`),

  reloadProject: (slug: string) =>
    api<{ project: import("../types").Project }>("POST", `/__mock/projects/${slug}/reload`),

  setActiveEnvironment: (slug: string, id: string) =>
    api<{ project: import("../types").Project }>(
      "POST",
      `/__mock/projects/${slug}/environment`,
      { id },
    ),

  deleteProject: (slug: string) => api("DELETE", `/__mock/projects/${slug}`),

  listRoutes: (slug: string) =>
    api<{ routes: import("../types").Route[] }>("GET", `/__mock/projects/${slug}/routes`),

  createRoute: (slug: string, body: unknown) =>
    api<{ route: import("../types").Route }>("POST", `/__mock/projects/${slug}/routes`, body),

  updateRoute: (slug: string, id: string, body: unknown) =>
    api<{ route: import("../types").Route }>(
      "PATCH",
      `/__mock/projects/${slug}/routes/${id}`,
      body,
    ),

  deleteRoute: (slug: string, id: string) =>
    api("DELETE", `/__mock/projects/${slug}/routes/${id}`),

  replaceRoutes: (slug: string, routes: unknown) =>
    api("PUT", `/__mock/projects/${slug}/routes`, { routes }),

  activateScenario: (slug: string, routeId: string, scenarioId: string) =>
    api("POST", `/__mock/projects/${slug}/routes/${routeId}/activate-scenario`, {
      scenarioId,
    }),

  listLogs: (
    slug: string,
    q: { limit?: number; source?: string; method?: string; path?: string } = {},
  ) => {
    const params = new URLSearchParams()
    params.set("limit", String(q.limit ?? 100))
    if (q.source) params.set("source", q.source)
    if (q.method) params.set("method", q.method)
    if (q.path) params.set("path", q.path)
    return api<{ logs: import("../types").RequestLog[] }>(
      "GET",
      `/__mock/projects/${slug}/logs?${params}`,
    )
  },

  getLog: (slug: string, id: string) =>
    api<{ log: import("../types").RequestLog }>("GET", `/__mock/projects/${slug}/logs/${id}`),

  clearLogs: (slug: string) => api("DELETE", `/__mock/projects/${slug}/logs`),

  logToScenario: (
    slug: string,
    id: string,
    body: { name?: string; useAsMatch?: boolean; setActive?: boolean },
  ) =>
    api<{
      route: import("../types").Route
      scenario: import("../types").Scenario
    }>("POST", `/__mock/projects/${slug}/logs/${id}/to-scenario`, body),
}
