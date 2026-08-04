import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { getConfigRoot } from "../paths.js"
import {
  DEFAULT_ADMIN_PORT,
  DEFAULT_PORT_START,
  allocatePort,
  normalizeAppConfig,
  normalizeRuntimeConfig,
  serializeProject,
  toPort,
} from "./model.js"

function configDir() {
  return getConfigRoot()
}
function configPath() {
  return path.join(getConfigRoot(), "projects.json")
}
function configTmpPath() {
  return path.join(getConfigRoot(), "projects.json.tmp")
}

export function getConfigPath() {
  return configPath()
}

/**
 * @param {import("./model.js").CodeProjectMeta[]} codeProjects
 * @returns {import("./model.js").AppConfig}
 */
export function loadConfig(codeProjects) {
  const raw = readConfigFile()
  const { config, dirty } = mergeWithCodeProjects(raw, codeProjects)

  if (!existsSync(configPath()) || dirty) {
    saveConfig(config)
  }

  return config
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
 * Keep code projects + console-managed (and any extra config) projects.
 * @param {import("./model.js").AppConfig} raw
 * @param {import("./model.js").CodeProjectMeta[]} codeProjects
 */
function mergeWithCodeProjects(raw, codeProjects) {
  const usedPorts = new Set([raw.adminPort])
  /** @type {Record<string, import("./model.js").RuntimeConfig>} */
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
    // Paused projects still reserve ports
    usedPorts.add(existing.port)
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
      usedPorts.add(existing.port)
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
 * @param {import("./model.js").AppConfig} config
 */
export function saveConfig(config) {
  if (!existsSync(configDir())) {
    mkdirSync(configDir(), { recursive: true })
  }

  /** @type {import("./model.js").AppConfig} */
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
