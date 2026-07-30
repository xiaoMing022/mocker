/** @typedef {{ slug: string, name: string, description?: string, enabled: boolean, port: number, proxy: any, status: string, lastError?: string, warning?: string, url?: string, routeCount?: number, enabledRouteCount?: number }} Project */
/** @typedef {{ id: string, name: string, method: string, path: string, enabled: boolean, statusCode: number, delayMs: number, response: unknown, headers: Record<string, string> }} Route */

const state = {
  projects: /** @type {Project[]} */ ([]),
  slug: /** @type {string | null} */ (null),
  tab: "overview",
  routes: /** @type {Route[]} */ ([]),
  editingId: /** @type {string | null} */ (null),
  logsTimer: /** @type {ReturnType<typeof setInterval> | null} */ (null),
}

const els = {
  healthPill: document.getElementById("health-pill"),
  refreshBtn: document.getElementById("refresh-btn"),
  projectNav: document.getElementById("project-nav"),
  projectCount: document.getElementById("project-count"),
  emptyState: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  wsTitle: document.getElementById("ws-title"),
  wsSlug: document.getElementById("ws-slug"),
  wsStatus: document.getElementById("ws-status"),
  wsUrl: document.getElementById("ws-url"),
  wsDesc: document.getElementById("ws-desc"),
  btnCopyUrl: document.getElementById("btn-copy-url"),
  btnReload: document.getElementById("btn-reload"),
  toast: document.getElementById("toast"),
  overviewForm: document.getElementById("overview-form"),
  overviewAlerts: document.getElementById("overview-alerts"),
  btnSaveOverview: document.getElementById("btn-save-overview"),
  statRoutes: document.getElementById("stat-routes"),
  statEnabledRoutes: document.getElementById("stat-enabled-routes"),
  statProxy: document.getElementById("stat-proxy"),
  statStatus: document.getElementById("stat-status"),
  routesTbody: document.getElementById("routes-tbody"),
  routeEditor: document.getElementById("route-editor"),
  routeForm: document.getElementById("route-form"),
  editorTitle: document.getElementById("editor-title"),
  btnNewRoute: document.getElementById("btn-new-route"),
  btnCloseEditor: document.getElementById("btn-close-editor"),
  btnDeleteRoute: document.getElementById("btn-delete-route"),
  btnFormatJson: document.getElementById("btn-format-json"),
  editorHint: document.getElementById("editor-hint"),
  logsTbody: document.getElementById("logs-tbody"),
  logsAuto: document.getElementById("logs-auto"),
  btnRefreshLogs: document.getElementById("btn-refresh-logs"),
  btnClearLogs: document.getElementById("btn-clear-logs"),
  split: document.querySelector("#panel-routes .split"),
}

// ── Events ───────────────────────────────────────────────────

els.refreshBtn.addEventListener("click", () => void bootstrap())
els.btnCopyUrl.addEventListener("click", async () => {
  const p = currentProject()
  if (!p?.url) return
  try {
    await navigator.clipboard.writeText(p.url)
    toast("已复制 Base URL", "ok")
  } catch {
    toast("复制失败", "err")
  }
})

els.btnReload.addEventListener("click", async () => {
  if (!state.slug) return
  try {
    await api("POST", `/__mock/projects/${state.slug}/reload`)
    toast("实例已重载", "ok")
    await bootstrap()
  } catch (e) {
    toast(e.message, "err")
  }
})

els.btnSaveOverview.addEventListener("click", async () => {
  if (!state.slug) return
  const fd = new FormData(els.overviewForm)
  const body = {
    enabled: fd.get("enabled") === "on",
    port: Number(fd.get("port")),
    proxy: {
      enabled: fd.get("proxyEnabled") === "on",
      target: String(fd.get("target") || "").trim(),
    },
  }
  try {
    await api("PATCH", `/__mock/projects/${state.slug}`, body)
    toast("配置已保存", "ok")
    await bootstrap()
  } catch (e) {
    toast(e.message, "err")
  }
})

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.getAttribute("data-tab")
    if (!name) return
    setTab(name)
    writeHash()
  })
})

