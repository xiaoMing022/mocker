const projectsEl = document.getElementById("projects")
const messageEl = document.getElementById("global-message")
const refreshBtn = document.getElementById("refresh-btn")

refreshBtn.addEventListener("click", () => {
  void loadProjects()
})

async function loadProjects() {
  try {
    const res = await fetch("/__mock/projects")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    renderProjects(data.projects ?? [])
  } catch (error) {
    projectsEl.innerHTML = `<p class="muted">加载失败：${escapeHtml(error.message)}</p>`
    showMessage(`加载项目失败：${error.message}`, "err")
  }
}

function renderProjects(projects) {
  if (!projects.length) {
    projectsEl.innerHTML = `<p class="muted">暂无已注册项目。请在 <code>src/projects/</code> 添加代码项目。</p>`
    return
  }

  projectsEl.innerHTML = ""
  for (const project of projects) {
    projectsEl.appendChild(createCard(project))
  }
}

function createCard(project) {
  const card = document.createElement("article")
  card.className = "card"
  card.dataset.slug = project.slug

  card.innerHTML = `
    <div class="card-head">
      <div>
        <h2>${escapeHtml(project.name)}</h2>
        <div class="slug">${escapeHtml(project.slug)}</div>
        <p class="desc">${escapeHtml(project.description || "")}</p>
      </div>
      <span class="status ${escapeHtml(project.status)}">${escapeHtml(project.status)}${
        project.port ? ` :${project.port}` : ""
      }</span>
    </div>
    <form class="form-grid" data-form>
      <label class="check field">
        <input type="checkbox" name="enabled" ${project.enabled ? "checked" : ""} />
        启用项目
      </label>
      <div class="field">
        <label for="port-${project.slug}">端口</label>
        <input id="port-${project.slug}" name="port" type="number" min="1" max="65535" value="${project.port}" required />
      </div>
      <label class="check field">
        <input type="checkbox" name="proxyEnabled" ${project.proxy?.enabled ? "checked" : ""} />
        开启上游转发
      </label>
      <div class="field full">
        <label for="target-${project.slug}">上游 URL</label>
        <input id="target-${project.slug}" name="target" type="url" placeholder="https://api.example.com" value="${escapeAttr(project.proxy?.target || "")}" />
      </div>
    </form>
    <div class="meta-row">
      <span>转发状态：${project.proxy?.active ? "active" : "off"}</span>
      ${
        project.url
          ? `<span>地址：<a href="${escapeAttr(project.url)}" target="_blank" rel="noreferrer">${escapeHtml(project.url)}</a></span>`
          : "<span>地址：—</span>"
      }
    </div>
    ${
      project.lastError
        ? `<div class="error-line">错误：${escapeHtml(project.lastError)}</div>`
        : ""
    }
    ${
      project.warning
        ? `<div class="warn-line">警告：${escapeHtml(project.warning)}</div>`
        : ""
    }
    <div class="actions">
      <button type="button" class="btn" data-save>保存并重载</button>
      <button type="button" class="btn btn-ghost" data-reload>仅重载</button>
    </div>
  `

  const form = card.querySelector("[data-form]")
  const saveBtn = card.querySelector("[data-save]")
  const reloadBtn = card.querySelector("[data-reload]")

  saveBtn.addEventListener("click", async () => {
    const fd = new FormData(form)
    const body = {
      enabled: fd.get("enabled") === "on",
      port: Number(fd.get("port")),
      proxy: {
        enabled: fd.get("proxyEnabled") === "on",
        target: String(fd.get("target") || "").trim(),
      },
    }

    saveBtn.disabled = true
    reloadBtn.disabled = true
    try {
      const res = await fetch(`/__mock/projects/${encodeURIComponent(project.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      showMessage(`已保存并重载：${project.slug}`, "ok")
      await loadProjects()
    } catch (error) {
      showMessage(`保存失败：${error.message}`, "err")
    } finally {
      saveBtn.disabled = false
      reloadBtn.disabled = false
    }
  })

  reloadBtn.addEventListener("click", async () => {
    saveBtn.disabled = true
    reloadBtn.disabled = true
    try {
      const res = await fetch(
        `/__mock/projects/${encodeURIComponent(project.slug)}/reload`,
        { method: "POST" },
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`)
      }
      showMessage(`已重载：${project.slug}`, "ok")
      await loadProjects()
    } catch (error) {
      showMessage(`重载失败：${error.message}`, "err")
    } finally {
      saveBtn.disabled = false
      reloadBtn.disabled = false
    }
  })

  return card
}

function showMessage(text, type) {
  messageEl.hidden = false
  messageEl.className = `banner ${type}`
  messageEl.textContent = text
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;")
}

void loadProjects()
