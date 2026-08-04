import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { getConfigRoot } from "./paths.js"
import { normalizeHeaderMap } from "./util/headers.js"
import { SLUG_RE, ENV_ID_RE, isValidSlug } from "./util/ids.js"

function configDir() {
  return getConfigRoot()
}
function configPath() {
  return path.join(getConfigRoot(), "projects.json")
}
function configTmpPath() {
  return path.join(getConfigRoot(), "projects.json.tmp")
}

const DEFAULT_ADMIN_PORT = 4000
const DEFAULT_PORT_START = 4001

/**
 * @typedef {{ pathPrefix: string, target?: string, enabled?: boolean }} ProxyRule
 * @typedef {{ enabled: boolean, target: string, rules: ProxyRule[], headers: Record<string, string> }} ProxyConfig
 * @typedef {{ name: string, proxy: ProxyConfig }} EnvironmentConfig
 * @typedef {{
 *   name?: string,
 *   description?: string,
 *   enabled: boolean,
 *   port: number,
 *   activeEnvironment: string,
 *   environments: Record<string, EnvironmentConfig>,
 *   proxy: ProxyConfig,
 *   managed?: boolean
 * }} RuntimeConfig
 * @typedef {{ adminPort: number, projects: Record<string, RuntimeConfig> }} AppConfig
 * @typedef {{ slug: string, name?: string, defaultPort?: number }} CodeProjectMeta
 */

export function getConfigPath() {
  return configPath()
}

/**
 * @param {CodeProjectMeta[]} codeProjects
 * @returns {AppConfig}
 */
export function loadConfig(codeProjects) {
  const raw = readConfigFile()
  const { config, dirty } = mergeWithCodeProjects(raw, codeProjects)

  if (!existsSync(configPath()) || dirty) {
    saveConfig(config)
  }

  return config
}

/**
 * @param {AppConfig} config
 */
export function resolveAdminPort(config) {
  if (process.env.ADMIN_PORT) {
    const fromEnv = Number(process.env.ADMIN_PORT)
    if (Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 65535) {
      return fromEnv
    }
  }
  return config.adminPort || DEFAULT_ADMIN_PORT
}

