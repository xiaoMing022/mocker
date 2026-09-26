import express from "express"

import {
  allocatePort,
  isProxyActive,
  loadConfig,
  resolveAdminPort,
  resolveEffectiveProxy,
  saveConfig,
  validateCreateProject,
  validateProjectPatch,
} from "./config-store.js"
import { mergeSpecChannels, mergeSpecRoutes, parseApplyDocument } from "./apply-spec.js"
import { attachChannels } from "./channels/attach.js"
import {
  loadChannels,
  saveChannels,
  toChannelView,
  validateChannelsPayload,
} from "./channel-store.js"
import { createProjectApp } from "./create-project-app.js"
import { buildProjectView } from "./project/views.js"
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

  /** @type {Map<string, import("./channel-store.js").Channel[]>} */
  const channelsBySlug = new Map()

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
    if (!channelsBySlug.has(slug)) {
      channelsBySlug.set(slug, loadChannels(slug))
    }
  }

  function buildView(slug) {
    const def = getProjectDef(slug)
    const rt = config.projects[slug]
    const state = runtime.get(slug)
    if (!def || !rt || !state) return null

    return buildProjectView({
      slug,
      def,
      rt,
      state,
      routes: routesBySlug.get(slug) || [],
      managed: Boolean(rt.managed) || !isCodeProject(slug),
    })
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

  /**
   * Ports reserved by admin + every other project (enabled or paused).
   * Paused projects still hold their configured port so resume is reliable.
   * @param {string} [exceptSlug]
   */
  function collectUsedPorts(exceptSlug) {
    const used = new Set([resolveAdminPort(config)])
    for (const [s, p] of Object.entries(config.projects)) {
      if (s === exceptSlug) continue
      if (p?.port) used.add(p.port)
    }
    return used
  }

  function isAddrInUseError(error) {
    if (!error) return false
    if (error.code === "EADDRINUSE") return true
    return /EADDRINUSE|address already in use/i.test(String(error.message || error))
  }

  /**
   * Resolve config port collisions. Paused projects reserve first so their
   * ports are not handed to projects that start later.
   */
  function reassignConflictingPortsInConfig() {
    const used = new Set([resolveAdminPort(config)])
    let dirty = false
    /** @type {string[]} */
    const notes = []

    /**
     * @param {string} slug
     * @param {import("./config-store.js").RuntimeConfig} rt
     */
    function claimOrReassign(slug, rt) {
      if (!used.has(rt.port)) {
        used.add(rt.port)
        return
      }
      const old = rt.port
      const next = allocatePort(used, old + 1)
      rt.port = next
      used.add(next)
      dirty = true
      notes.push(`${slug}: ${old}→${next}`)
      console.warn(
        `[project:${slug}] port ${old} conflicts with a reserved port; auto-switched to ${next}`,
      )
    }

    // 1) Paused / disabled first — they keep (or lightly reassign among themselves)
    for (const slug of allSlugs()) {
      const rt = config.projects[slug]
      if (!rt || rt.enabled) continue
      claimOrReassign(slug, rt)
    }

    // 2) Enabled projects — never steal a paused project's reserved port
    for (const slug of allSlugs()) {
      const rt = config.projects[slug]
      if (!rt || !rt.enabled) continue
      claimOrReassign(slug, rt)
    }

    if (dirty) {
      saveConfig(config)
      if (notes.length) {
        console.warn(`[config] reassigned conflicting ports: ${notes.join(", ")}`)
      }
    }
    return dirty
  }

  /**
   * @param {import("express").Express} app
   * @param {number} port
   * @returns {Promise<import("node:http").Server>}
   */
  function listenOnce(app, port) {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => resolve(server))
      server.once("error", (error) => {
        try {
          server.close()
        } catch {
          /* ignore */
        }
        reject(error)
      })
    })
  }

  async function startProjectUnlocked(slug) {
    const def = getProjectDef(slug)
    let rt = config.projects[slug]
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

    // Prefer a free port if config collides with another project's reserved port
    // (including paused projects — they still hold their port for resume).
    {
      const used = collectUsedPorts(slug)
      if (used.has(rt.port)) {
        const old = rt.port
        const next = allocatePort(used, old + 1)
        rt.port = next
        config.projects[slug] = rt
        saveConfig(config)
        state.warning = `port ${old} 已被其他项目预留，已自动切换到 ${next}`
        console.warn(
          `[project:${slug}] port ${old} reserved by another project; auto-switched to ${next}`,
        )
      }
    }

    const effectiveProxy = resolveEffectiveProxy(rt)
    // Ensure runtime.proxy mirrors effective (createProjectApp reads runtime.proxy)
    rt.proxy = effectiveProxy

    if (effectiveProxy.enabled && !isProxyActive(true, effectiveProxy.target)) {
      const proxyWarn = effectiveProxy.target
        ? "proxy enabled but target is invalid; forwarding is off"
        : "proxy enabled but target is empty; forwarding is off"
      state.warning = state.warning ? `${state.warning}; ${proxyWarn}` : proxyWarn
    }

    if (!routesBySlug.has(slug)) {
      routesBySlug.set(slug, loadRoutes(slug))
    }

    const maxAttempts = 25
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // Re-read in case port was updated mid-loop
      rt = config.projects[slug]
      const app = createProjectApp({
        project: def,
        runtime: rt,
        getRoutes: () => routesBySlug.get(slug) || [],
        onRequestLog: (entry) => {
          requestLogs.append(slug, entry)
        },
      })

      try {
        const server = await listenOnce(app, rt.port)
        attachChannels(server, channelsBySlug.get(slug) || [])
        state.server = server
        state.status = "listening"
        state.lastError = null
        console.log(
          `[project:${slug}] listening on http://localhost:${rt.port}` +
            (state.warning ? ` (warning: ${state.warning})` : ""),
        )
        return
      } catch (error) {
        if (!isAddrInUseError(error) || attempt === maxAttempts - 1) {
          state.server = null
          state.status = "error"
          state.lastError =
            error instanceof Error ? error.message : String(error)
          console.error(
            `[project:${slug}] failed to listen on ${rt.port}: ${state.lastError}`,
          )
          return
        }

        const used = collectUsedPorts(slug)
        used.add(rt.port)
        const old = rt.port
        const next = allocatePort(used, old + 1)
        rt.port = next
        config.projects[slug] = rt
        saveConfig(config)
        const note = `port ${old} 已被占用，已自动切换到 ${next}`
        state.warning = state.warning ? `${state.warning}; ${note}` : note
        console.warn(`[project:${slug}] ${note}`)
      }
    }
  }

  async function startProject(slug) {
    return enqueueStart(slug, () => startProjectUnlocked(slug))
  }

  async function startAll() {
    config = loadConfig(codeProjects)
    reassignConflictingPortsInConfig()
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
    channelsBySlug.set(slug, loadChannels(slug))
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
    channelsBySlug.set(slug, [])
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
    channelsBySlug.delete(slug)
    requestLogs.clear(slug)
    // leave routes.json on disk for recovery; optional cleanup not required
    return { ok: true, slug }
  }

  function listRoutes(slug) {
    ensureKnown(slug)
    ensureRuntime(slug)
    return routesBySlug.get(slug) || loadRoutes(slug)
  }

  function listChannels(slug) {
    ensureKnown(slug)
    ensureRuntime(slug)
    return (channelsBySlug.get(slug) || []).map(toChannelView)
  }

  /**
   * @param {string} slug
   * @param {string} id
   * @param {unknown} enabled
   */
  function setChannelEnabled(slug, id, enabled) {
    ensureKnown(slug)
    ensureRuntime(slug)
    if (typeof enabled !== "boolean") {
      throw createHttpError(400, "enabled must be a boolean")
    }
    const current = channelsBySlug.get(slug) || []
    const idx = current.findIndex((channel) => channel.id === id)
    if (idx < 0) {
      throw createHttpError(404, `Channel not found: ${id}`)
    }
    const next = current.map((channel, index) =>
      index === idx ? { ...channel, enabled } : channel,
    )
    saveChannels(slug, next)
    channelsBySlug.set(slug, next)
    const state = runtime.get(slug)
    if (state?.server) attachChannels(state.server, next)
    return toChannelView(next[idx])
  }

  /**
   * Apply a declarative spec. Does not replace console-owned routes.
   * @param {string} slug
   * @param {unknown} document
   */
  function applySpec(slug, document) {
    ensureKnown(slug)
    ensureRuntime(slug)
    if (document && typeof document === "object" && !Array.isArray(document)) {
      const declared = document.project
      if (typeof declared === "string" && declared.trim() && declared.trim() !== slug) {
        throw createHttpError(400, `document project ${declared.trim()} does not match ${slug}`)
      }
    }
    const parsed = parseApplyDocument(document)
    if (!parsed.ok) {
      throw createHttpError(400, parsed.errors.join("; "), parsed.errors)
    }

    /** @type {ReturnType<typeof mergeSpecRoutes>["report"] | null} */
    let routeReport = null
    if (parsed.routes) {
      const merged = mergeSpecRoutes(routesBySlug.get(slug) || [], parsed.routes)
      const validated = validateRoutesPayload(merged.routes)
      if (!validated.ok) {
        throw createHttpError(400, validated.errors.join("; "), validated.errors)
      }
      saveRoutes(slug, validated.routes)
      routesBySlug.set(slug, validated.routes)
      routeReport = merged.report
    }

    /** @type {ReturnType<typeof mergeSpecChannels>["report"] | null} */
    let channelReport = null
    if (parsed.channels) {
      const merged = mergeSpecChannels(channelsBySlug.get(slug) || [], parsed.channels)
      const validated = validateChannelsPayload(merged.channels)
      if (!validated.ok) {
        throw createHttpError(400, validated.errors.join("; "), validated.errors)
      }
      saveChannels(slug, validated.channels)
      channelsBySlug.set(slug, validated.channels)
      const state = runtime.get(slug)
      if (state?.server) attachChannels(state.server, validated.channels)
      channelReport = merged.report
    }

    return {
      project: slug,
      routes: routeReport,
      channels: {
        created: channelReport?.created ?? [],
        updated: channelReport?.updated ?? [],
        removed: channelReport?.removed ?? [],
        items: (channelsBySlug.get(slug) || []).map(toChannelView),
      },
    }
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
    listChannels,
    setChannelEnabled,
    applySpec,
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