els.btnNewRoute.addEventListener("click", () => openEditor(null))
els.btnCloseEditor.addEventListener("click", () => closeEditor())
els.btnFormatJson.addEventListener("click", () => {
  const ta = els.routeForm.elements.namedItem("response")
  if (!(ta instanceof HTMLTextAreaElement)) return
  try {
    ta.value = JSON.stringify(JSON.parse(ta.value), null, 2)
  } catch {
    toast("Response JSON 无法格式化", "err")
  }
})

els.routeForm.addEventListener("submit", async (ev) => {
  ev.preventDefault()
  if (!state.slug) return
  const fd = new FormData(els.routeForm)
  let response
  let headers
  try {
    response = JSON.parse(String(fd.get("response") || "{}"))
  } catch {
    toast("Response 不是合法 JSON", "err")
    return
  }
  try {
    headers = JSON.parse(String(fd.get("headers") || "{}"))
  } catch {
    toast("Headers 不是合法 JSON", "err")
    return
  }

  const payload = {
    name: String(fd.get("name") || ""),
    method: String(fd.get("method") || "GET").toUpperCase(),
    path: String(fd.get("path") || "").trim(),
    enabled: fd.get("enabled") === "on",
    statusCode: Number(fd.get("statusCode") || 200),
    delayMs: Number(fd.get("delayMs") || 0),
    response,
    headers,
  }

  const id = String(fd.get("id") || "")
  try {
    if (id) {
      await api("PATCH", `/__mock/projects/${state.slug}/routes/${id}`, payload)
      toast("接口已更新", "ok")
    } else {
      await api("POST", `/__mock/projects/${state.slug}/routes`, payload)
      toast("接口已创建", "ok")
    }
    await loadRoutes()
    closeEditor()
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(e.message, "err")
  }
})

els.btnDeleteRoute.addEventListener("click", async () => {
  if (!state.slug || !state.editingId) return
  if (!confirm("确定删除该动态接口？")) return
  try {
    await api("DELETE", `/__mock/projects/${state.slug}/routes/${state.editingId}`)
    toast("已删除", "ok")
    closeEditor()
    await loadRoutes()
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(e.message, "err")
  }
})

els.btnRefreshLogs.addEventListener("click", () => void loadLogs())
els.btnClearLogs.addEventListener("click", async () => {
  if (!state.slug) return
  try {
    await api("DELETE", `/__mock/projects/${state.slug}/logs`)
    toast("日志已清空", "ok")
    await loadLogs()
  } catch (e) {
    toast(e.message, "err")
  }
})

els.logsAuto.addEventListener("change", () => setupLogsTimer())

window.addEventListener("hashchange", () => {
  applyHash()
  void renderAll()
})

// ── Core ─────────────────────────────────────────────────────

async function bootstrap(opts = {}) {
  try {
    const health = await api("GET", "/health")
    els.healthPill.textContent = `健康 · ${health.projects?.length ?? 0} 项目`
    els.healthPill.className = "pill ok"
  } catch {
    els.healthPill.textContent = "管理端不可用"
    els.healthPill.className = "pill err"
  }

  const data = await api("GET", "/__mock/projects")
  state.projects = data.projects || []
  els.projectCount.textContent = String(state.projects.length)

  if (!opts.keepSelection) {
    applyHash()
  } else if (state.slug && !state.projects.some((p) => p.slug === state.slug)) {
    state.slug = state.projects[0]?.slug ?? null
  }

  if (!state.slug && state.projects[0]) {
    state.slug = state.projects[0].slug
    writeHash()
  }

  renderProjectNav()
  await renderAll()
}