function readConfigFile() {
  if (!existsSync(configPath())) {
    return {
      adminPort: DEFAULT_ADMIN_PORT,
      projects: {},
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"))
    return normalizeAppConfig(parsed)
  } catch (error) {
    console.warn(
      `[config] Failed to parse ${configPath()}: ${error.message}. Using defaults.`,
    )
    return {
      adminPort: DEFAULT_ADMIN_PORT,
      projects: {},
    }
  }
}

/**
 * @param {unknown} parsed
 * @returns {AppConfig}
 */
function normalizeAppConfig(parsed) {
  const adminPort = toPort(parsed?.adminPort, DEFAULT_ADMIN_PORT)

  /** @type {Record<string, RuntimeConfig>} */
  const projects = {}
  const source = parsed?.projects && typeof parsed.projects === "object" ? parsed.projects : {}

  for (const [slug, value] of Object.entries(source)) {
    projects[slug] = normalizeRuntimeConfig(value, DEFAULT_PORT_START)
  }

  return { adminPort, projects }
}

/**
 * Normalize a raw proxy object.
 * @param {unknown} proxySource
 * @returns {ProxyConfig}
 */
export function normalizeProxyConfig(proxySource) {
  const src = proxySource && typeof proxySource === "object" ? proxySource : {}
  return {
    enabled: Boolean(src.enabled),
    target: typeof src.target === "string" ? src.target.trim() : "",
    rules: normalizeProxyRules(src.rules),
    headers: normalizeHeaderMap(src.headers),
  }
}

/**
 * Resolve effective proxy from environments + activeEnvironment.
 * @param {{ activeEnvironment?: string, environments?: Record<string, EnvironmentConfig>, proxy?: ProxyConfig }} rt
 * @returns {ProxyConfig}
 */
export function resolveEffectiveProxy(rt) {
  const envs = rt?.environments && typeof rt.environments === "object" ? rt.environments : null
  const active = typeof rt?.activeEnvironment === "string" ? rt.activeEnvironment : ""
  if (envs && active && envs[active]?.proxy) {
    return normalizeProxyConfig(envs[active].proxy)
  }
  if (envs) {
    const firstKey = Object.keys(envs)[0]
    if (firstKey && envs[firstKey]?.proxy) {
      return normalizeProxyConfig(envs[firstKey].proxy)
    }
  }
  return normalizeProxyConfig(rt?.proxy)
}

/**
 * @param {unknown} value
 * @param {number} fallbackPort
 * @returns {RuntimeConfig}
 */
export function normalizeRuntimeConfig(value, fallbackPort) {
  const legacyProxy = normalizeProxyConfig(
    value?.proxy && typeof value.proxy === "object" ? value.proxy : {},
  )

  /** @type {Record<string, EnvironmentConfig>} */
  let environments = {}
  let activeEnvironment = "default"

  if (value?.environments && typeof value.environments === "object") {
    for (const [id, envVal] of Object.entries(value.environments)) {
      const envId = String(id).trim()
      if (!envId) continue
      const envObj = envVal && typeof envVal === "object" ? envVal : {}
      const name =
        typeof envObj.name === "string" && envObj.name.trim()
          ? envObj.name.trim()
          : envId
      environments[envId] = {
        name,
        proxy: normalizeProxyConfig(envObj.proxy),
      }
    }
  }

  if (Object.keys(environments).length === 0) {
    environments = {
      default: {
        name: "默认",
        proxy: legacyProxy,
      },
    }
    activeEnvironment = "default"
  } else {
    const requested =
      typeof value?.activeEnvironment === "string"
        ? value.activeEnvironment.trim()
        : ""
    if (requested && environments[requested]) {
      activeEnvironment = requested
    } else {
      activeEnvironment = Object.keys(environments)[0]
    }
  }

  const proxy = resolveEffectiveProxy({ activeEnvironment, environments })

  return {
    name: typeof value?.name === "string" ? value.name.trim() : undefined,
    description: typeof value?.description === "string" ? value.description : undefined,
    enabled: value?.enabled !== false,
    port: toPort(value?.port, fallbackPort),
    activeEnvironment,
    environments,
    proxy,
    managed: Boolean(value?.managed),
  }
}

/**
 * @param {unknown} raw
 * @returns {ProxyRule[]}
 */
export function normalizeProxyRules(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {ProxyRule[]} */
  const rules = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const pathPrefix = String(item.pathPrefix || "").trim()
    if (!pathPrefix.startsWith("/")) continue
    const target =
      typeof item.target === "string" ? item.target.trim() : ""
    rules.push({
      pathPrefix,
      target: target || undefined,
      enabled: item.enabled !== false,
    })
  }
  return rules
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, environments: Record<string, EnvironmentConfig> } | { ok: false, errors: string[] }}
 */
export function normalizeEnvironmentsInput(raw) {
  /** @type {string[]} */
  const errors = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["environments must be an object"] }
  }
  /** @type {Record<string, EnvironmentConfig>} */
  const environments = {}
  for (const [id, envVal] of Object.entries(raw)) {
    const envId = String(id).trim()
    if (!ENV_ID_RE.test(envId)) {
      errors.push(`environment id "${id}" must be lowercase letters/digits/hyphens`)
      continue
    }
    const envObj = envVal && typeof envVal === "object" ? envVal : {}
    const name =
      typeof envObj.name === "string" && envObj.name.trim()
        ? envObj.name.trim()
        : envId
    const proxy = normalizeProxyConfig(envObj.proxy)
    if (proxy.target && !isValidHttpUrl(proxy.target)) {
      errors.push(`environment "${envId}": proxy.target must be http(s) URL`)
    }
    for (const rule of proxy.rules || []) {
      if (rule.target && !isValidHttpUrl(rule.target)) {
        errors.push(
          `environment "${envId}" rule ${rule.pathPrefix}: target must be http(s) URL`,
        )
      }
    }
    environments[envId] = { name, proxy }
  }
  if (Object.keys(environments).length === 0) {
    errors.push("environments must contain at least one environment")
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, environments }
}

