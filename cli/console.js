import { readFileSync, writeFileSync } from "node:fs"

import { probePathForTemplate } from "../server/core/path-template.js"
import { probeRequest } from "./check.js"
import { adminFetch, requireProject } from "./commands.js"
import { fetchRoutes, findRoute } from "./query.js"
import { summarizeProject } from "./inspect.js"
import { fail, ok } from "./output.js"

/**
 * @param {string | undefined} file
 */
function readJson(file) {
  if (!file) fail({ ok: false, message: "Pass --file <path>." })
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    fail({ ok: false, message: `Cannot parse JSON: ${file}` })
  }
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {{ name?: string, description?: string, port?: string }} patch
 */
export async function updateProject(admin, project, patch) {
  const slug = requireProject(project)
  /** @type {Record<string, unknown>} */
  const body = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.description !== undefined) body.description = patch.description
  if (patch.port !== undefined && String(patch.port).trim() !== "") {
    const parsed = Number(patch.port)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      fail({ ok: false, message: "port must be an integer between 1 and 65535" })
    }
    body.port = parsed
  }
  if (!Object.keys(body).length) {
    fail({ ok: false, message: "mocker project update requires --name, --description, or --port" })
  }
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: summarizeProject(payload.project || {}) })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 */
export async function deleteProject(admin, project) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok(payload)
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 */
export async function reloadProject(admin, project) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/reload`, {
    method: "POST",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: summarizeProject(payload.project || {}) })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} file
 */
export async function replaceEnvironments(admin, project, file) {
  const slug = requireProject(project)
  const document = readJson(file)
  const environments =
    document && typeof document === "object" && !Array.isArray(document) && document.environments
      ? document.environments
      : document
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environments }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({
    project: slug,
    activeEnvironment: payload.project?.activeEnvironment || null,
    environments: payload.project?.environments || {},
  })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} file
 */
export async function createRoute(admin, project, file) {
  const slug = requireProject(project)
  const route = readJson(file)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: slug, route: payload.route })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} method
 * @param {string | undefined} routePath
 * @param {string | undefined} file
 */
export async function updateRoute(admin, project, method, routePath, file) {
  const slug = requireProject(project)
  const patch = readJson(file)
  const route = findRoute(await fetchRoutes(admin, slug), method || "", routePath || "")
  const response = await adminFetch(
    admin,
    `/__mock/projects/${encodeURIComponent(slug)}/routes/${encodeURIComponent(route.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: slug, route: payload.route })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} method
 * @param {string | undefined} routePath
 */
export async function deleteRoute(admin, project, method, routePath) {
  const slug = requireProject(project)
  const route = findRoute(await fetchRoutes(admin, slug), method || "", routePath || "")
  const response = await adminFetch(
    admin,
    `/__mock/projects/${encodeURIComponent(slug)}/routes/${encodeURIComponent(route.id)}`,
    { method: "DELETE" },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ ok: true, project: slug, method: route.method, path: route.path })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} file
 */