function applyHash() {
  const raw = location.hash.replace(/^#\/?/, "")
  const [slug, tab] = raw.split("/")
  if (slug && state.projects.some((p) => p.slug === slug)) {
    state.slug = slug
  }
  if (tab && ["overview", "routes", "logs"].includes(tab)) {
    state.tab = tab
  }
}

function writeHash() {
  if (!state.slug) {
    history.replaceState(null, "", "#/")
    return
  }
  history.replaceState(null, "", `#/${state.slug}/${state.tab}`)
}

function currentProject() {
  return state.projects.find((p) => p.slug === state.slug) || null
}

function renderProjectNav() {
  if (!state.projects.length) {
    els.projectNav.innerHTML = `<p class="muted pad">暂无注册项目</p>`
    return
  }
  els.projectNav.innerHTML = ""
  for (const p of state.projects) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `project-item${p.slug === state.slug ? " active" : ""}`
    btn.innerHTML = `
      <div class="name">${esc(p.name)}</div>
      <div class="meta">
        <span class="dot ${esc(p.status)}"></span>
        <span>${esc(p.status)}</span>
        <span>:${p.port}</span>
        <span>${p.enabledRouteCount ?? 0} 路由</span>
      </div>
    `
    btn.addEventListener("click", () => {
      state.slug = p.slug
      writeHash()
      void renderAll()
      renderProjectNav()
    })
    els.projectNav.appendChild(btn)
  }
}

async function renderAll() {
  const p = currentProject()
  if (!p) {
    els.emptyState.hidden = false
    els.workspace.hidden = true
    stopLogsTimer()
    return
  }

  els.emptyState.hidden = true
  els.workspace.hidden = false

  els.wsTitle.textContent = p.name
  els.wsSlug.textContent = p.slug
  els.wsDesc.textContent = p.description || ""
  els.wsStatus.textContent = p.status
  els.wsStatus.className = `status-badge ${p.status}`

  if (p.url) {
    els.wsUrl.hidden = false
    els.wsUrl.href = p.url
    els.wsUrl.textContent = p.url
    els.btnCopyUrl.disabled = false
  } else {
    els.wsUrl.hidden = true
    els.btnCopyUrl.disabled = true
  }

  setTab(state.tab, { skipHash: true })

  // overview form
  const form = els.overviewForm
  form.elements.namedItem("enabled").checked = p.enabled
  form.elements.namedItem("port").value = p.port
  form.elements.namedItem("proxyEnabled").checked = Boolean(p.proxy?.enabled)
  form.elements.namedItem("target").value = p.proxy?.target || ""

  els.overviewAlerts.innerHTML = ""
  if (p.lastError) {
    els.overviewAlerts.innerHTML += `<div class="alert err">错误：${esc(p.lastError)}</div>`
  }
  if (p.warning) {
    els.overviewAlerts.innerHTML += `<div class="alert warn">警告：${esc(p.warning)}</div>`
  }

  els.statRoutes.textContent = String(p.routeCount ?? 0)
  els.statEnabledRoutes.textContent = String(p.enabledRouteCount ?? 0)
  els.statProxy.textContent = p.proxy?.active ? "active" : "off"
  els.statStatus.textContent = p.status

  if (state.tab === "routes") {
    await loadRoutes()
  }
  if (state.tab === "logs") {
    await loadLogs()
    setupLogsTimer()
  } else {
    stopLogsTimer()
  }
}

function setTab(name, opts = {}) {
  state.tab = name
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === name)
  })
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.hidden = panel.getAttribute("data-panel") !== name
  })
  if (!opts.skipHash) writeHash()

  if (name === "logs") {
    void loadLogs()
    setupLogsTimer()
  } else {
    stopLogsTimer()
  }
  if (name === "routes") void loadRoutes()
}

async function loadRoutes() {
  if (!state.slug) return
  const data = await api("GET", `/__mock/projects/${state.slug}/routes`)
  state.routes = data.routes || []
  renderRoutesTable()
}

function renderRoutesTable() {
  if (!state.routes.length) {
    els.routesTbody.innerHTML = `<tr><td colspan="7" class="muted">暂无动态路由，点击「新建接口」添加。代码中的 mock 仍会生效。</td></tr>`
    return
  }

  els.routesTbody.innerHTML = ""
  for (const r of state.routes) {
    const tr = document.createElement("tr")
    if (r.id === state.editingId) tr.classList.add("selected")
    tr.innerHTML = `
      <td><input type="checkbox" class="switch-sm" data-toggle="${esc(r.id)}" ${r.enabled ? "checked" : ""} /></td>
      <td><span class="method">${esc(r.method)}</span></td>
      <td class="path-cell">${esc(r.path)}</td>
      <td>${r.statusCode}</td>
      <td>${r.delayMs}ms</td>
      <td>${esc(r.name || "—")}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(r.id)}">编辑</button></td>
    `
    tr.querySelector("[data-edit]")?.addEventListener("click", () => openEditor(r))
    tr.querySelector("[data-toggle]")?.addEventListener("change", async (ev) => {
      const checked = /** @type {HTMLInputElement} */ (ev.target).checked
      try {
        await api("PATCH", `/__mock/projects/${state.slug}/routes/${r.id}`, {
          enabled: checked,
        })
        toast(checked ? "已启用" : "已禁用", "ok")
        await loadRoutes()
        await bootstrap({ keepSelection: true })
      } catch (e) {
        toast(e.message, "err")
        await loadRoutes()
      }
    })
    els.routesTbody.appendChild(tr)
  }
}

