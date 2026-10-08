import { normalizeChannel } from "./channel-store.js"
import { patternKey, validateRoutePath } from "./path-template.js"
import { normalizeRoute, normalizeScenario, readDocumentTags } from "./route-store.js"

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
const SCENARIO_MODES = new Set(["json", "sse"])

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   routes: object[] | null,
 *   channels: object[] | null
 * } | { ok: false, errors: string[] }}
 */
export function parseApplyDocument(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["apply document must be an object"] }
  }
  const hasRoutes = Object.prototype.hasOwnProperty.call(body, "routes")
  const hasChannels = Object.prototype.hasOwnProperty.call(body, "channels")
  if (!hasRoutes && !hasChannels) {
    return { ok: false, errors: ["document needs routes or channels"] }
  }

  /** @type {string[]} */
  const errors = []
  /** @type {object[] | null} */
  let routes = null
  /** @type {object[] | null} */
  let channels = null

  if (hasRoutes) {
    if (!Array.isArray(body.routes)) {
      errors.push("routes must be an array")
    } else {
      routes = []
      /** @type {Set<string>} */
      const routeKeys = new Set()
      /** @type {Map<string, string>} */
      const shapes = new Map()
      for (let i = 0; i < body.routes.length; i += 1) {
        const parsed = parseSpecRoute(body.routes[i], i, errors)
        if (!parsed) continue
        const key = `${parsed.method} ${parsed.path}`
        if (routeKeys.has(key)) {
          errors.push(`duplicate interface in document: ${key}`)
          continue
        }
        const shape = patternKey(parsed.method, parsed.path)
        const previous = shapes.get(shape)
        if (previous) {
          errors.push(`routes overlap: ${previous} and ${key}`)
          continue
        }
        routeKeys.add(key)
        shapes.set(shape, key)
        routes.push(parsed)
      }
    }
  }

  if (hasChannels) {
    if (!Array.isArray(body.channels)) {
      errors.push("channels must be an array")
    } else {
      channels = []
      /** @type {Set<string>} */
      const channelKeys = new Set()
      for (let i = 0; i < body.channels.length; i += 1) {
        const parsed = parseSpecChannel(body.channels[i], i, errors)
        if (!parsed) continue
        const key = `${parsed.kind}:${parsed.name}`
        if (channelKeys.has(key)) {
          errors.push(`duplicate channel in document: ${key}`)
          continue
        }
        channelKeys.add(key)
        channels.push(parsed)
      }
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, routes, channels }
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @param {string[]} errors
 */
function parseSpecRoute(raw, index, errors) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`routes[${index}] must be an object`)
    return null
  }
  rejectKeys(raw, ["id", "origin", "enabled", "activeScenarioId"], `routes[${index}]`, errors)
  const method = String(raw.method || "").toUpperCase()
  const routePath = typeof raw.path === "string" ? raw.path.trim() : ""
  if (!METHODS.has(method)) {
    errors.push(`routes[${index}] needs method and a path starting with /`)
    return null
  }
  const pathError = validateRoutePath(routePath)
  if (pathError) {
    errors.push(`routes[${index}] ${pathError}`)
    return null
  }
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0) {
    errors.push(`routes[${index}] needs at least one scenario`)
    return null
  }

  /** @type {object[]} */
  const scenarios = []
  /** @type {Set<string>} */
  const names = new Set()
  let scenarioOk = true
  for (let si = 0; si < raw.scenarios.length; si += 1) {
    const where = `routes[${index}].scenarios[${si}]`
    const item = raw.scenarios[si]
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${where} must be an object`)
      scenarioOk = false
      continue
    }
    rejectKeys(item, ["id", "origin"], where, errors)
    if (item.mode != null && !SCENARIO_MODES.has(item.mode)) {
      errors.push(`${where}.mode must be json or sse`)
      scenarioOk = false
      continue
    }
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (!name) {
      errors.push(`${where}.name is required`)
      scenarioOk = false
      continue
    }
    if (names.has(name)) {
      errors.push(`${where} duplicate scenario name ${name}`)
      scenarioOk = false
      continue
    }
    names.add(name)
    /** @type {Record<string, unknown>} */
    const scenario = { name }
    for (const key of [
      "statusCode",
      "delayMs",
      "response",
      "headers",
      "match",
      "mode",
      "stream",
      "pagination",
    ]) {
      if (Object.prototype.hasOwnProperty.call(item, key)) scenario[key] = item[key]
    }
    if (Object.prototype.hasOwnProperty.call(item, "tags")) {
      const parsedTags = readDocumentTags(item.tags)
      if (!parsedTags.ok) {
        errors.push(`${where}.${parsedTags.error}`)
        scenarioOk = false
        continue
      }
      scenario.tags = parsedTags.tags
    }
    scenarios.push(scenario)
  }
  if (!scenarioOk) return null

  /** @type {Record<string, unknown>} */
  const route = { method, path: routePath, scenarios }
  for (const key of ["name", "note", "requestExample", "proxyHeaders", "pagination"]) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) route[key] = raw[key]
  }
  return route
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @param {string[]} errors
 */
function parseSpecChannel(raw, index, errors) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`channels[${index}] must be an object`)
    return null
  }
  rejectKeys(raw, ["id", "origin", "enabled", "runtime"], `channels[${index}]`, errors)
  const kind = raw.kind === "websocket" || raw.kind === "rtc" ? raw.kind : ""
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (!kind || !name) {
    errors.push(`channels[${index}] needs kind websocket|rtc and a name`)
    return null
  }
  /** @type {Record<string, unknown>} */
  const channel = { kind, name }
  if (Object.prototype.hasOwnProperty.call(raw, "bind")) {
    const bind = raw.bind
    const bindPath =
      bind && typeof bind === "object" && typeof bind.path === "string" ? bind.path.trim() : ""
    if (!bindPath.startsWith("/")) {
      errors.push(`channels[${index}].bind.path must start with /`)
      return null
    }
    channel.bind = { path: bindPath }
  } else if (kind === "websocket") {
    errors.push(`channels[${index}] websocket requires bind.path`)
    return null
  }
  return channel
}

/**
 * @param {object} raw
 * @param {string[]} keys
 * @param {string} where
 * @param {string[]} errors
 */
function rejectKeys(raw, keys, where, errors) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      errors.push(`${where}.${key} is not accepted; the server owns it`)
    }
  }
}

/**
 * @param {import("./route-store.js").DynamicRoute[]} currentRoutes
 * @param {object[]} specRoutes
 */
export function mergeSpecRoutes(currentRoutes, specRoutes) {
  /** @type {string[]} */
  const created = []
  /** @type {string[]} */
  const updated = []
  /** @type {string[]} */
  const unchanged = []
  /** @type {string[]} */
  const removed = []
  /** @type {string[]} */
  const specScenariosRemoved = []

  /** @type {Set<string>} */
  const specKeys = new Set(specRoutes.map((route) => `${route.method} ${route.path}`))
  /** @type {import("./route-store.js").DynamicRoute[]} */
  const next = []

  for (const current of currentRoutes) {
    const key = `${current.method} ${current.path}`
    if (!specKeys.has(key)) {
      const kept = dropSpecScenarios(current, key, specScenariosRemoved)
      if (!kept) {
        removed.push(key)
        continue
      }
      if (kept.scenarios.length !== current.scenarios.length) updated.push(key)
      next.push(kept)
      continue
    }
    const spec = specRoutes.find((route) => `${route.method} ${route.path}` === key)
    const merged = mergeExistingRoute(current, spec, key, specScenariosRemoved)
    if (JSON.stringify(merged) === JSON.stringify(current)) unchanged.push(key)
    else updated.push(key)
    next.push(merged)
  }

  for (const spec of specRoutes) {
    const key = `${spec.method} ${spec.path}`
    if (currentRoutes.some((route) => `${route.method} ${route.path}` === key)) continue
    next.push(createSpecRoute(spec))
    created.push(key)
  }

  return {
    routes: next,
    report: { created, updated, unchanged, removed, specScenariosRemoved },
  }
}

/**
 * @param {import("./route-store.js").DynamicRoute} current
 * @param {string} key
 * @param {string[]} specScenariosRemoved
 * @returns {import("./route-store.js").DynamicRoute | null}
 */
function dropSpecScenarios(current, key, specScenariosRemoved) {
  const kept = current.scenarios.filter((scenario) => scenario.origin !== "spec")
  if (kept.length === current.scenarios.length) return current
  for (const scenario of current.scenarios) {
    if (scenario.origin === "spec") specScenariosRemoved.push(`${key}#${scenario.name}`)
  }
  if (kept.length === 0) return null
  const active = kept.some((scenario) => scenario.id === current.activeScenarioId)
    ? current.activeScenarioId
    : kept[0].id
  return normalizeRoute({ ...current, scenarios: kept, activeScenarioId: active })
}

