# Multi-Project Mock Server Design

**Date:** 2026-07-30  
**Status:** Approved for implementation planning  
**Approach:** Single Node process — Admin host + per-project Express instances (Approach A)

## Problem

Long-running local mock setups need:

1. **Project-level isolation** — many products share one mock tooling repo; each product needs its own Express instance and port.
2. **Selective proxying** — only some APIs are mocked; undefined routes should forward to an existing backend.
3. **Visual configuration** — a simple HTML console to manage enablement, ports, and proxy settings without editing code for every tweak.

## Goals

- One Node process hosts a fixed admin console and N project HTTP servers (one port per enabled project).
- Mock routes remain code-defined under `src/projects/<slug>/` (existing extension model).
- Runtime config (enabled, port, proxy) lives in `config/projects.json`, editable via console, persisted, and hot-reloaded per project.
- Unmatched routes on a project instance optionally proxy as-is to a single upstream per project.
- Console is a config center only (no online mock editing, no request log UI in this phase).

## Non-Goals (this phase)

- Multi-upstream path rules
- Request logging / traffic replay UI
- Console-based mock route/JSON editing
- Multi-process worker isolation
- Admin authentication
- Path-prefix multi-tenant mode as the primary model (`/projects/<slug>` is retired as the main access pattern)

## Architecture

```text
                    ┌─────────────────────────────────────┐
  npm run dev  ──►  │  Mock Server Host (one Node process) │
                    │                                     │
                    │  ┌─────────────┐  fixed admin port  │
                    │  │ Admin App   │◄── HTML console    │
                    │  │ /console    │    + config REST   │
                    │  └──────┬──────┘                    │
                    │         │ read/write                 │
                    │         ▼                            │
                    │  config/projects.json                │
                    │         │                            │
                    │         ▼ ProjectManager             │
                    │  ┌──────────┐  ┌──────────┐         │
                    │  │ Project  │  │ Project  │  ...    │
                    │  │ Express  │  │ Express  │         │
                    │  │ :4001    │  │ :4002    │         │
                    │  └────┬─────┘  └────┬─────┘         │
                    └───────┼─────────────┼───────────────┘
                            │             │
              mock hit ──yes──► local     │
                    no + proxy on ──► upstream server
```

### Components

| Component | Responsibility |
|-----------|----------------|
| Host (`server.js`) | Boot process, load config, start Admin App + ProjectManager |
| Admin App | Fixed management port; static console + config REST API |
| ProjectManager | Start / stop / reload project instances; expose status |
| Project App | Per-project Express: CORS, JSON, mock router, proxy or 404 fallback |
| Code registry (`src/projects/`) | `slug`, `name`, `description`, `createRouter()` |
| Config store | Read/write/merge `config/projects.json`; safe write |

### Port model

- **Admin port:** default `4000`, overridable via `ADMIN_PORT` or `adminPort` in config.
- **Project ports:** per project in config (e.g. `tts-leaderboard` → `4001`). Frontends point `BASE_URL` at the project port root.
- Business mock APIs are **not** mounted on the admin port.

## Configuration Model

### Two layers of project information

| Source | Fields | Who changes |
|--------|--------|-------------|
| Code registry | `slug`, `name`, `description`, `createRouter` | Developers |
| Runtime config | `enabled`, `port`, `proxy.enabled`, `proxy.target` | Console / file edit |

### File shape (`config/projects.json`)

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

### Merge rules

- Config key **must** equal code `slug`.
- Code project missing from config: merge **defaults** on boot (`enabled: true` unless we choose otherwise — **default: enabled true** with a documented default port or next free default), then **write back** so the console always reflects full state.
- Config slug with no code project: **ignore** and log a warning.
- `proxy.enabled: true` with empty/invalid `target`: project may still serve mocks; proxy is treated as off and a **warning** is recorded for the console (`lastError` or a dedicated warning field).

### Defaults (initial template)

- `adminPort`: `4000`
- Existing sample project `tts-leaderboard`: `enabled: true`, `port: 4001`, `proxy.enabled: false`, `target: ""`
- New code projects without config: `enabled: true`, assign a default port (implementation: pick a free port in a reserved range e.g. 4001+ or require explicit port in a project-side default export — prefer **optional `defaultPort` on code meta**, fallback to first free port from 4001).

## Project Lifecycle

### Boot

1. Read config (generate + write defaults if missing).
2. Load code project registry.
3. Merge code meta + runtime config.
4. For each `enabled` project: create project app → `listen(port)`.
5. Start Admin app on `adminPort`.

### Hot reload (console save or file change)

1. Validate patch (port range, no conflict with admin or other enabled projects, URL format for target).
2. Write config atomically (temp file + rename).
3. Diff per project; for any affected project: **graceful `server.close` then start with new config** (simple and reliable; brief downtime OK).
4. Proxy-only changes may use full instance restart (same path) to avoid dual middleware state.
5. Return updated project view including `status` / `lastError`.

### Status enum

`stopped` | `starting` | `listening` | `error`

### Shutdown

On `SIGINT` / `SIGTERM`: close all project servers and admin server, then exit.

### ProjectManager surface (internal)

- `listProjects()` / `getProject(slug)`
- `updateProject(slug, patch)` → validate → persist → reload
- `reloadProject(slug)`
- Start/stop individual projects as needed by update

