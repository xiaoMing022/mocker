# Multi-Project Mock Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Express mock server to per-project independent ports, single-upstream proxy fallback, and an HTML config console with file-persisted hot-reload.

**Architecture:** One Node process runs an Admin Express app (console + REST) and a ProjectManager that listens one Express app per enabled project. Mock routes stay in `src/projects/<slug>/`; runtime config lives in `config/projects.json`.

**Tech Stack:** Node.js (ESM), Express 5, `http-proxy-middleware`, static HTML/CSS/JS console.

**Spec:** `docs/superpowers/specs/2026-07-30-multi-project-mock-server-design.md`

## Global Constraints

- Single process, multi `listen` (Approach A) — no child processes
- One default upstream per project only
- Console is config-only (no mock editor, no request logs)
- Hot-reload = graceful close + restart of the affected project instance
- Atomic config write (temp file + rename)
- Keep `tts-leaderboard` route handlers/fixtures largely unchanged
- Admin port default `4000`; sample project port `4001`

## File Map

| File | Responsibility |
|------|----------------|
| `config/projects.json` | Runtime config template |
| `src/core/config-store.js` | Load/save/merge/validate config |
| `src/core/proxy.js` | Build proxy middleware + fallback |
| `src/core/create-project-app.js` | Assemble one project Express app |
| `src/core/project-manager.js` | Lifecycle + status of project servers |
| `src/admin/routes.js` | `/__mock/*` API |
| `src/admin/app.js` | Admin Express + static console |
| `src/server.js` | Boot host, signals |
| `src/projects/index.js` | Code registry only |
| `src/projects/tts-leaderboard/index.js` | Drop mountPath; add defaultPort |
| `public/console/*` | HTML console |
| `package.json` | Dependency + name |
| `README.md` | Usage docs |
| Remove `src/app.js` | Replaced by admin + project apps |

---

### Task 1: Config store

**Files:**
- Create: `src/core/config-store.js`
- Create: `config/projects.json`

**Produces:**
- `loadConfig(codeProjects)` → `{ adminPort, projects: Record<slug, RuntimeConfig> }`
- `saveConfig(config)` atomic write
- `getDefaultRuntimeConfig(slug, codeMeta, usedPorts)` 
- `validateProjectPatch(slug, patch, fullConfig)` → `{ ok, errors, value }`
- Types (conceptual): `RuntimeConfig = { enabled, port, proxy: { enabled, target } }`

- [ ] **Step 1: Add default config file**

```json
{
  "adminPort": 4000,
  "projects": {
    "tts-leaderboard": {
      "enabled": true,
      "port": 4001,
      "proxy": {
        "enabled": false,
        "target": ""
      }
    }
  }
}
```

- [ ] **Step 2: Implement config-store.js**

Path: resolve `config/projects.json` from repo root via `import.meta.url`.

Behavior:
- If file missing, build defaults from code projects and write
- Merge: code slugs win membership; missing runtime keys filled from defaults; unknown config slugs warned and dropped from active set (keep file as-is or strip — prefer keep file, ignore at runtime)
- `saveConfig`: write `projects.json.tmp` then `rename`
- Validate port 1–65535 integer; unique among admin + enabled projects; target empty OR valid http(s) URL

- [ ] **Step 3: Smoke-check via node -e import** (optional if no test runner)

- [ ] **Step 4: Commit** `feat: add config store and default projects.json`

---

### Task 2: Project app + proxy

**Files:**
- Create: `src/core/proxy.js`
- Create: `src/core/create-project-app.js`
- Modify: `package.json` (add `http-proxy-middleware`)

**Consumes:** RuntimeConfig, code project `{ createRouter, slug }`
**Produces:** `createProjectApp({ project, runtime })` → Express app

- [ ] **Step 1:** `npm install http-proxy-middleware`

- [ ] **Step 2: proxy.js**

```js
// createProxyFallback({ target, enabled, slug })
// returns Express middleware:
// - if !enabled or invalid target → 404 JSON
// - else createProxyMiddleware({ target, changeOrigin: true, ... })
// on error → 502 JSON
```

Fix body after json parser: use `onProxyReq` to re-write JSON body when `req.body` is object.

- [ ] **Step 3: create-project-app.js**

Pipeline: CORS → express.json() → createRouter() → proxy fallback

- [ ] **Step 4: Commit** `feat: project app with mock-first proxy fallback`

---

### Task 3: ProjectManager

**Files:**
- Create: `src/core/project-manager.js`

**Produces:**
- `createProjectManager({ codeProjects, configStore })`
- Methods: `start()`, `listProjects()`, `getProject(slug)`, `updateProject(slug, patch)`, `reloadProject(slug)`, `stopAll()`
- View model: `{ slug, name, description, enabled, port, proxy, status, lastError, url }`

- [ ] **Step 1: Implement start/stop/reload with status tracking**
- [ ] **Step 2: updateProject validates via configStore, saves, reloads**
- [ ] **Step 3: Commit** `feat: project manager lifecycle`

---

### Task 4: Admin API + console

**Files:**
- Create: `src/admin/routes.js`
- Create: `src/admin/app.js`
- Create: `public/console/index.html`
- Create: `public/console/app.js`
- Create: `public/console/styles.css`

- [ ] **Step 1: REST routes** GET list/detail, PATCH update, POST reload, GET /health
- [ ] **Step 2: Admin app static + API**
- [ ] **Step 3: Console UI** cards with enabled/port/proxy fields + save
- [ ] **Step 4: Commit** `feat: admin console and config API`

---

### Task 5: Wire host + migrate projects registry

**Files:**
- Modify: `src/server.js`
- Modify: `src/projects/index.js`
- Modify: `src/projects/tts-leaderboard/index.js`
- Delete: `src/app.js`
- Modify: `package.json` name → `mock-server`
- Modify: `README.md`

- [ ] **Step 1: server.js boots manager + admin, handles signals**
- [ ] **Step 2: Registry exports code projects only; tts meta has defaultPort: 4001**
- [ ] **Step 3: Update README**
- [ ] **Step 4: Manual verify** health, mock GET, console, proxy off 404
- [ ] **Step 5: Commit** `feat: multi-project host with independent ports`

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Independent ports | 3, 5 |
| Code extension model | 5 |
| Single upstream proxy | 2 |
| Config file + hot reload | 1, 3, 4 |
| HTML console config center | 4 |
| Atomic write / status / errors | 1, 3 |
| Clean shutdown | 5 |
| Migrate tts-leaderboard | 5 |
