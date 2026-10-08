import { writeFileSync } from "node:fs"

import { activationTargets, selectScenario } from "./activate.js"
import { logsToDocument } from "./capture.js"
import { decodeScenarioName, judgeProbe, probeRequest } from "./check.js"
import { selectScenarioByTag } from "./inspect.js"
import { probePathForTemplate } from "../server/core/path-template.js"
import { fail, ok } from "./output.js"
import { printSkillRead } from "./skills.js"

/**
 * @param {string | undefined} flag
 */
export function adminBase(flag) {
  if (flag) return flag.replace(/\/$/, "")
  if (process.env.MOCKER_ADMIN_URL) return process.env.MOCKER_ADMIN_URL.replace(/\/$/, "")
  const port = Number(process.env.ADMIN_PORT)
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return `http://127.0.0.1:${port}`
  }
  return "http://127.0.0.1:4000"
}

/**
 * @param {string} admin
 */
export async function status(admin) {
  let response
  try {
    response = await fetch(`${admin}/health`)
  } catch {
    fail({
      ok: false,
      message: `Admin is not running at ${admin}. Start it with \`mocker start\` or the desktop app.`,
    })
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    fail({ ok: false, status: response.status, ...body })
  }
  ok(body)
}

export function applyDocumentSchema() {
  return {
    command: "mocker apply --file <path> [--project <slug>] [--admin <url>]",
    document: {
      project: "project-slug",
      routes: [
        {
          method: "GET",
          path: "/api/orders/:id",
          name: "订单",
          requestExample: { query: { verbose: "1" } },
          pagination: {
            enabled: true,
            preset: "page-pageSize",
            listPath: "list",
            totalPath: "total",
          },
          scenarios: [
            {
              name: "ok",
              statusCode: 200,
              delayMs: 0,
              mode: "json",
              headers: { "X-Example": "1" },
              match: {
                query: { verbose: "1" },
                headers: { "X-Role": "admin" },
                body: { winner: "A" },
              },
              tags: ["ok"],
              response: { id: "1", list: [], total: 0 },
            },
            {
              name: "stream",
              statusCode: 200,
              mode: "sse",
              stream: {
                events: [{ event: "delta", data: { text: "hi" }, delayMs: 20 }],
                endWithDone: true,
                keepAliveMs: 0,
              },
            },
          ],
        },
      ],
      channels: [
        { kind: "websocket", name: "chat", bind: { path: "/ws/chat" } },
        { kind: "rtc", name: "call" },
      ],
    },
    rules: [
      "Put this file in the user project. mocker apply posts it to the running admin.",
      "Route identity is method + path. A path may include :param segments. :name matches one path segment.",
      "Static segments outrank parameters. /api/orders/export wins over /api/orders/:id. Overlapping templates are rejected.",
      "Scenario identity inside a spec route is name. tags are lowercase labels, not a second name.",
      "Apply updates tags on spec scenarios when the document includes tags. Omitted tags stay. Console scenario tags stay.",
      "Omit routes to leave HTTP mocks untouched. An empty routes array removes spec scenarios only.",
      "Omit channels to leave channel records untouched. An empty channels array removes spec channels.",
      "Apply updates origin spec scenarios and keeps console scenarios and the active scenario.",
      "Do not send id, origin, enabled, or activeScenarioId. mode is json or sse.",
      "match is exact equality on headers, query, and dot-paths in the JSON body. The first matching conditional scenario wins.",
      "pagination slices listPath. preset is page-pageSize, pageNum-pageSize, or offset-limit.",
      "sse stream.events[] may set event, data, id, retry, and delayMs. endWithDone appends [DONE].",
      "check requests each :param as the segment 1. /api/orders/:id is requested as /api/orders/1.",
      "check sends requestExample query, and requestExample body on methods other than GET and HEAD.",
      "check compares the JSON body with the hit spec scenario. Paginated routes use that same query and body. SSE is compared by status and scenario only.",
      "A JSON body of {} passes only when the spec scenario response is {}.",
      "websocket requires bind.path. rtc bind is optional. Both are recorded as runtime unimplemented.",
    ],
  }
}

export function printSchema() {
  ok(applyDocumentSchema())
}

/**
 * @param {{
 *   admin: string,
 *   file: string,
 *   project?: string,
 *   document: unknown
 * }} input
 */
