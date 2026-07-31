/**
 * Mock 工作台 — 一接口多场景 + 联调辅助
 */

/** @typedef {{ id: string, name: string, statusCode: number, delayMs: number, response: unknown, headers: Record<string,string> }} Scenario */
/** @typedef {{ id: string, name: string, method: string, path: string, enabled: boolean, activeScenarioId: string, scenarios: Scenario[], note?: string }} Route */
/** @typedef {{ slug: string, name: string, description?: string, enabled: boolean, port: number, proxy: any, status: string, lastError?: string, warning?: string, url?: string|null, routeCount?: number, enabledRouteCount?: number }} Project */

const state = {
  projects: /** @type {Project[]} */ ([]),
  slug: /** @type {string|null} */ (null),
  tab: "overview",
  routes: /** @type {Route[]} */ ([]),
  filter: "",
  editingId: /** @type {string|null} */ (null),
  /** 编辑器内工作副本 */
  draft: /** @type {Route|null} */ (null),
  draftScenarioId: /** @type {string|null} */ (null),
  logsTimer: /** @type {ReturnType<typeof setInterval>|null} */ (null),
}

const $ = (id) => document.getElementById(id)

const els = {
  healthPill: $("health-pill"),
  refreshBtn: $("refresh-btn"),
  projectNav: $("project-nav"),
  projectCount: $("project-count"),
  emptyState: $("empty-state"),
  workspace: $("workspace"),
  wsTitle: $("ws-title"),
  wsSlug: $("ws-slug"),
  wsStatus: $("ws-status"),
  wsUrl: $("ws-url"),
  wsDesc: $("ws-desc"),
  btnCopyUrl: $("btn-copy-url"),
  btnReload: $("btn-reload"),
  toast: $("toast"),
  overviewForm: $("overview-form"),
  overviewAlerts: $("overview-alerts"),
  btnSaveOverview: $("btn-save-overview"),
  statRoutes: $("stat-routes"),
  statEnabledRoutes: $("stat-enabled-routes"),
  statProxy: $("stat-proxy"),
  statStatus: $("stat-status"),
  routesTbody: $("routes-tbody"),
  routesSplit: $("routes-split"),
  routeEditor: $("route-editor"),
  routeForm: $("route-form"),
  editorTitle: $("editor-title"),
  routeSearch: $("route-search"),
  btnNewRoute: $("btn-new-route"),
  btnCloseEditor: $("btn-close-editor"),
  btnDeleteRoute: $("btn-delete-route"),
  btnExport: $("btn-export-routes"),
  btnImport: $("btn-import-routes"),
  scenarioTabs: $("scenario-tabs"),
  btnAddScenario: $("btn-add-scenario"),
  btnDeleteScenario: $("btn-delete-scenario"),
  btnFormatJson: $("btn-format-json"),
  btnTryRoute: $("btn-try-route"),
  btnCopyCurl: $("btn-copy-curl"),
  editorHint: $("editor-hint"),
  tryResult: $("try-result"),
  scId: $("sc-id"),
  scName: $("sc-name"),
  scActive: $("sc-active"),
  scStatus: $("sc-status"),
  scDelay: $("sc-delay"),
  scResponse: $("sc-response"),
  scHeaders: $("sc-headers"),
  logsTbody: $("logs-tbody"),
  logsAuto: $("logs-auto"),
  btnRefreshLogs: $("btn-refresh-logs"),
  btnClearLogs: $("btn-clear-logs"),
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
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(e.message, "err")
  }
})

els.btnSaveOverview.addEventListener("click", async () => {
  if (!state.slug) return
  const fd = new FormData(els.overviewForm)
  try {
    await api("PATCH", `/__mock/projects/${state.slug}`, {
      enabled: fd.get("enabled") === "on",
      port: Number(fd.get("port")),
      proxy: {
        enabled: fd.get("proxyEnabled") === "on",
        target: String(fd.get("target") || "").trim(),
      },
    })
    toast("配置已保存", "ok")
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(e.message, "err")
  }
})

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.getAttribute("data-tab")
    if (name) setTab(name)
  })
})

els.routeSearch.addEventListener("input", () => {
  state.filter = els.routeSearch.value.trim().toLowerCase()
  renderRoutesTable()
})

