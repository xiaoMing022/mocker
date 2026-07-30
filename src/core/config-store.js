import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const configDir = path.join(rootDir, "config")
const configPath = path.join(configDir, "projects.json")
const configTmpPath = path.join(configDir, "projects.json.tmp")

const DEFAULT_ADMIN_PORT = 4000
const DEFAULT_PORT_START = 4001

/**
 * @typedef {{ enabled: boolean, port: number, proxy: { enabled: boolean, target: string } }} RuntimeConfig
 * @typedef {{ adminPort: number, projects: Record<string, RuntimeConfig> }} AppConfig
 * @typedef {{ slug: string, defaultPort?: number }} CodeProjectMeta
 */

export function getConfigPath() {
  return configPath
}

/**
 * @param {CodeProjectMeta[]} codeProjects
 * @returns {AppConfig}
 */
export function loadConfig(codeProjects) {
  const raw = readConfigFile()
  const { config, dirty } = mergeWithCodeProjects(raw, codeProjects)

  if (!existsSync(configPath) || dirty) {
    saveConfig(config)
  }

  return config
}

/**
 * Effective admin listen port: env override does not rewrite the config file.
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

/**
 * @returns {AppConfig}
 */
function readConfigFile() {
  if (!existsSync(configPath)) {
    return {
      adminPort: DEFAULT_ADMIN_PORT,
      projects: {},
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"))
    return normalizeAppConfig(parsed)
  } catch (error) {
    console.warn(
      `[config] Failed to parse ${configPath}: ${error.message}. Using defaults.`,
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
function normalizeRuntimeConfig(value, fallbackPort) {
  const proxySource = value?.proxy && typeof value.proxy === "object" ? value.proxy : {}
  return {
    enabled: value?.enabled !== false,
    port: toPort(value?.port, fallbackPort),
    proxy: {
      enabled: Boolean(proxySource.enabled),
      target: typeof proxySource.target === "string" ? proxySource.target.trim() : "",
    },
  }
}

/**
 * @param {AppConfig} raw
 * @param {CodeProjectMeta[]} codeProjects
 */
function mergeWithCodeProjects(raw, codeProjects) {
  const usedPorts = new Set([raw.adminPort])
  /** @type {Record<string, RuntimeConfig>} */
  const projects = {}
  let dirty = !existsSync(configPath)

  for (const [slug] of Object.entries(raw.projects)) {
    if (!codeProjects.some((p) => p.slug === slug)) {
      console.warn(`[config] Ignoring unknown project slug in config: ${slug}`)
    }
  }

  for (const code of codeProjects) {
    const existing = raw.projects[code.slug]
    if (existing) {
      projects[code.slug] = existing
      if (existing.enabled) usedPorts.add(existing.port)
      continue
    }

    const port =
      toPort(code.defaultPort, 0) ||
      allocatePort(usedPorts, DEFAULT_PORT_START)
    usedPorts.add(port)
    projects[code.slug] = {
      enabled: true,
      port,
      proxy: { enabled: false, target: "" },
    }
    dirty = true
  }

  const adminPort = raw.adminPort
  const next = { adminPort, projects }

  // Detect missing keys that should be persisted for console visibility
  if (Object.keys(projects).length !== Object.keys(raw.projects).filter((s) => projects[s]).length) {
    dirty = true
  }

  return { config: next, dirty }
}

/**
 * @param {Set<number>} usedPorts
 * @param {number} start
 */
function allocatePort(usedPorts, start) {
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
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  const payload = `${JSON.stringify(config, null, 2)}\n`
  writeFileSync(configTmpPath, payload, "utf8")
  renameSync(configTmpPath, configPath)
}

/**
 * @param {string} slug
 * @param {Partial<RuntimeConfig> & { proxy?: Partial<RuntimeConfig["proxy"]> }} patch
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

  /** @type {RuntimeConfig} */
  const next = {
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
    },
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
    if (!other.enabled && !next.enabled) continue
    if (other.enabled && next.enabled && other.port === next.port) {
      errors.push(`port ${next.port} conflicts with project "${otherSlug}"`)
    }
  }

  if (next.proxy.target) {
    if (!isValidHttpUrl(next.proxy.target)) {
      errors.push("proxy.target must be an absolute http: or https: URL")
    }
  } else if (next.proxy.enabled) {
    // allowed: enabled with empty target → runtime treats proxy as off + warning
  }

  if (errors.length > 0) {
    return { ok: false, errors, value: null }
  }

  return { ok: true, errors: [], value: next }
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