export async function applyDocument({ admin, file, project, document }) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail({ ok: false, message: `Apply document must be a JSON object: ${file}` })
  }
  const slug =
    (project && project.trim()) ||
    (typeof document.project === "string" ? document.project.trim() : "")
  if (!slug) {
    fail({
      ok: false,
      message: "Missing project. Set document.project or pass --project.",
    })
  }
  const body = { ...document, project: slug }
  let response
  try {
    response = await fetch(`${admin}/__mock/projects/${encodeURIComponent(slug)}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    fail({
      ok: false,
      message: `Admin is not running at ${admin}. Start it with \`mocker start\` or the desktop app.`,
    })
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    fail({ ok: false, status: response.status, ...payload })
  }
  ok(payload)
}

/**
 * @param {{ admin: string, slug?: string, name?: string, port?: string }} input
 */
export async function createProject({ admin, slug, name, port }) {
  const projectSlug = typeof slug === "string" ? slug.trim() : ""
  const projectName = typeof name === "string" ? name.trim() : ""
  if (!projectSlug || !projectName) {
    fail({ ok: false, message: "mocker project create requires --slug and --name" })
  }
  /** @type {Record<string, unknown>} */
  const body = { slug: projectSlug, name: projectName }
  if (port != null && String(port).trim() !== "") {
    const parsed = Number(port)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      fail({ ok: false, message: "port must be an integer between 1 and 65535" })
    }
    body.port = parsed
  }
  let response
  try {
    response = await fetch(`${admin}/__mock/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    fail({
      ok: false,
      message: `Admin is not running at ${admin}. Start it with \`mocker start\` or the desktop app.`,
    })
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    fail({ ok: false, status: response.status, ...payload })
  }
  ok(payload)
}



/**
 * @param {string} admin
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function adminFetch(admin, path, init) {
  try {
    return await fetch(`${admin}${path}`, init)
  } catch {
    fail({
      ok: false,
      message: `Admin is not running at ${admin}. Start it with \`mocker start\` or the desktop app.`,
    })
  }
}

/**
 * @param {{ admin: string, project?: string, source?: string, limit?: string, method?: string, path?: string }} input
 */
export async function listLogs({ admin, project, source, limit, method, path }) {
  const slug = requireProject(project)
  const params = new URLSearchParams()
  params.set("limit", limit && String(limit).trim() ? String(limit) : "50")
  if (source) params.set("source", source)
  if (method) params.set("method", method)
  if (path) params.set("path", path)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/logs?${params}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok(payload)
}

/**
 * @param {{ admin: string, project?: string, source?: string, limit?: string, file?: string }} input
 */
