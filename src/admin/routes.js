/**
 * @param {import("express").Express} app
 * @param {{
 *   manager: ReturnType<import("../core/project-manager.js").createProjectManager>
 * }} options
 */
export function registerAdminRoutes(app, { manager }) {
  app.get("/health", (_req, res) => {
    const projects = manager.listProjects()
    res.json({
      ok: true,
      service: "mock-server",
      admin: true,
      projects: projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        status: p.status,
        port: p.port,
        enabled: p.enabled,
        url: p.url,
        routeCount: p.routeCount,
      })),
    })
  })

  app.get("/__mock/projects", (_req, res) => {
    res.json({ projects: manager.listProjects() })
  })

  app.get("/__mock/projects/:slug", (req, res) => {
    const project = manager.getProject(req.params.slug)
    if (!project) {
      res.status(404).json({
        code: 404,
        message: `Unknown project: ${req.params.slug}`,
        data: null,
      })
      return
    }
    res.json({ project })
  })

  app.patch("/__mock/projects/:slug", async (req, res) => {
    try {
      const project = await manager.updateProject(req.params.slug, req.body ?? {})
      res.json({ project })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/__mock/projects/:slug/reload", async (req, res) => {
    try {
      const project = await manager.reloadProject(req.params.slug)
      res.json({ project })
    } catch (error) {
      sendError(res, error)
    }
  })

  // ── Dynamic routes ──────────────────────────────────────────

  app.get("/__mock/projects/:slug/routes", (req, res) => {
    try {
      res.json({ routes: manager.listRoutes(req.params.slug) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.put("/__mock/projects/:slug/routes", (req, res) => {
    try {
      const routes = manager.replaceRoutes(req.params.slug, req.body?.routes ?? req.body)
      res.json({ routes })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.post("/__mock/projects/:slug/routes", (req, res) => {
    try {
      const route = manager.createRoute(req.params.slug, req.body ?? {})
      res.status(201).json({ route })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.patch("/__mock/projects/:slug/routes/:id", (req, res) => {
    try {
      const route = manager.updateRoute(req.params.slug, req.params.id, req.body ?? {})
      res.json({ route })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.delete("/__mock/projects/:slug/routes/:id", (req, res) => {
    try {
      manager.deleteRoute(req.params.slug, req.params.id)
      res.json({ ok: true })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** 切换接口当前启用的响应场景 */
  app.post("/__mock/projects/:slug/routes/:id/activate-scenario", (req, res) => {
    try {
      const scenarioId = req.body?.scenarioId
      if (!scenarioId) {
        res.status(400).json({
          code: 400,
          message: "scenarioId is required",
          data: null,
        })
        return
      }
      const route = manager.setActiveScenario(
        req.params.slug,
        req.params.id,
        scenarioId,
      )
      res.json({ route })
    } catch (error) {
      sendError(res, error)
    }
  })

  // ── Request logs ────────────────────────────────────────────

  app.get("/__mock/projects/:slug/logs", (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 50)
      res.json({ logs: manager.listLogs(req.params.slug, limit) })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.delete("/__mock/projects/:slug/logs", (req, res) => {
    try {
      manager.clearLogs(req.params.slug)
      res.json({ ok: true })
    } catch (error) {
      sendError(res, error)
    }
  })
}

function sendError(res, error) {
  const status = error.statusCode ?? 500
  res.status(status).json({
    code: status,
    message: error.message,
    errors: error.errors ?? undefined,
    data: null,
  })
}
