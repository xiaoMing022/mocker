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
      const status = error.statusCode ?? 500
      res.status(status).json({
        code: status,
        message: error.message,
        errors: error.errors ?? undefined,
        data: null,
      })
    }
  })

  app.post("/__mock/projects/:slug/reload", async (req, res) => {
    try {
      const project = await manager.reloadProject(req.params.slug)
      res.json({ project })
    } catch (error) {
      const status = error.statusCode ?? 500
      res.status(status).json({
        code: status,
        message: error.message,
        data: null,
      })
    }
  })
}