/**
 * Keep code projects + console-managed (and any extra config) projects.
 * @param {AppConfig} raw
 * @param {CodeProjectMeta[]} codeProjects
 */
function mergeWithCodeProjects(raw, codeProjects) {
  const usedPorts = new Set([raw.adminPort])
  /** @type {Record<string, RuntimeConfig>} */
  const projects = {}
  let dirty = !existsSync(configPath())

  const codeSlugs = new Set(codeProjects.map((p) => p.slug))

  // 1) Console / config-defined projects (including managed)
  for (const [slug, existing] of Object.entries(raw.projects)) {
    if (codeSlugs.has(slug)) continue
    projects[slug] = {
      ...existing,
      // config-only projects are always managed from console
      managed: true,
    }
    if (existing.enabled) usedPorts.add(existing.port)
  }

  // 2) Code-registered projects
  for (const code of codeProjects) {
    const existing = raw.projects[code.slug]
    if (existing) {
      projects[code.slug] = {
        ...existing,
        managed: false,
        name: existing.name || code.name,
        description:
          existing.description !== undefined ? existing.description : undefined,
      }
      if (existing.enabled) usedPorts.add(existing.port)
      continue
    }

    const port =
      toPort(code.defaultPort, 0) || allocatePort(usedPorts, DEFAULT_PORT_START)
    usedPorts.add(port)
    projects[code.slug] = normalizeRuntimeConfig(
      {
        name: code.name,
        description: "",
        enabled: true,
        port,
        proxy: { enabled: false, target: "", rules: [] },
        managed: false,
      },
      port,
    )
    dirty = true
  }

  // Detect if managed flag / missing code entries need write-back
  for (const slug of Object.keys(projects)) {
    const before = raw.projects[slug]
    const after = projects[slug]
    if (!before) {
      dirty = true
      break
    }
    if (Boolean(before.managed) !== Boolean(after.managed) && codeSlugs.has(slug)) {
      dirty = true
    }
  }

  return { config: { adminPort: raw.adminPort, projects }, dirty }
}

/**
 * @param {Set<number>} usedPorts
 * @param {number} start
 */
