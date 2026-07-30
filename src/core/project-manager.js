import { isProxyActive, loadConfig, saveConfig, validateProjectPatch } from "./config-store.js"
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

  for (const project of codeProjects) {
    runtime.set(project.slug, {
      server: null,
      status: "stopped",
      lastError: null,
      warning: null,
    })
    routesBySlug.set(project.slug, loadRoutes(project.slug))
  }

  function getCodeProject(slug) {
    return codeProjects.find((p) => p.slug === slug)
  }

  function ensureKnown(slug) {
    if (!getCodeProject(slug)) {
      throw Object.assign(new Error(`Unknown project: ${slug}`), { statusCode: 404 })
    }
  }

  function buildView(slug) {
    const code = getCodeProject(slug)
    const rt = config.projects[slug]
    const state = runtime.get(slug)

    if (!code || !rt || !state) return null

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
      slug: code.slug,
      name: code.name,
      description: code.description ?? "",
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
    const code = getCodeProject(slug)
    const rt = config.projects[slug]
    const state = runtime.get(slug)

    if (!code || !rt || !state) {
      throw new Error(`Unknown project: ${slug}`)
    }

    await stopProject(slug)

    if (!rt.enabled) {
      state.status = "stopped"
      state.lastError = null
      state.warning = null
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

    // Refresh routes from memory map (already loaded / updated)
    if (!routesBySlug.has(slug)) {
      routesBySlug.set(slug, loadRoutes(slug))
    }

    const app = createProjectApp({
      project: code,
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
    for (const project of codeProjects) {
      if (!runtime.has(project.slug)) {
        runtime.set(project.slug, {
          server: null,
          status: "stopped",
          lastError: null,
          warning: null,
        })
      }
      routesBySlug.set(project.slug, loadRoutes(project.slug))
      await startProject(project.slug)
    }
  }

  async function reloadProject(slug) {
    ensureKnown(slug)
    config = loadConfig(codeProjects)
    routesBySlug.set(slug, loadRoutes(slug))
    await startProject(slug)
    return buildView(slug)
  }

  async function updateProject(slug, patch) {
    const knownSlugs = codeProjects.map((p) => p.slug)
    config = loadConfig(codeProjects)

    const result = validateProjectPatch(slug, patch, config, knownSlugs)
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
    await startProject(slug)
    return buildView(slug)
  }

  function listRoutes(slug) {
    ensureKnown(slug)
    return routesBySlug.get(slug) || loadRoutes(slug)
  }

  /**
   * Hot-update dynamic routes without restarting when only routes change.
   * getRoutes() reads from the Map, so swapping the array is enough.
   * @param {string} slug
   * @param {import("./route-store.js").DynamicRoute[]} routes
   */
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
    const created = result.routes.find((r) => r.id === withId.id) || result.routes.at(-1)
    return created
  }

  function updateRoute(slug, id, patch) {
    ensureKnown(slug)
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
    const current = routesBySlug.get(slug) || []
    const next = current.filter((r) => r.id !== id)
    if (next.length === current.length) {
      throw Object.assign(new Error(`Route not found: ${id}`), { statusCode: 404 })
    }
    saveRoutes(slug, next)
    setRoutesInMemory(slug, next)
    return { ok: true }
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
    return codeProjects.map((p) => buildView(p.slug)).filter(Boolean)
  }

  function getProject(slug) {
    return buildView(slug)
  }

  function getConfig() {
    return config
  }

  async function stopAll() {
    for (const project of codeProjects) {
      await stopProject(project.slug)
    }
  }

  return {
    startAll,
    stopAll,
    listProjects,
    getProject,
    updateProject,
    reloadProject,
    getConfig,
    listRoutes,
    replaceRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    listLogs,
    clearLogs,
  }
}