/**
 * @param {import("./route-store.js").DynamicRoute} current
 * @param {object} spec
 * @param {string} key
 * @param {string[]} specScenariosRemoved
 */
function mergeExistingRoute(current, spec, key, specScenariosRemoved) {
  /** @type {Map<string, object>} */
  const specByName = new Map(spec.scenarios.map((scenario) => [scenario.name, scenario]))
  /** @type {Set<string>} */
  const seen = new Set()
  /** @type {import("./route-store.js").Scenario[]} */
  const scenarios = []

  for (const scenario of current.scenarios) {
    if (scenario.origin !== "spec") {
      scenarios.push(scenario)
      continue
    }
    const incoming = specByName.get(scenario.name)
    if (!incoming) {
      specScenariosRemoved.push(`${key}#${scenario.name}`)
      continue
    }
    seen.add(scenario.name)
    /** @type {Record<string, unknown>} */
    const nextInput = {
      ...incoming,
      id: scenario.id,
      origin: "spec",
    }
    if (!Object.prototype.hasOwnProperty.call(incoming, "tags")) {
      nextInput.tags = scenario.tags
    }
    scenarios.push(normalizeScenario(nextInput))
  }

  for (const scenario of spec.scenarios) {
    if (seen.has(scenario.name)) continue
    scenarios.push(normalizeScenario({ ...scenario, origin: "spec" }))
  }

  const active = scenarios.some((scenario) => scenario.id === current.activeScenarioId)
    ? current.activeScenarioId
    : scenarios[0].id

  /** @type {Record<string, unknown>} */
  const routeInput = {
    ...current,
    enabled: current.enabled,
    activeScenarioId: active,
    origin: current.origin === "spec" ? "spec" : "console",
    scenarios,
  }
  for (const field of ["name", "note", "requestExample", "proxyHeaders", "pagination"]) {
    if (Object.prototype.hasOwnProperty.call(spec, field)) routeInput[field] = spec[field]
  }
  return normalizeRoute(routeInput)
}