export function allocatePort(usedPorts, start = DEFAULT_PORT_START) {
  let port = start
  while (usedPorts.has(port)) port += 1
  return port
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function toPort(value, fallback) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

/**
 * Serialize one project for disk (environments + activeEnvironment).
 * @param {RuntimeConfig} p
 */
function serializeProject(p) {
  /** @type {Record<string, { name: string, proxy: object }>} */
  const environments = {}
  for (const [id, env] of Object.entries(p.environments || {})) {
    environments[id] = {
      name: env.name,
      proxy: {
        enabled: env.proxy.enabled,
        target: env.proxy.target,
        rules: env.proxy.rules?.length ? env.proxy.rules : undefined,
        headers:
          env.proxy.headers && Object.keys(env.proxy.headers).length
            ? env.proxy.headers
            : undefined,
      },
    }
  }

  // Keep top-level proxy as effective mirror for hand-editing convenience
  const effective = resolveEffectiveProxy(p)

  return {
    name: p.name || undefined,
    description: p.description || undefined,
    enabled: p.enabled,
    port: p.port,
    activeEnvironment: p.activeEnvironment,
    environments,
    proxy: {
      enabled: effective.enabled,
      target: effective.target,
      rules: effective.rules?.length ? effective.rules : undefined,
      headers:
        effective.headers && Object.keys(effective.headers).length
          ? effective.headers
          : undefined,
    },
    managed: p.managed ? true : undefined,
  }
}

/**
 * @param {AppConfig} config
 */
export function saveConfig(config) {
  if (!existsSync(configDir())) {
    mkdirSync(configDir(), { recursive: true })
  }

  /** @type {AppConfig} */
  const out = {
    adminPort: config.adminPort,
    projects: {},
  }
  for (const [slug, p] of Object.entries(config.projects)) {
    out.projects[slug] = serializeProject(p)
  }

  const payload = `${JSON.stringify(out, null, 2)}\n`
  writeFileSync(configTmpPath(), payload, "utf8")
  renameSync(configTmpPath(), configPath())
}

/**
 * Apply proxy patch onto a ProxyConfig base.
 * @param {ProxyConfig} base
 * @param {Partial<ProxyConfig> | undefined} patch
 */
function applyProxyPatch(base, patch) {
  if (!patch) {
    return {
      ...base,
      rules: [...(base.rules || [])],
      headers: { ...(base.headers || {}) },
    }
  }
  return {
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : base.enabled,
    target:
      patch.target !== undefined ? String(patch.target).trim() : base.target,
    rules:
      patch.rules !== undefined
        ? normalizeProxyRules(patch.rules)
        : [...(base.rules || [])],
    headers:
      patch.headers !== undefined
        ? normalizeHeaderMap(patch.headers)
        : { ...(base.headers || {}) },
  }
}

/**
 * @param {string} slug
 * @param {object} patch
 * @param {AppConfig} fullConfig
 * @param {string[]} knownSlugs
 */
export function validateProjectPatch(slug, patch, fullConfig, knownSlugs) {
  if (!knownSlugs.includes(slug)) {
    return { ok: false, errors: [`Unknown project: ${slug}`], value: null }
  }

  const current = fullConfig.projects[slug]
  if (!current) {
    return { ok: false, errors: [`No runtime config for project: ${slug}`], value: null }
  }

  /** @type {string[]} */
  const errors = []

  /** @type {Record<string, EnvironmentConfig>} */
  let environments = { ...current.environments }
  // deep-ish copy proxies
  for (const [id, env] of Object.entries(environments)) {
    environments[id] = {
      name: env.name,
      proxy: {
        enabled: env.proxy.enabled,
        target: env.proxy.target,
        rules: [...(env.proxy.rules || [])],
        headers: { ...(env.proxy.headers || {}) },
      },
    }
  }

  if (patch.environments !== undefined) {
    const result = normalizeEnvironmentsInput(patch.environments)
    if (!result.ok) {
      return { ok: false, errors: result.errors, value: null }
    }
    environments = result.environments
  }

  let activeEnvironment =
    patch.activeEnvironment !== undefined
      ? String(patch.activeEnvironment).trim()
      : current.activeEnvironment

  if (!environments[activeEnvironment]) {
    if (patch.activeEnvironment !== undefined) {
      errors.push(`unknown environment: ${activeEnvironment}`)
    } else {
      activeEnvironment = Object.keys(environments)[0]
    }
  }

  // Legacy / convenience: patch.proxy updates the *active* environment proxy
  if (patch.proxy !== undefined && environments[activeEnvironment]) {
    environments[activeEnvironment] = {
      ...environments[activeEnvironment],
      proxy: applyProxyPatch(environments[activeEnvironment].proxy, patch.proxy),
    }
  }

  const proxy = resolveEffectiveProxy({ activeEnvironment, environments })

  /** @type {RuntimeConfig} */
  const next = {
    name:
      patch.name !== undefined
        ? String(patch.name).trim()
        : current.name,
    description:
      patch.description !== undefined
        ? String(patch.description)
        : current.description,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
    port: patch.port !== undefined ? Number(patch.port) : current.port,
    activeEnvironment,
    environments,
    proxy,
    managed: current.managed,
  }

  if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) {
    errors.push("port must be an integer between 1 and 65535")
  }

  const adminPort = resolveAdminPort(fullConfig)
  if (next.port === adminPort) {
    errors.push(`port ${next.port} conflicts with admin port`)
  }

  for (const [otherSlug, other] of Object.entries(fullConfig.projects)) {
    if (otherSlug === slug) continue
    if (other.enabled && next.enabled && other.port === next.port) {
      errors.push(`port ${next.port} conflicts with project "${otherSlug}"`)
    }
  }

  for (const [envId, env] of Object.entries(next.environments)) {
    if (env.proxy.target && !isValidHttpUrl(env.proxy.target)) {
      errors.push(`environment "${envId}": proxy.target must be an absolute http: or https: URL`)
    }
    for (const rule of env.proxy.rules || []) {
      if (rule.target && !isValidHttpUrl(rule.target)) {
        errors.push(`environment "${envId}" rule ${rule.pathPrefix}: target must be http(s) URL`)
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, value: null }
  }

  return { ok: true, errors: [], value: next }
}

/**
 * Validate payload for creating a new console-managed project.
 * @param {unknown} body
 * @param {AppConfig} fullConfig
 * @param {string[]} codeSlugs
 */
export function validateCreateProject(body, fullConfig, codeSlugs) {
  /** @type {string[]} */
  const errors = []
  const raw = body && typeof body === "object" ? body : {}

  const slug = String(raw.slug || "")
    .trim()
    .toLowerCase()
  const name = String(raw.name || "").trim()
  const description = String(raw.description || "").trim()

  if (!slug || !SLUG_RE.test(slug)) {
    errors.push("slug 需为小写字母/数字/连字符，如 my-app")
  }
  if (fullConfig.projects[slug] || codeSlugs.includes(slug)) {
    errors.push(`项目已存在: ${slug}`)
  }
  if (!name) {
    errors.push("name 必填")
  }

  const usedPorts = new Set([resolveAdminPort(fullConfig)])
  for (const p of Object.values(fullConfig.projects)) {
    if (p.enabled) usedPorts.add(p.port)
  }

  let port =
    raw.port !== undefined && raw.port !== null && raw.port !== ""
      ? Number(raw.port)
      : allocatePort(usedPorts, DEFAULT_PORT_START)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("port must be an integer between 1 and 65535")
  } else if (usedPorts.has(port)) {
    errors.push(`port ${port} 已被占用`)
  }

  /** @type {Record<string, EnvironmentConfig>} */
  let environments
  let activeEnvironment = "default"

  if (raw.environments && typeof raw.environments === "object") {
    const envResult = normalizeEnvironmentsInput(raw.environments)
    if (!envResult.ok) {
      errors.push(...envResult.errors)
      environments = {
        default: {
          name: "默认",
          proxy: { enabled: false, target: "", rules: [], headers: {} },
        },
      }
    } else {
      environments = envResult.environments
      const requested =
        typeof raw.activeEnvironment === "string"
          ? raw.activeEnvironment.trim()
          : ""
      activeEnvironment =
        requested && environments[requested]
          ? requested
          : Object.keys(environments)[0]
    }
  } else {
    const proxyEnabled = Boolean(raw.proxy?.enabled)
    const proxyTarget =
      typeof raw.proxy?.target === "string" ? raw.proxy.target.trim() : ""
    if (proxyTarget && !isValidHttpUrl(proxyTarget)) {
      errors.push("proxy.target must be an absolute http: or https: URL")
    }
    environments = {
      default: {
        name: "默认",
        proxy: {
          enabled: proxyEnabled,
          target: proxyTarget,
          rules: normalizeProxyRules(raw.proxy?.rules),
          headers: normalizeHeaderMap(raw.proxy?.headers),
        },
      },
    }
    activeEnvironment = "default"
  }

  if (errors.length) {
    return { ok: false, errors, value: null }
  }

  const proxy = resolveEffectiveProxy({ activeEnvironment, environments })

  /** @type {RuntimeConfig} */
  const value = {
    name,
    description,
    enabled: raw.enabled !== false,
    port,
    activeEnvironment,
    environments,
    proxy,
    managed: true,
  }

  return { ok: true, errors: [], value: { slug, runtime: value } }
}

/**
 * @param {string} value
 */
export function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * @param {boolean} enabled
 * @param {string} target
 */
export function isProxyActive(enabled, target) {
  return Boolean(enabled && target && isValidHttpUrl(target))
}

export { DEFAULT_PORT_START, SLUG_RE, ENV_ID_RE, normalizeHeaderMap, isValidSlug }