## Request Handling & Proxy

### Pipeline (per project instance)

```text
Request
  → CORS
  → body parsers (as needed for mock routes)
  → project createRouter() mock routes
  → fallback:
       proxy enabled + valid target → forward as-is
       else → 404 JSON { code, message, project, method, path }
```

### Mock priority

- Matched mock route always wins; never proxies.
- Project routers must not register a catch-all that swallows unmatched paths; fallback lives on the project app.

### Forward semantics

| Aspect | Behavior |
|--------|----------|
| Method / path / query | Forward to `target` + original URL path and query |
| Headers | Forward client headers; rewrite `Host` for upstream; strip hop-by-hop headers |
| Body | Must not drop body after `express.json` consumes the stream (implementation: re-serialize body or use a proxy pattern that supports parsed body) |
| Response | Pass through status, headers, body as much as practical |
| Upstream failure | `502` JSON with project, target, and error message |
| OPTIONS | Answer locally (204) for CORS; do not proxy preflight by default |

### Explicitly out of scope for proxy

- Path-based multi-target rules
- Auth header injection
- Response body rewriting

### Dependency

Add a lightweight proxy library (`http-proxy` or `http-proxy-middleware`) during implementation.

## Admin Console & API

### Console

- URL: `http://localhost:<adminPort>/`
- Stack: static HTML/CSS/JS under `public/console/` (no SPA build toolchain)
- Scope: list projects; edit `enabled`, `port`, `proxy.enabled`, `proxy.target`; save; optional reload; show `status` / `lastError`
- Read-only: `name`, `slug`, `description`, listening URL

### Validation

- Port: integer 1–65535; unique among admin + enabled projects
- `proxy.target`: absolute `http:` / `https:` URL when proxy enabled
- Show API error messages on failure

### REST API (Admin App)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/__mock/projects` | List projects (meta + config + status) |
| `GET` | `/__mock/projects/:slug` | Detail |
| `PATCH` | `/__mock/projects/:slug` | Update config and hot-reload |
| `POST` | `/__mock/projects/:slug/reload` | Force reload without config change |
| `GET` | `/health` | Host health + project summary |

`PATCH` body (partial):

```json
{
  "enabled": true,
  "port": 4001,
  "proxy": {
    "enabled": true,
    "target": "https://api.example.com"
  }
}
```

Response includes the full updated project view for UI re-render.

### Security (local dev defaults)

- No login in this phase
- Prefer binding suitable for local use; optional later lock to `127.0.0.1`

## Target Layout

```text
mock-server/
  config/
    projects.json
  public/
    console/
      index.html
      app.js
      styles.css
  src/
    server.js
    admin/
      app.js
      routes.js
    core/
      project-manager.js
      config-store.js
      create-project-app.js
      proxy.js
    lib/
      data.js
      http.js
    projects/
      index.js
      tts-leaderboard/
        index.js
        routes.js
        data/
  package.json
  README.md
  docs/superpowers/specs/
    2026-07-30-multi-project-mock-server-design.md
```

### Migration from current code

| Before | After |
|--------|-------|
| Single Express on one port for all projects | Admin port + per-project ports |
| `mountPath` / `rootCompatible` | Removed from primary model; project listens at root of its port |
| `src/app.js` registers all projects | Replaced by `create-project-app.js` + ProjectManager |
| Unmatched → 404 only | Unmatched → proxy (if configured) or 404 |
| `GET /__mock/projects` on mock port | Same path on **admin** port, richer payload |
| Frontend `BASE_URL=http://localhost:4000` | e.g. `http://localhost:4001` for tts-leaderboard |

`tts-leaderboard` route handlers and fixtures should remain largely unchanged.

### Scripts & env

- `npm run dev` / `npm start` unchanged in purpose
- Env: `ADMIN_PORT`, `CORS_ORIGIN`, `MOCK_DELAY_MS` (global default delay for mocks)

## Acceptance Criteria

1. **Independent ports:** An enabled project serves its mocks only on its configured port; a second registered project can listen on another port concurrently.
2. **Code extension:** Adding `src/projects/<slug>/` + registry entry makes the project appear in the console after process restart; configuring port enables traffic.
3. **Proxy:** With proxy on and valid target, unmatched paths forward correctly (method/query/body); matched mocks stay local; proxy off yields 404 for unmatched.
4. **Console:** Open admin root → see projects/status; save port/proxy/enabled → persists to `config/projects.json` and reloads that project without full process restart.
5. **Resilience:** Port conflict or listen failure sets project `error` without killing host or other projects; Ctrl+C shuts down cleanly.

## Implementation Notes (non-blocking)

- Prefer atomic config writes.
- On project listen failure, keep admin usable and surface `lastError`.
- Body + proxy interaction must be verified with at least one POST integration check during implementation.
- README must document: admin URL, per-project BASE_URL, how to add a project, how proxy works.

## Decisions Log

| Decision | Choice |
|----------|--------|
| Multi-project isolation | Independent port per project |
| Proxy model | Single default upstream per project |
| Console scope | Config center only |
| Config persistence | File + auto hot-reload on save |
| Process model | Single process, multi `listen` (Approach A) |
| Reload strategy | Per-project graceful restart |
| Frontend stack for console | Static HTML/CSS/JS |