els.btnNewRoute.addEventListener("click", () => openEditor(null))
els.btnCloseEditor.addEventListener("click", () => closeEditor())

els.btnExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 2, routes: state.routes }, null, 2)], {
    type: "application/json",
  })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${state.slug || "routes"}-routes.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toast("已导出", "ok")
})

els.btnImport.addEventListener("change", async () => {
  const file = els.btnImport.files?.[0]
  els.btnImport.value = ""
  if (!file || !state.slug) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const routes = data.routes || data
    if (!Array.isArray(routes)) throw new Error("JSON 需包含 routes 数组")
    await api("PUT", `/__mock/projects/${state.slug}/routes`, { routes })
    toast(`已导入 ${routes.length} 个接口`, "ok")
    closeEditor()
    await loadRoutes()
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(`导入失败：${e.message}`, "err")
  }
})

els.btnAddScenario.addEventListener("click", () => {
  if (!state.draft) return
  flushScenarioFormToDraft()
  const id = crypto.randomUUID()
  state.draft.scenarios.push({
    id,
    name: `场景 ${state.draft.scenarios.length + 1}`,
    statusCode: 200,
    delayMs: 0,
    response: { code: 200, message: "success", data: null },
    headers: {},
  })
  state.draftScenarioId = id
  renderScenarioTabs()
  loadScenarioForm()
})

els.btnDeleteScenario.addEventListener("click", () => {
  if (!state.draft || state.draft.scenarios.length <= 1) {
    toast("至少保留一个场景", "err")
    return
  }
  flushScenarioFormToDraft()
  const id = state.draftScenarioId
  state.draft.scenarios = state.draft.scenarios.filter((s) => s.id !== id)
  if (state.draft.activeScenarioId === id) {
    state.draft.activeScenarioId = state.draft.scenarios[0].id
  }
  state.draftScenarioId = state.draft.scenarios[0].id
  renderScenarioTabs()
  loadScenarioForm()
})

els.scActive.addEventListener("change", () => {
  if (els.scActive.checked && state.draft && state.draftScenarioId) {
    state.draft.activeScenarioId = state.draftScenarioId
    renderScenarioTabs()
  }
})

document.querySelectorAll("[data-delay]").forEach((chip) => {
  chip.addEventListener("click", () => {
    els.scDelay.value = chip.getAttribute("data-delay") || "0"
  })
})

els.btnFormatJson.addEventListener("click", () => {
  try {
    els.scResponse.value = JSON.stringify(JSON.parse(els.scResponse.value || "{}"), null, 2)
  } catch {
    toast("Response JSON 无法格式化", "err")
  }
})

