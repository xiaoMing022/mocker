import express from "express"

import {
  isProxyActive,
  loadConfig,
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
      throw Object.assign(new Error(`Unknown project: ${slug}`), { statusCode: 404 })
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

    const proxyActive = isProxyActive(rt.proxy.enabled, rt.proxy.target)
    let warning = state.warning
    if (rt.proxy.enabled && !proxyActive) {
      warning =
        warning ||
        (rt.proxy.target
          ? "proxy enabled but target is invalid; forwarding is off"
          : "proxy enabled but target is empty; forwarding is off")
    }

    const routes = routesBySlug.get(slug) || []

    return {
      slug: def.slug,
      name: def.name,
      description: def.description ?? "",
      enabled: rt.enabled,
      port: rt.port,
      proxy: {
        enabled: rt.proxy.enabled,
        target: rt.proxy.target,
        active: proxyActive,
      },
      status: state.status,
      lastError: state.lastError,
      warning,
      url: state.status === "listening" ? `http://localhost:${rt.port}` : null,
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

  async function startProject(slug) {
    const def = getProjectDef(slug)
    const rt = config.projects[slug]
    ensureRuntime(slug)
    const state = runtime.get(slug)

    if (!def || !rt || !state) {
      throw new Error(`Unknown project: ${slug}`)
    }

    await stopProject(slug)

    if (!rt.enabled) {
      state.status = "stopped"
      state.lastError = null
      state.warning = null
      console.log(`[project:${slug}] closed (disabled)`)
      return
    }

    state.status = "starting"
    state.lastError = null
    state.warning = null

    if (rt.proxy.enabled && !isProxyActive(true, rt.proxy.target)) {
      state.warning = rt.proxy.target
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
      const error = new Error(result.errors.join("; "))
      error.statusCode = 400
      error.errors = result.errors
      throw error
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

  /**
   * Close project = disable + stop listen.
   */
  async function closeProject(slug) {
    return updateProject(slug, { enabled: false })
  }

  /**
   * Open project = enable + listen.
   */
  async function openProject(slug) {
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
      const error = new Error(result.errors.join("; "))
      error.statusCode = 400
      error.errors = result.errors
      throw error
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
      throw Object.assign(
        new Error("代码注册项目不能删除，请使用「关闭项目」停用"),
        { statusCode: 400 },
      )
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
      const error = new Error(result.errors.join("; "))
      error.statusCode = 400
      error.errors = result.errors
      throw error
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
      const error = new Error(result.errors.join("; "))
      error.statusCode = 400
      error.errors = result.errors
      throw error
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
      throw Object.assign(new Error(`Route not found: ${id}`), { statusCode: 404 })
    }
    const nextRoute = applyRoutePatch(current[idx], patch)
    if (!nextRoute) {
      throw Object.assign(new Error("Invalid route patch"), { statusCode: 400 })
    }
    const next = current.map((r, i) => (i === idx ? nextRoute : r))
    const result = validateRoutesPayload(next)
    if (!result.ok) {
      const error = new Error(result.errors.join("; "))
      error.statusCode = 400
      error.errors = result.errors
      throw error
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
      throw Object.assign(new Error(`Route not found: ${id}`), { statusCode: 404 })
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
      throw Object.assign(new Error(`Route not found: ${routeId}`), { statusCode: 404 })
    }
    const route = current[idx]
    if (!route.scenarios.some((s) => s.id === scenarioId)) {
      throw Object.assign(new Error(`Scenario not found: ${scenarioId}`), {
        statusCode: 404,
      })
    }
    return updateRoute(slug, routeId, { activeScenarioId: scenarioId })
  }

  function listLogs(slug, limit) {
    ensureKnown(slug)
    return requestLogs.list(slug, limit)
  }

  function clearLogs(slug) {
    ensureKnown(slug)
    requestLogs.clear(slug)
    return { ok: true }
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
    closeProject,
    openProject,
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
    clearLogs,
  }
}