function openEditor(route) {
  state.editingId = route?.id ?? null
  els.routeEditor.hidden = false
  els.split?.classList.add("has-editor")
  els.editorTitle.textContent = route ? "编辑接口" : "新建接口"
  els.btnDeleteRoute.hidden = !route

  const f = els.routeForm
  f.elements.namedItem("id").value = route?.id || ""
  f.elements.namedItem("name").value = route?.name || ""
  f.elements.namedItem("method").value = route?.method || "GET"
  f.elements.namedItem("path").value = route?.path || ""
  f.elements.namedItem("statusCode").value = String(route?.statusCode ?? 200)
  f.elements.namedItem("delayMs").value = String(route?.delayMs ?? 0)
  f.elements.namedItem("enabled").checked = route ? route.enabled !== false : true
  f.elements.namedItem("response").value = JSON.stringify(
    route?.response ?? { code: 200, message: "success", data: {} },
    null,
    2,
  )
  f.elements.namedItem("headers").value = JSON.stringify(route?.headers ?? {}, null, 2)

  els.editorHint.textContent = route
    ? "保存后立即生效（无需重启项目实例）。若与代码 mock 同 path，将覆盖代码。"
    : "新建后立即生效。与代码 routes 同 method+path 时控制台优先。"

  renderRoutesTable()
}

function closeEditor() {
  state.editingId = null
  els.routeEditor.hidden = true
  els.split?.classList.remove("has-editor")
  renderRoutesTable()
}

async function loadLogs() {
  if (!state.slug) return
  try {
    const data = await api("GET", `/__mock/projects/${state.slug}/logs?limit=100`)
    const logs = data.logs || []
    if (!logs.length) {
      els.logsTbody.innerHTML = `<tr><td colspan="6" class="muted">暂无请求。对该项目端口发请求后将出现在这里。</td></tr>`
      return
    }
    els.logsTbody.innerHTML = logs
      .map((log) => {
        const t = formatTime(log.ts)
        return `<tr>
          <td class="mono small">${esc(t)}</td>
          <td><span class="method">${esc(log.method)}</span></td>
          <td class="path-cell">${esc(log.path)}</td>
          <td><span class="tag ${esc(log.source)}">${esc(log.source)}</span></td>
          <td>${log.status ?? "—"}</td>
          <td>${log.durationMs != null ? `${log.durationMs}ms` : "—"}</td>
        </tr>`
      })
      .join("")
  } catch (e) {
    els.logsTbody.innerHTML = `<tr><td colspan="6" class="muted">加载失败：${esc(e.message)}</td></tr>`
  }
}

function setupLogsTimer() {
  stopLogsTimer()
  if (state.tab !== "logs") return
  if (!els.logsAuto.checked) return
  state.logsTimer = setInterval(() => {
    void loadLogs()
  }, 3000)
}

function stopLogsTimer() {
  if (state.logsTimer) {
    clearInterval(state.logsTimer)
    state.logsTimer = null
  }
}

// ── utils ────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.errors?.join("; ") || `HTTP ${res.status}`)
  }
  return data
}

function toast(text, type = "ok") {
  els.toast.hidden = false
  els.toast.className = `toast ${type}`
  els.toast.textContent = text
  clearTimeout(toast._t)
  toast._t = setTimeout(() => {
    els.toast.hidden = true
  }, 2800)
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0")
  } catch {
    return iso
  }
}

void bootstrap()