els.routeForm.addEventListener("submit", async (ev) => {
  ev.preventDefault()
  if (!state.slug || !state.draft) return
  if (!flushScenarioFormToDraft()) return

  const fd = new FormData(els.routeForm)
  state.draft.name = String(fd.get("name") || "")
  state.draft.method = String(fd.get("method") || "GET").toUpperCase()
  state.draft.path = String(fd.get("path") || "").trim()
  state.draft.enabled = fd.get("enabled") === "on"
  state.draft.note = String(fd.get("note") || "")

  if (!state.draft.path.startsWith("/")) {
    toast("Path 必须以 / 开头", "err")
    return
  }
  if (!state.draft.scenarios.length) {
    toast("至少需要一个场景", "err")
    return
  }

  const payload = {
    name: state.draft.name,
    method: state.draft.method,
    path: state.draft.path,
    enabled: state.draft.enabled,
    activeScenarioId: state.draft.activeScenarioId,
    scenarios: state.draft.scenarios,
    note: state.draft.note,
  }

  try {
    if (state.draft.id) {
      await api("PATCH", `/__mock/projects/${state.slug}/routes/${state.draft.id}`, payload)
      toast("接口已更新", "ok")
    } else {
      const res = await api("POST", `/__mock/projects/${state.slug}/routes`, payload)
      state.draft.id = res.route?.id
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
  if (!state.slug || !state.draft?.id) return
  if (!confirm("确定删除整个接口及其所有场景？")) return
  try {
    await api("DELETE", `/__mock/projects/${state.slug}/routes/${state.draft.id}`)
    toast("已删除", "ok")
    closeEditor()
    await loadRoutes()
    await bootstrap({ keepSelection: true })
  } catch (e) {
    toast(e.message, "err")
  }
})

els.btnCopyCurl.addEventListener("click", async () => {
  const curl = buildCurlFromDraft()
  if (!curl) return
  try {
    await navigator.clipboard.writeText(curl)
    toast("已复制 curl", "ok")
  } catch {
    toast("复制失败", "err")
  }
})

els.btnTryRoute.addEventListener("click", async () => {
  if (!flushScenarioFormToDraft()) return
  const p = currentProject()
  if (!p?.url || !state.draft) {
    toast("项目未监听，无法试请求", "err")
    return
  }
  const url = `${p.url}${state.draft.path}`
  const method = state.draft.method
  /** @type {RequestInit} */
  const init = { method, headers: { "Content-Type": "application/json" } }
  if (method !== "GET" && method !== "HEAD") {
    init.body = "{}"
  }
  const started = performance.now()
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    let body = text
    try {
      body = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      /* keep text */
    }
    const ms = Math.round(performance.now() - started)
    els.tryResult.hidden = false
    els.tryResult.textContent = `HTTP ${res.status} · ${ms}ms\n${body}`
    toast(`试请求完成 ${res.status}`, "ok")
    if (state.tab === "logs") void loadLogs()
  } catch (e) {
    els.tryResult.hidden = false
    els.tryResult.textContent = `请求失败：${e.message}`
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

  if (!opts.keepSelection) applyHash()
  if (state.slug && !state.projects.some((p) => p.slug === state.slug)) {
    state.slug = null
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
  if (slug && state.projects.some((p) => p.slug === slug)) state.slug = slug
  if (tab && ["overview", "routes", "logs"].includes(tab)) state.tab = tab
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
        <span>${p.routeCount ?? 0} 接口</span>
      </div>`
    btn.addEventListener("click", () => {
      state.slug = p.slug
      writeHash()
      closeEditor()
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

  const form = els.overviewForm
  form.elements.namedItem("enabled").checked = p.enabled
  form.elements.namedItem("port").value = String(p.port)
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

  setTab(state.tab, { skipHash: true })
  if (state.tab === "routes") await loadRoutes()
  if (state.tab === "logs") {
    await loadLogs()
    setupLogsTimer()
  } else stopLogsTimer()
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
  } else stopLogsTimer()
  if (name === "routes") void loadRoutes()
}

async function loadRoutes() {
  if (!state.slug) return
  const data = await api("GET", `/__mock/projects/${state.slug}/routes`)
  state.routes = data.routes || []
  renderRoutesTable()
}

function filteredRoutes() {
  if (!state.filter) return state.routes
  return state.routes.filter((r) => {
    const hay = `${r.method} ${r.path} ${r.name} ${r.note || ""}`.toLowerCase()
    return hay.includes(state.filter)
  })
}

function activeScenario(route) {
  return (
    route.scenarios?.find((s) => s.id === route.activeScenarioId) ||
    route.scenarios?.[0] ||
    null
  )
}

function renderRoutesTable() {
  const list = filteredRoutes()
  if (!list.length) {
    els.routesTbody.innerHTML = `<tr><td colspan="8" class="muted">${
      state.routes.length ? "无匹配接口" : "暂无接口，点击「新建接口」或 npm run seed:tts"
    }</td></tr>`
    return
  }

  els.routesTbody.innerHTML = ""
  for (const r of list) {
    const sc = activeScenario(r)
    const tr = document.createElement("tr")
    if (r.id === state.editingId) tr.classList.add("selected")

    const options = (r.scenarios || [])
      .map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === r.activeScenarioId ? "selected" : ""}>${esc(s.name)} · ${s.statusCode}</option>`,
      )
      .join("")

    tr.innerHTML = `
      <td><input type="checkbox" class="switch-sm" data-toggle="${esc(r.id)}" ${r.enabled ? "checked" : ""} title="启用/禁用接口" /></td>
      <td><span class="method">${esc(r.method)}</span></td>
      <td class="path-cell">${esc(r.path)}</td>
      <td>
        <select class="scenario-select" data-scenario-for="${esc(r.id)}" title="切换当前响应场景">
          ${options}
        </select>
      </td>
      <td>${sc?.statusCode ?? "—"}</td>
      <td>${sc?.delayMs ?? 0}ms</td>
      <td>${esc(r.name || "—")}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(r.id)}">编辑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-curl="${esc(r.id)}">curl</button>
      </td>`

    tr.querySelector("[data-edit]")?.addEventListener("click", () => openEditor(r))
    tr.querySelector("[data-curl]")?.addEventListener("click", async () => {
      const curl = buildCurl(r)
      try {
        await navigator.clipboard.writeText(curl)
        toast("已复制 curl", "ok")
      } catch {
        toast("复制失败", "err")
      }
    })
    tr.querySelector("[data-toggle]")?.addEventListener("change", async (ev) => {
      const checked = /** @type {HTMLInputElement} */ (ev.target).checked
      try {
        await api("PATCH", `/__mock/projects/${state.slug}/routes/${r.id}`, {
          enabled: checked,
        })
        toast(checked ? "接口已启用" : "接口已禁用", "ok")
        await loadRoutes()
        await bootstrap({ keepSelection: true })
      } catch (e) {
        toast(e.message, "err")
        await loadRoutes()
      }
    })
    tr.querySelector("[data-scenario-for]")?.addEventListener("change", async (ev) => {
      const scenarioId = /** @type {HTMLSelectElement} */ (ev.target).value
      try {
        await api(
          "POST",
          `/__mock/projects/${state.slug}/routes/${r.id}/activate-scenario`,
          { scenarioId },
        )
        toast("已切换场景", "ok")
        await loadRoutes()
      } catch (e) {
        toast(e.message, "err")
        await loadRoutes()
      }
    })

    els.routesTbody.appendChild(tr)
  }
}

function openEditor(route) {
  if (route) {
    state.editingId = route.id
    state.draft = structuredClone(route)
  } else {
    state.editingId = null
    const sid = crypto.randomUUID()
    state.draft = {
      id: "",
      name: "",
      method: "GET",
      path: "",
      enabled: true,
      activeScenarioId: sid,
      scenarios: [
        {
          id: sid,
          name: "默认",
          statusCode: 200,
          delayMs: 0,
          response: { code: 200, message: "success", data: {} },
          headers: {},
        },
      ],
      note: "",
    }
  }
  state.draftScenarioId =
    state.draft.activeScenarioId || state.draft.scenarios[0]?.id || null

  els.routeEditor.hidden = false
  els.routesSplit?.classList.add("has-editor")
  els.editorTitle.textContent = route ? "编辑接口" : "新建接口"
  els.btnDeleteRoute.hidden = !route
  els.tryResult.hidden = true
  els.editorHint.textContent =
    "每个接口可配置多个响应场景；列表中下拉即可切换当前启用场景，立即对联调生效。"

  const f = els.routeForm
  f.elements.namedItem("id").value = state.draft.id || ""
  f.elements.namedItem("name").value = state.draft.name || ""
  f.elements.namedItem("method").value = state.draft.method || "GET"
  f.elements.namedItem("path").value = state.draft.path || ""
  f.elements.namedItem("enabled").checked = state.draft.enabled !== false
  f.elements.namedItem("note").value = state.draft.note || ""

  renderScenarioTabs()
  loadScenarioForm()
  renderRoutesTable()
}

function closeEditor() {
  state.editingId = null
  state.draft = null
  state.draftScenarioId = null
  els.routeEditor.hidden = true
  els.routesSplit?.classList.remove("has-editor")
  els.tryResult.hidden = true
  renderRoutesTable()
}

function renderScenarioTabs() {
  if (!state.draft) return
  els.scenarioTabs.innerHTML = ""
  for (const s of state.draft.scenarios) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `scenario-tab${s.id === state.draftScenarioId ? " active" : ""}${
      s.id === state.draft.activeScenarioId ? " is-active-scenario" : ""
    }`
    btn.innerHTML = `${esc(s.name)}<span class="sc-meta">${s.statusCode}</span>${
      s.id === state.draft.activeScenarioId ? '<span class="sc-dot" title="当前启用"></span>' : ""
    }`
    btn.addEventListener("click", () => {
      if (!flushScenarioFormToDraft()) return
      state.draftScenarioId = s.id
      renderScenarioTabs()
      loadScenarioForm()
    })
    els.scenarioTabs.appendChild(btn)
  }
}

function loadScenarioForm() {
  if (!state.draft) return
  const s =
    state.draft.scenarios.find((x) => x.id === state.draftScenarioId) ||
    state.draft.scenarios[0]
  if (!s) return
  state.draftScenarioId = s.id
  els.scId.value = s.id
  els.scName.value = s.name
  els.scStatus.value = String(s.statusCode)
  els.scDelay.value = String(s.delayMs)
  els.scActive.checked = s.id === state.draft.activeScenarioId
  els.scResponse.value = JSON.stringify(s.response ?? {}, null, 2)
  els.scHeaders.value = JSON.stringify(s.headers ?? {}, null, 2)
}

/** @returns {boolean} */
function flushScenarioFormToDraft() {
  if (!state.draft || !state.draftScenarioId) return true
  const idx = state.draft.scenarios.findIndex((s) => s.id === state.draftScenarioId)
  if (idx < 0) return true

  let response
  let headers
  try {
    response = JSON.parse(els.scResponse.value || "{}")
  } catch {
    toast("当前场景 Response 不是合法 JSON", "err")
    return false
  }
  try {
    headers = JSON.parse(els.scHeaders.value || "{}")
  } catch {
    toast("当前场景 Headers 不是合法 JSON", "err")
    return false
  }

  state.draft.scenarios[idx] = {
    id: state.draftScenarioId,
    name: els.scName.value.trim() || "未命名场景",
    statusCode: Number(els.scStatus.value) || 200,
    delayMs: Number(els.scDelay.value) || 0,
    response,
    headers,
  }

  if (els.scActive.checked) {
    state.draft.activeScenarioId = state.draftScenarioId
  }
  return true
}

function buildCurl(route) {
  const p = currentProject()
  const base = p?.url || `http://localhost:${p?.port || 4001}`
  const url = `${base}${route.path}`
  if (route.method === "GET" || route.method === "HEAD") {
    return `curl -sS -X ${route.method} '${url}'`
  }
  return `curl -sS -X ${route.method} '${url}' -H 'Content-Type: application/json' -d '{}'`
}

function buildCurlFromDraft() {
  if (!state.draft) return ""
  if (!flushScenarioFormToDraft()) return ""
  const fd = new FormData(els.routeForm)
  const temp = {
    ...state.draft,
    method: String(fd.get("method") || state.draft.method),
    path: String(fd.get("path") || state.draft.path),
  }
  return buildCurl(temp)
}

async function loadLogs() {
  if (!state.slug) return
  try {
    const data = await api("GET", `/__mock/projects/${state.slug}/logs?limit=100`)
    const logs = data.logs || []
    if (!logs.length) {
      els.logsTbody.innerHTML = `<tr><td colspan="7" class="muted">暂无请求。可在接口编辑里点「试请求」，或由前端直接打项目端口。</td></tr>`
      return
    }
    els.logsTbody.innerHTML = logs
      .map(
        (log) => `<tr>
        <td class="mono small">${esc(formatTime(log.ts))}</td>
        <td><span class="method">${esc(log.method)}</span></td>
        <td class="path-cell">${esc(log.path)}</td>
        <td><span class="tag ${esc(log.source)}">${esc(log.source)}</span></td>
        <td class="small">${esc(log.scenarioName || "—")}</td>
        <td>${log.status ?? "—"}</td>
        <td>${log.durationMs != null ? `${log.durationMs}ms` : "—"}</td>
      </tr>`,
      )
      .join("")
  } catch (e) {
    els.logsTbody.innerHTML = `<tr><td colspan="7" class="muted">加载失败：${esc(e.message)}</td></tr>`
  }
}

function setupLogsTimer() {
  stopLogsTimer()
  if (state.tab !== "logs" || !els.logsAuto.checked) return
  state.logsTimer = setInterval(() => void loadLogs(), 3000)
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
    return (
      d.toLocaleTimeString("zh-CN", { hour12: false }) +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    )
  } catch {
    return iso
  }
}

void bootstrap()
