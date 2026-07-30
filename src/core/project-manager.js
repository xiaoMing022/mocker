import { isProxyActive, loadConfig, saveConfig, validateProjectPatch } from "./config-store.js"
import { createProjectApp } from "./create-project-app.js"

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

  /** @type {Map<string, { server: import("node:http").Server | null, status: string, lastError: string | null, warning: string | null }>} */
  const runtime = new Map()

  for (const project of codeProjects) {
    runtime.set(project.slug, {
      server: null,
      status: "stopped",
      lastError: null,
      warning: null,
    })
  }

  function getCodeProject(slug) {
    return codeProjects.find((p) => p.slug === slug)
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
        // Force-close hang if keep-alive clients linger
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

    const app = createProjectApp({ project: code, runtime: rt })

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
      // status already set; do not throw out of startAll for single project failure
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
      await startProject(project.slug)
    }
  }

  async function reloadProject(slug) {
    if (!getCodeProject(slug)) {
      throw Object.assign(new Error(`Unknown project: ${slug}`), { statusCode: 404 })
    }
    // Re-read disk so external edits are respected
    config = loadConfig(codeProjects)
    await startProject(slug)
    return buildView(slug)
  }

  async function updateProject(slug, patch) {
    const knownSlugs = codeProjects.map((p) => p.slug)
    // refresh from disk first
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
  }
}