/**
 * @param {object} spec
 */
function createSpecRoute(spec) {
  const scenarios = spec.scenarios.map((scenario) =>
    normalizeScenario({ ...scenario, origin: "spec" }),
  )
  return normalizeRoute({
    ...spec,
    enabled: true,
    origin: "spec",
    scenarios,
    activeScenarioId: scenarios[0].id,
  })
}

/**
 * @param {import("./channel-store.js").Channel[]} currentChannels
 * @param {object[]} specChannels
 */
export function mergeSpecChannels(currentChannels, specChannels) {
  /** @type {string[]} */
  const created = []
  /** @type {string[]} */
  const updated = []
  /** @type {string[]} */
  const removed = []
  /** @type {import("./channel-store.js").Channel[]} */
  const next = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const current of currentChannels) {
    const key = `${current.kind}:${current.name}`
    const spec = specChannels.find(
      (channel) => channel.kind === current.kind && channel.name === current.name,
    )
    if (!spec) {
      if (current.origin === "spec") {
        removed.push(key)
        continue
      }
      next.push(current)
      continue
    }
    seen.add(key)
    const merged = normalizeChannel({
      ...current,
      bind: Object.prototype.hasOwnProperty.call(spec, "bind") ? spec.bind : current.bind,
      enabled: current.enabled,
      origin: current.origin,
      id: current.id,
    })
    if (JSON.stringify(merged) === JSON.stringify(current)) next.push(current)
    else {
      updated.push(key)
      next.push(merged)
    }
  }

  for (const spec of specChannels) {
    const key = `${spec.kind}:${spec.name}`
    if (seen.has(key)) continue
    next.push(
      normalizeChannel({
        kind: spec.kind,
        name: spec.name,
        bind: spec.bind,
        enabled: true,
        origin: "spec",
      }),
    )
    created.push(key)
  }

  return { channels: next, report: { created, updated, removed } }
}