export async function captureLogs({ admin, project, source, limit, file }) {
  const slug = requireProject(project)
  const params = new URLSearchParams()
  params.set("limit", limit && String(limit).trim() ? String(limit) : "50")
  if (source) params.set("source", source)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/logs?${params}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  const document = logsToDocument(slug, payload.logs || [])
  if (file) {
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`)
    ok({ ok: true, project: slug, file, routes: document.routes.length })
    return
  }
  ok(document)
}

/**
 * @param {{ admin: string, project?: string, document: { project?: string, routes?: object[] } }} input
 */
export async function checkDocument({ admin, project, document }) {
  const slug =
    (project && project.trim()) ||
    (typeof document.project === "string" ? document.project.trim() : "")
  if (!slug) fail({ ok: false, message: "Missing project. Set document.project or pass --project." })
  if (!Array.isArray(document.routes)) fail({ ok: false, message: "document.routes must be an array" })

  const projectResponse = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`)
  const projectPayload = await projectResponse.json().catch(() => ({}))
  if (!projectResponse.ok) fail({ ok: false, status: projectResponse.status, ...projectPayload })
  const base = projectPayload.project?.url
  if (!base) {
    fail({ ok: false, message: `Project ${slug} is not listening. Resume it in the console or with the admin API.` })
  }

  /** @type {ReturnType<typeof judgeProbe>[]} */
  const results = []
  for (const route of document.routes) {
    const method = String(route.method || "GET").toUpperCase()
    const routePath = typeof route.path === "string" ? route.path : ""
    if (!routePath.startsWith("/")) {
      results.push(judgeProbe(route, { status: null, origin: null, scenarioName: null, error: "path must start with /" }))
      continue
    }
    const probed = probeRequest(route)
    const target = new URL(
      probePathForTemplate(routePath),
      base.endsWith("/") ? base : `${base}/`,
    )
    for (const [key, value] of Object.entries(probed.query)) {
      target.searchParams.set(key, value)
    }
    /** @type {RequestInit} */
    const init = { method, redirect: "manual" }
    if (probed.body !== undefined && method !== "GET" && method !== "HEAD") {
      init.headers = { "Content-Type": "application/json" }
      init.body = JSON.stringify(probed.body)
    }
    try {
      const response = await fetch(target, init)
      const origin = response.headers.get("x-mock-scenario-origin")
      const scenarioName = decodeScenarioName(response.headers.get("x-mock-scenario-name"))
      const contentType = response.headers.get("content-type") || ""
      /** @type {{ status: number, origin: string | null, scenarioName: string | null, body?: unknown, bodyError?: string }} */
      const probe = { status: response.status, origin, scenarioName }
      if (!contentType.includes("text/event-stream")) {
        const text = await response.text()
        try {
          probe.body = text === "" ? null : JSON.parse(text)
        } catch {
          probe.bodyError = "response is not JSON"
        }
      } else {
        await response.arrayBuffer().catch(() => {})
      }
      results.push(judgeProbe(route, probe))
    } catch (error) {
      results.push(
        judgeProbe(route, {
          status: null,
          origin: null,
          scenarioName: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  const report = { ok: results.every((item) => item.ok), project: slug, url: base, results }
  if (!report.ok) fail(report)
  ok(report)
}

/**
 * @param {Record<string, any>} route
 * @param {string} tag
 */
function pickedScenario(route, tag) {
  const picked = selectScenarioByTag(route, tag)
  if (!picked.ok) {
    fail({
      ok: false,
      message: `${picked.message} on ${route.method} ${route.path}`,
      scenarios: picked.scenarios,
    })
  }
  return picked.scenario
}

/**
 * Switch the active scenario. Does not edit scenario bodies.
 * @param {{
 *   admin: string,
 *   project?: string,
 *   method?: string,
 *   path?: string,
 *   name?: string,
 *   tag?: string,
 *   document?: { project?: string, routes?: unknown }
 * }} input
 */
export async function activateScenarios({ admin, project, method, path: routePath, name, tag, document }) {
  /** @type {{ method: string, path: string, name?: string, tag?: string }[]} */
  let targets
  /** @type {string} */
  let slug
  if (document) {
    if (tag) fail({ ok: false, message: "mocker scenario activate --tag cannot be combined with --file" })
    slug =
      (project && project.trim()) ||
      (typeof document.project === "string" ? document.project.trim() : "")
    if (!slug) fail({ ok: false, message: "Missing project. Set document.project or pass --project." })
    const parsed = activationTargets(document)
    if (!parsed.ok) fail({ ok: false, message: parsed.message })
    targets = parsed.targets
  } else {
    slug = requireProject(project)
    const verb = String(method || "").toUpperCase()
    const scenarioName = typeof name === "string" ? name.trim() : ""
    const scenarioTag = typeof tag === "string" ? tag.trim().toLowerCase() : ""
    if (scenarioName && scenarioTag) {
      fail({ ok: false, message: "mocker scenario activate accepts --name or --tag, not both" })
    }
    if (!verb || !routePath || (!scenarioName && !scenarioTag)) {
      fail({
        ok: false,
        message: "mocker scenario activate requires --method, --path, and --name or --tag, or --file",
      })
    }
    targets = [{ method: verb, path: routePath, name: scenarioName, tag: scenarioTag }]
  }

  const listed = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/routes`)
  const payload = await listed.json().catch(() => ({}))
  if (!listed.ok) fail({ ok: false, status: listed.status, ...payload })
  const routes = payload.routes || []

  /** @type {object[]} */
  const activated = []
  for (const target of targets) {
    const route = routes.find(
      (item) => item.method === target.method && item.path === target.path,
    )
    if (!route) {
      fail({ ok: false, message: `Route not found: ${target.method} ${target.path}` })
    }
    const scenario = target.tag
      ? pickedScenario(route, target.tag)
      : selectScenario(route, target.name || "")
    if (!scenario) {
      fail({
        ok: false,
        message: `Scenario not found: ${target.name} on ${target.method} ${target.path}`,
      })
    }
    const previous = (route.scenarios || []).find((item) => item.id === route.activeScenarioId)
    if (previous?.id !== scenario.id) {
      const response = await adminFetch(
        admin,
        `/__mock/projects/${encodeURIComponent(slug)}/routes/${encodeURIComponent(route.id)}/activate-scenario`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: scenario.id }),
        },
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) fail({ ok: false, status: response.status, ...body })
    }
    activated.push({
      method: target.method,
      path: target.path,
      name: scenario.name,
      origin: scenario.origin === "spec" ? "spec" : "console",
      tags: Array.isArray(scenario.tags) ? scenario.tags : [],
      previous: previous?.name || null,
    })
  }
  ok({ ok: true, project: slug, activated })
}

/**
 * @param {string | undefined} project
 */
export function requireProject(project) {
  const slug = typeof project === "string" ? project.trim() : ""
  if (!slug) fail({ ok: false, message: "Pass --project <slug>." })
  return slug
}

export function printSkill() {
  printSkillRead("mocker")
}