export async function exportRoutes(admin, project, file) {
  const slug = requireProject(project)
  const routes = await fetchRoutes(admin, slug)
  const document = { version: 2, routes }
  if (file) {
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`)
    ok({ ok: true, project: slug, file, routes: routes.length })
    return
  }
  ok(document)
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} file
 */
export async function importRoutes(admin, project, file) {
  const slug = requireProject(project)
  const document = readJson(file)
  const routes = Array.isArray(document) ? document : document?.routes
  if (!Array.isArray(routes)) {
    fail({ ok: false, message: "Import file must be a routes array or { routes: [] }" })
  }
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/routes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routes }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ ok: true, project: slug, routes: (payload.routes || []).length })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} id
 */
export async function getLog(admin, project, id) {
  const slug = requireProject(project)
  const logId = typeof id === "string" ? id.trim() : ""
  if (!logId) fail({ ok: false, message: "mocker logs get requires --id" })
  const response = await adminFetch(
    admin,
    `/__mock/projects/${encodeURIComponent(slug)}/logs/${encodeURIComponent(logId)}`,
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok(payload)
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 */
export async function clearLogs(admin, project) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/logs`, {
    method: "DELETE",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok(payload)
}

/**
 * @param {{
 *   admin: string,
 *   project?: string,
 *   id?: string,
 *   name?: string,
 *   match?: boolean,
 *   activate?: boolean
 * }} input
 */
export async function logToScenario(input) {
  const slug = requireProject(input.project)
  const logId = typeof input.id === "string" ? input.id.trim() : ""
  if (!logId) fail({ ok: false, message: "mocker logs to-scenario requires --id" })
  /** @type {Record<string, unknown>} */
  const body = { useAsMatch: Boolean(input.match), setActive: input.activate !== false }
  if (input.name) body.name = input.name
  const response = await adminFetch(
    input.admin,
    `/__mock/projects/${encodeURIComponent(slug)}/logs/${encodeURIComponent(logId)}/to-scenario`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok(payload)
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 */
export async function listChannels(admin, project) {
  const slug = requireProject(project)
  const response = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/channels`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...payload })
  ok({ project: slug, channels: payload.channels || [] })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} kind
 * @param {string | undefined} name
 * @param {boolean} enabled
 */
export async function setChannelEnabled(admin, project, kind, name, enabled) {
  const slug = requireProject(project)
  const channelKind = typeof kind === "string" ? kind.trim().toLowerCase() : ""
  const channelName = typeof name === "string" ? name.trim() : ""
  if (!channelKind || !channelName) {
    fail({ ok: false, message: "Pass --kind and --name." })
  }
  const listed = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}/channels`)
  const payload = await listed.json().catch(() => ({}))
  if (!listed.ok) fail({ ok: false, status: listed.status, ...payload })
  const channel = (payload.channels || []).find(
    (item) => item.kind === channelKind && item.name === channelName,
  )
  if (!channel) fail({ ok: false, message: `Channel not found: ${channelKind} ${channelName}` })
  const response = await adminFetch(
    admin,
    `/__mock/projects/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  )
  const saved = await response.json().catch(() => ({}))
  if (!response.ok) fail({ ok: false, status: response.status, ...saved })
  ok({ project: slug, channel: saved.channel })
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} method
 * @param {string | undefined} routePath
 */
async function loadCallTarget(admin, project, method, routePath) {
  const slug = requireProject(project)
  const projectResponse = await adminFetch(admin, `/__mock/projects/${encodeURIComponent(slug)}`)
  const projectPayload = await projectResponse.json().catch(() => ({}))
  if (!projectResponse.ok) fail({ ok: false, status: projectResponse.status, ...projectPayload })
  const base = projectPayload.project?.url
  if (!base) {
    fail({ ok: false, message: `Project ${slug} is not listening. Resume it before calling the route.` })
  }
  const route = findRoute(await fetchRoutes(admin, slug), method || "", routePath || "")
  const probed = probeRequest(route)
  const target = new URL(probePathForTemplate(route.path), base.endsWith("/") ? base : `${base}/`)
  for (const [key, value] of Object.entries(probed.query)) target.searchParams.set(key, value)
  return { slug, route, target, probed, base }
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} method
 * @param {string | undefined} routePath
 */
export async function callRoute(admin, project, method, routePath) {
  const { route, target, probed } = await loadCallTarget(admin, project, method, routePath)
  const verb = route.method
  /** @type {RequestInit} */
  const init = { method: verb, redirect: "manual" }
  const active =
    (route.scenarios || []).find((scenario) => scenario.id === route.activeScenarioId) ||
    route.scenarios?.[0]
  if (active?.mode === "sse") {
    init.headers = { Accept: "text/event-stream" }
  }
  if (probed.body !== undefined && verb !== "GET" && verb !== "HEAD") {
    init.headers = { ...(init.headers || {}), "Content-Type": "application/json" }
    init.body = JSON.stringify(probed.body)
  }
  let response
  try {
    response = await fetch(target, init)
  } catch (error) {
    fail({ ok: false, message: error instanceof Error ? error.message : String(error) })
  }
  const text = await response.text()
  let body = text
  if (!(response.headers.get("content-type") || "").includes("text/event-stream")) {
    try {
      body = text === "" ? null : JSON.parse(text)
    } catch {
      body = text
    }
  }
  ok({
    ok: true,
    status: response.status,
    url: target.toString(),
    origin: response.headers.get("x-mock-scenario-origin"),
    scenarioName: response.headers.get("x-mock-scenario-name"),
    body,
  })
}

/**
 * @param {Record<string, any>} route
 * @param {string} base
 */
export function buildCurl(route, base) {
  const probed = probeRequest(route)
  const target = new URL(probePathForTemplate(route.path), base.endsWith("/") ? base : `${base}/`)
  for (const [key, value] of Object.entries(probed.query)) target.searchParams.set(key, value)
  const active =
    (route.scenarios || []).find((scenario) => scenario.id === route.activeScenarioId) ||
    route.scenarios?.[0]
  const parts = [`curl -sS${active?.mode === "sse" ? " -N" : ""} -X ${route.method}`]
  if (active?.mode === "sse") parts.push(`-H ${quote("Accept: text/event-stream")}`)
  if (route.method !== "GET" && route.method !== "HEAD") {
    parts.push(`-H ${quote("Content-Type: application/json")}`)
    parts.push(`-d ${quote(JSON.stringify(probed.body === undefined ? {} : probed.body))}`)
  }
  parts.push(quote(target.toString()))
  return parts.join(" ")
}

/**
 * @param {string} value
 */
function quote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

/**
 * @param {string} admin
 * @param {string | undefined} project
 * @param {string | undefined} method
 * @param {string | undefined} routePath
 */
export async function printCurl(admin, project, method, routePath) {
  const { route, base } = await loadCallTarget(admin, project, method, routePath)
  process.stdout.write(`${buildCurl(route, base)}\n`)
}
