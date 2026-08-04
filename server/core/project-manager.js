import express from "express"

import {
  isProxyActive,
  loadConfig,
  resolveEffectiveProxy,
  saveConfig,
  validateCreateProject,
  validateProjectPatch,
} from "./config-store.js"
import { createProjectApp } from "./create-project-app.js"
import { createRequestLogStore } from "./request-log.js"
import {
  applyRoutePatch,
  createRouteId,
  loadRoutes,
  saveRoutes,
  validateRoutesPayload,
} from "./route-store.js"
import { createHttpError } from "./util/http-error.js"

/**
 * @param {{
 *   codeProjects: Array<{
 *     slug: string,
 *     name: string,
 *     description?: string,
 *     defaultPort?: number,
 *     createRouter: () => import("express").Router
 *   }>
 * }} options
 */
export function createProjectManager({ codeProjects }) {
  /** @type {import("./config-store.js").AppConfig} */
  let config = loadConfig(codeProjects)

  /** @type {Map<string, import("./route-store.js").DynamicRoute[]>} */
  const routesBySlug = new Map()

  const requestLogs = createRequestLogStore({ maxPerProject: 200 })

  /** @type {Map<string, { server: import("node:http").Server | null, status: string, lastError: string | null, warning: string | null }>} */
  const runtime = new Map()

  /** @type {Map<string, Promise<unknown>>} */
  const startChains = new Map()

  /**
   * Serialize start/stop-critical work per slug so concurrent pause/update don't race.
   * @template T
   * @param {string} slug
   * @param {() => Promise<T> | T} fn
   * @returns {Promise<T>}
   */
  function enqueueStart(slug, fn) {
    const prev = startChains.get(slug) || Promise.resolve()
    const next = prev.catch(() => {}).then(fn)
    startChains.set(
      slug,
      next.finally(() => {
        if (startChains.get(slug) === next) startChains.delete(slug)
      }),
    )
    return next
  }

  function emptyRouter() {
    return express.Router()
  }

  function isCodeProject(slug) {
    return codeProjects.some((p) => p.slug === slug)
  }

  function getCodeProject(slug) {
    return codeProjects.find((p) => p.slug === slug)
  }

  /**
   * Resolve project definition for app factory (code or console-managed).
   */
  function getProjectDef(slug) {
    const code = getCodeProject(slug)
    const rt = config.projects[slug]
    if (!rt) return null

    if (code) {
      return {
        slug: code.slug,
        name: rt.name || code.name,
        description:
          rt.description !== undefined && rt.description !== ""
            ? rt.description
            : code.description || "",
        createRouter: code.createRouter,
        managed: false,
      }
    }

    // Console-only project
    return {
      slug,
      name: rt.name || slug,
      description: rt.description || "",
      createRouter: emptyRouter,
      managed: true,
    }
  }

  function allSlugs() {
    return Object.keys(config.projects)
  }

  function ensureKnown(slug) {
    if (!config.projects[slug]) {
      throw createHttpError(404, `Unknown project: ${slug}`)
    }
  }

  function ensureRuntime(slug) {
    if (!runtime.has(slug)) {
      runtime.set(slug, {
        server: null,
        status: "stopped",
        lastError: null,
        warning: null,
      })
    }
    if (!routesBySlug.has(slug)) {
      routesBySlug.set(slug, loadRoutes(slug))
    }
  }

  function buildView(slug) {
    const def = getProjectDef(slug)
    const rt = config.projects[slug]
    const state = runtime.get(slug)
    if (!def || !rt || !state) return null

    const effectiveProxy = resolveEffectiveProxy(rt)
    const proxyActive = isProxyActive(effectiveProxy.enabled, effectiveProxy.target)
    let warning = state.warning
    if (effectiveProxy.enabled && !proxyActive) {
      warning =
        warning ||
        (effectiveProxy.target
          ? "proxy enabled but target is invalid; forwarding is off"
          : "proxy enabled but target is empty; forwarding is off")
    }

    const routes = routesBySlug.get(slug) || []

    // Prefer paused over generic stopped when project is disabled
    let status = state.status
    if (!rt.enabled) {
      status = "paused"
    }

    const environments = {}
    for (const [id, env] of Object.entries(rt.environments || {})) {
      environments[id] = {
        name: env.name,
        proxy: {
          enabled: env.proxy.enabled,
          target: env.proxy.target,
          rules: env.proxy.rules || [],
          headers: env.proxy.headers || {},
        },
      }
    }

    return {
      slug: def.slug,
      name: def.name,
      description: def.description ?? "",
      enabled: rt.enabled,
      paused: !rt.enabled,
      port: rt.port,
      activeEnvironment: rt.activeEnvironment || "default",
      environments,
      proxy: {
        enabled: effectiveProxy.enabled,
        target: effectiveProxy.target,
        active: proxyActive,
        rules: effectiveProxy.rules || [],
        headers: effectiveProxy.headers || {},
      },
      status,
      lastError: state.lastError,
      warning,
      url: status === "listening" ? `http://localhost:${rt.port}` : null,
      routeCount: routes.length,
      enabledRouteCount: routes.filter((r) => r.enabled).length,
      managed: Boolean(rt.managed) || !isCodeProject(slug),
    }
  }

  async function stopProject(slug) {
    const state = runtime.get(slug)
    if (!state) return

    const server = state.server
    state.server = null

    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve())
        setTimeout(() => resolve(), 2000).unref?.()
      })
    }

    if (state.status !== "error") {
      state.status = "stopped"
    }
  }

  async function startProjectUnlocked(slug) {
    const def = getProjectDef(slug)
    const rt = config.projects[slug]
    ensureRuntime(slug)
    const state = runtime.get(slug)

    if (!def || !rt || !state) {
      throw createHttpError(404, `Unknown project: ${slug}`)
    }

    await stopProject(slug)

    if (!rt.enabled) {
      // Intentional pause: release port, keep config + routes
      state.status = "paused"
      state.lastError = null
      state.warning = null
      console.log(`[project:${slug}] paused (port released)`)
      return
    }

    state.status = "starting"
    state.lastError = null
    state.warning = null

    const effectiveProxy = resolveEffectiveProxy(rt)
    // Ensure runtime.proxy mirrors effective (createProjectApp reads runtime.proxy)
    rt.proxy = effectiveProxy

    if (effectiveProxy.enabled && !isProxyActive(true, effectiveProxy.target)) {
      state.warning = effectiveProxy.target
        ? "proxy enabled but target is invalid; forwarding is off"
        : "proxy enabled but target is empty; forwarding is off"
    }

    if (!routesBySlug.has(slug)) {
      routesBySlug.set(slug, loadRoutes(slug))
    }

    const app = createProjectApp({
      project: def,
      runtime: rt,
      getRoutes: () => routesBySlug.get(slug) || [],
      onRequestLog: (entry) => {
        requestLogs.append(slug, entry)
      },
    })

    await new Promise((resolve, reject) => {
      const server = app.listen(rt.port, () => {
        state.server = server
        state.status = "listening"
        state.lastError = null
        console.log(
          `[project:${slug}] listening on http://localhost:${rt.port}` +
            (state.warning ? ` (warning: ${state.warning})` : ""),
        )
        resolve()
      })

      server.on("error", (error) => {
        state.server = null
        state.status = "error"
        state.lastError = error.message
        console.error(`[project:${slug}] failed to listen on ${rt.port}: ${error.message}`)
        reject(error)
      })
    }).catch(() => {
      // status already set
    })
  }

  async function startProject(slug) {
    return enqueueStart(slug, () => startProjectUnlocked(slug))
  }

  async function startAll() {
    config = loadConfig(codeProjects)
    for (const slug of allSlugs()) {
      ensureRuntime(slug)
      routesBySlug.set(slug, loadRoutes(slug))
      await startProject(slug)
    }
  }

  async function reloadProject(slug) {
    ensureKnown(slug)
    config = loadConfig(codeProjects)
    ensureRuntime(slug)
    routesBySlug.set(slug, loadRoutes(slug))
    await startProject(slug)
    return buildView(slug)
  }

  async function updateProject(slug, patch) {
    ensureKnown(slug)
    config = loadConfig(codeProjects)

    const result = validateProjectPatch(slug, patch, config, allSlugs())
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }

    config = {
      ...config,
      projects: {
        ...config.projects,
        [slug]: result.value,
      },
    }
    saveConfig(config)
    ensureRuntime(slug)
    await startProject(slug)
    return buildView(slug)
  }

  /** Pause: disable + release port (config & routes kept). */
  async function pauseProject(slug) {
    return updateProject(slug, { enabled: false })
  }

  /** Resume: enable + listen. */
  async function resumeProject(slug) {
    return updateProject(slug, { enabled: true })
  }

  /**
   * Create a console-managed project (no code required).
   */
  async function createProject(body) {
    config = loadConfig(codeProjects)
    const codeSlugs = codeProjects.map((p) => p.slug)
    const result = validateCreateProject(body, config, codeSlugs)
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }

    const { slug, runtime: rt } = result.value
    config = {
      ...config,
      projects: {
        ...config.projects,
        [slug]: rt,
      },
    }
    saveConfig(config)
    saveRoutes(slug, [])
    ensureRuntime(slug)
    routesBySlug.set(slug, [])
    await startProject(slug)
    return buildView(slug)
  }

  /**
   * Delete a console-managed project. Code projects cannot be deleted.
   */
  async function deleteProject(slug) {
    ensureKnown(slug)
    if (isCodeProject(slug)) {
      throw createHttpError(400, "代码注册项目不能删除，请使用「暂停」停用端口")
    }

    await stopProject(slug)
    config = loadConfig(codeProjects)
    const { [slug]: _removed, ...rest } = config.projects
    config = { ...config, projects: rest }
    saveConfig(config)
    runtime.delete(slug)
    routesBySlug.delete(slug)
    requestLogs.clear(slug)
    // leave routes.json on disk for recovery; optional cleanup not required
    return { ok: true, slug }
  }

  function listRoutes(slug) {
    ensureKnown(slug)
    ensureRuntime(slug)
    return routesBySlug.get(slug) || loadRoutes(slug)
  }

  function setRoutesInMemory(slug, routes) {
    routesBySlug.set(slug, routes)
  }

  function replaceRoutes(slug, routesInput) {
    ensureKnown(slug)
    const result = validateRoutesPayload(routesInput)
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }
    saveRoutes(slug, result.routes)
    setRoutesInMemory(slug, result.routes)
    return result.routes
  }

  function createRoute(slug, body) {
    ensureKnown(slug)
    ensureRuntime(slug)
    const current = [...(routesBySlug.get(slug) || [])]
    const withId = { ...body, id: body?.id || createRouteId() }
    const result = validateRoutesPayload([...current, withId])
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }
    saveRoutes(slug, result.routes)
    setRoutesInMemory(slug, result.routes)
    return result.routes.find((r) => r.id === withId.id) || result.routes.at(-1)
  }

  function updateRoute(slug, id, patch) {
    ensureKnown(slug)
    ensureRuntime(slug)
    const current = routesBySlug.get(slug) || []
    const idx = current.findIndex((r) => r.id === id)
    if (idx < 0) {
      throw createHttpError(404, `Route not found: ${id}`)
    }
    const nextRoute = applyRoutePatch(current[idx], patch)
    if (!nextRoute) {
      throw createHttpError(400, "Invalid route patch")
    }
    const next = current.map((r, i) => (i === idx ? nextRoute : r))
    const result = validateRoutesPayload(next)
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }
    saveRoutes(slug, result.routes)
    setRoutesInMemory(slug, result.routes)
    return result.routes.find((r) => r.id === id)
  }

  function deleteRoute(slug, id) {
    ensureKnown(slug)
    ensureRuntime(slug)
    const current = routesBySlug.get(slug) || []
    const next = current.filter((r) => r.id !== id)
    if (next.length === current.length) {
      throw createHttpError(404, `Route not found: ${id}`)
    }
    saveRoutes(slug, next)
    setRoutesInMemory(slug, next)
    return { ok: true }
  }

  function setActiveScenario(slug, routeId, scenarioId) {
    ensureKnown(slug)
    ensureRuntime(slug)
    const current = routesBySlug.get(slug) || []
    const idx = current.findIndex((r) => r.id === routeId)
    if (idx < 0) {
      throw createHttpError(404, `Route not found: ${routeId}`)
    }
    const route = current[idx]
    if (!route.scenarios.some((s) => s.id === scenarioId)) {
      throw createHttpError(404, `Scenario not found: ${scenarioId}`)
    }
    return updateRoute(slug, routeId, { activeScenarioId: scenarioId })
  }

  function listLogs(slug, filter = {}) {
    ensureKnown(slug)
    return requestLogs.list(slug, filter)
  }

  function getLog(slug, id) {
    ensureKnown(slug)
    const log = requestLogs.get(slug, id)
    if (!log) {
      throw createHttpError(404, `Log not found: ${id}`)
    }
    return log
  }

  function clearLogs(slug) {
    ensureKnown(slug)
    requestLogs.clear(slug)
    return { ok: true }
  }

  /**
   * Create or append a mock scenario from a captured request log.
   * @param {string} slug
   * @param {string} logId
   * @param {{ name?: string, setActive?: boolean, useAsMatch?: boolean } } [opts]
   */
  function createScenarioFromLog(slug, logId, opts = {}) {
    ensureKnown(slug)
    ensureRuntime(slug)
    const log = requestLogs.get(slug, logId)
    if (!log) {
      throw createHttpError(404, `Log not found: ${logId}`)
    }

    const method = String(log.method || "GET").toUpperCase()
    const path = String(log.path || "/")
    const scenarioName =
      opts.name ||
      `从日志 ${log.id}${log.status != null ? ` · ${log.status}` : ""}`

    /** @type {import("./route-store.js").ScenarioMatch | null} */
    let match = null
    if (opts.useAsMatch) {
      match = {}
      if (log.query && Object.keys(log.query).length) match.query = { ...log.query }
      if (log.requestHeaders) {
        const h = {}
        for (const [k, v] of Object.entries(log.requestHeaders)) {
          if (k === "content-type") continue
          if (v) h[k] = v
        }
        if (Object.keys(h).length) match.headers = h
      }
      if (log.requestBody && typeof log.requestBody === "object" && !log.requestBody._truncated) {
        // shallow top-level string/number fields as body match
        /** @type {Record<string, string>} */
        const body = {}
        for (const [k, v] of Object.entries(log.requestBody)) {
          if (v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
            body[k] = String(v)
          }
        }
        if (Object.keys(body).length) match.body = body
      }
      if (!match.headers && !match.query && !match.body) match = null
    }

    const scenario = {
      id: createRouteId(),
      name: scenarioName,
      statusCode: log.status && log.status >= 100 && log.status <= 599 ? log.status : 200,
      delayMs: 0,
      response:
        log.responseBody != null
          ? log.responseBody
          : { code: log.status || 200, message: "from-log", data: null },
      headers: {},
      match,
    }

    const routes = [...(routesBySlug.get(slug) || [])]
    const idx = routes.findIndex((r) => r.method === method && r.path === path)
    let route
    if (idx >= 0) {
      const current = routes[idx]
      const scenarios = [...current.scenarios, scenario]
      route = {
        ...current,
        scenarios,
        activeScenarioId: opts.setActive !== false ? scenario.id : current.activeScenarioId,
      }
      routes[idx] = route
    } else {
      route = {
        id: createRouteId(),
        name: `${method} ${path}`,
        method,
        path,
        enabled: true,
        activeScenarioId: scenario.id,
        scenarios: [scenario],
        note: `从日志 ${log.id} 创建`,
        requestExample: {
          headers: log.requestHeaders || undefined,
          query: log.query || undefined,
          body: log.requestBody ?? undefined,
        },
      }
      routes.push(route)
    }

    const result = validateRoutesPayload(routes)
    if (!result.ok) {
      throw createHttpError(400, result.errors.join("; "), result.errors)
    }
    saveRoutes(slug, result.routes)
    setRoutesInMemory(slug, result.routes)
    return {
      route: result.routes.find((r) => r.method === method && r.path === path),
      scenario,
      logId,
    }
  }

  function listProjects() {
    return allSlugs()
      .map((slug) => {
        ensureRuntime(slug)
        return buildView(slug)
      })
      .filter(Boolean)
  }

  function getProject(slug) {
    if (!config.projects[slug]) return null
    ensureRuntime(slug)
    return buildView(slug)
  }

  /**
   * Switch active environment (proxy upstream) without changing routes.
   * @param {string} slug
   * @param {string} environmentId
   */
  async function setActiveEnvironment(slug, environmentId) {
    ensureKnown(slug)
    return updateProject(slug, { activeEnvironment: environmentId })
  }

  function getConfig() {
    return config
  }

  async function stopAll() {
    for (const slug of allSlugs()) {
      await stopProject(slug)
    }
  }

  return {
    startAll,
    stopAll,
    listProjects,
    getProject,
    createProject,
    updateProject,
    pauseProject,
    resumeProject,
    deleteProject,
    reloadProject,
    getConfig,
    listRoutes,
    replaceRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    setActiveScenario,
    listLogs,
    getLog,
    clearLogs,
    createScenarioFromLog,
    setActiveEnvironment,
  }
}
