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

  /** 控制台新建项目（无需写代码） */
  app.post("/__mock/projects", async (req, res) => {
    try {
      const project = await manager.createProject(req.body ?? {})
      res.status(201).json({ project })
    } catch (error) {
      sendError(res, error)
    }
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

  /** 暂停项目（释放端口，配置与路由保留） */
  app.post("/__mock/projects/:slug/pause", async (req, res) => {
    try {
      const project = await manager.pauseProject(req.params.slug)
      res.json({ project })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** 恢复项目（重新监听） */
  app.post("/__mock/projects/:slug/resume", async (req, res) => {
    try {
      const project = await manager.resumeProject(req.params.slug)
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

  /** 切换项目当前环境（测试/灰度/线上等） */
  app.post("/__mock/projects/:slug/environment", async (req, res) => {
    try {
      const id = req.body?.id ?? req.body?.environmentId ?? req.body?.activeEnvironment
      if (!id) {
        res.status(400).json({
          code: 400,
          message: "id (environment id) is required",
          data: null,
        })
        return
      }
      const project = await manager.setActiveEnvironment(req.params.slug, String(id))
      res.json({ project })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** 删除控制台创建的项目（代码注册项目不可删） */
  app.delete("/__mock/projects/:slug", async (req, res) => {
    try {
      const result = await manager.deleteProject(req.params.slug)
      res.json(result)
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
      const logs = manager.listLogs(req.params.slug, {
        limit: Number(req.query.limit ?? 50),
        source: req.query.source ? String(req.query.source) : undefined,
        method: req.query.method ? String(req.query.method) : undefined,
        path: req.query.path ? String(req.query.path) : undefined,
      })
      res.json({ logs })
    } catch (error) {
      sendError(res, error)
    }
  })

  app.get("/__mock/projects/:slug/logs/:id", (req, res) => {
    try {
      const log = manager.getLog(req.params.slug, req.params.id)
      res.json({ log })
    } catch (error) {
      sendError(res, error)
    }
  })

  /** 从日志生成 mock 场景 */
  app.post("/__mock/projects/:slug/logs/:id/to-scenario", (req, res) => {
    try {
      const result = manager.createScenarioFromLog(
        req.params.slug,
        req.params.id,
        req.body ?? {},
      )
      res.status(201).json(result)
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
