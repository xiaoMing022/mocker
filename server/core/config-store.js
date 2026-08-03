import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { getConfigRoot } from "./paths.js"

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
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * @typedef {{ pathPrefix: string, target?: string, enabled?: boolean }} ProxyRule
 * @typedef {{
 *   name?: string,
 *   description?: string,
 *   enabled: boolean,
 *   port: number,
 *   proxy: { enabled: boolean, target: string, rules: ProxyRule[] },
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
 * @param {unknown} value
 * @param {number} fallbackPort
 * @returns {RuntimeConfig}
 */
export function normalizeRuntimeConfig(value, fallbackPort) {
  const proxySource = value?.proxy && typeof value.proxy === "object" ? value.proxy : {}
  return {
    name: typeof value?.name === "string" ? value.name.trim() : undefined,
    description: typeof value?.description === "string" ? value.description : undefined,
    enabled: value?.enabled !== false,
    port: toPort(value?.port, fallbackPort),
    proxy: {
      enabled: Boolean(proxySource.enabled),
      target: typeof proxySource.target === "string" ? proxySource.target.trim() : "",
      rules: normalizeProxyRules(proxySource.rules),
    },
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
    projects[code.slug] = {
      name: code.name,
      description: "",
      enabled: true,
      port,
      proxy: { enabled: false, target: "", rules: [] },
      managed: false,
    }
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
 * @param {AppConfig} config
 */
export function saveConfig(config) {
  if (!existsSync(configDir())) {
    mkdirSync(configDir(), { recursive: true })
  }

  // Persist a clean shape
  /** @type {AppConfig} */
  const out = {
    adminPort: config.adminPort,
    projects: {},
  }
  for (const [slug, p] of Object.entries(config.projects)) {
    out.projects[slug] = {
      name: p.name || undefined,
      description: p.description || undefined,
      enabled: p.enabled,
      port: p.port,
      proxy: {
        enabled: p.proxy.enabled,
        target: p.proxy.target,
        rules: p.proxy.rules?.length ? p.proxy.rules : undefined,
      },
      managed: p.managed ? true : undefined,
    }
  }

  const payload = `${JSON.stringify(out, null, 2)}\n`
  writeFileSync(configTmpPath(), payload, "utf8")
  renameSync(configTmpPath(), configPath())
}

/**
 * @param {string} slug
 * @param {Partial<RuntimeConfig> & { proxy?: Partial<RuntimeConfig["proxy"]>, name?: string, description?: string }} patch
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

  const nextRules =
    patch.proxy?.rules !== undefined
      ? normalizeProxyRules(patch.proxy.rules)
      : current.proxy.rules || []

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
    proxy: {
      enabled:
        patch.proxy?.enabled !== undefined
          ? Boolean(patch.proxy.enabled)
          : current.proxy.enabled,
      target:
        patch.proxy?.target !== undefined
          ? String(patch.proxy.target).trim()
          : current.proxy.target,
      rules: nextRules,
    },
    managed: current.managed,
  }

  /** @type {string[]} */
  const errors = []

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

  if (next.proxy.target && !isValidHttpUrl(next.proxy.target)) {
    errors.push("proxy.target must be an absolute http: or https: URL")
  }

  for (const rule of next.proxy.rules || []) {
    if (rule.target && !isValidHttpUrl(rule.target)) {
      errors.push(`proxy rule ${rule.pathPrefix}: target must be http(s) URL`)
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

  const proxyEnabled = Boolean(raw.proxy?.enabled)
  const proxyTarget =
    typeof raw.proxy?.target === "string" ? raw.proxy.target.trim() : ""
  if (proxyTarget && !isValidHttpUrl(proxyTarget)) {
    errors.push("proxy.target must be an absolute http: or https: URL")
  }

  if (errors.length) {
    return { ok: false, errors, value: null }
  }

  /** @type {RuntimeConfig} */
  const value = {
    name,
    description,
    enabled: raw.enabled !== false,
    port,
    proxy: {
      enabled: proxyEnabled,
      target: proxyTarget,
      rules: normalizeProxyRules(raw.proxy?.rules),
    },
    managed: true,
  }

  return { ok: true, errors: [], value: { slug, runtime: value } }
}

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug)
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
 * @param {string} target
 * @param {boolean} enabled
 */
export function isProxyActive(enabled, target) {
  return Boolean(enabled && target && isValidHttpUrl(target))
}

export { DEFAULT_PORT_START, SLUG_RE }
