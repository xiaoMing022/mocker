import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs"
import path from "node:path"

import { getConfigRoot, getSeedConfigRoot } from "./paths.js"

/**
 * On first launch (no projects.json under config root), copy bundled seed
 * config (projects.json + per-project routes) into the writable config dir.
 * Never overwrites an existing projects.json.
 *
 * @param {{
 *   seedRoot?: string,
 *   configRoot?: string,
 * }} [options]
 * @returns {{ seeded: boolean, reason: string, from?: string, to?: string }}
 */
export function ensureConfigSeeded(options = {}) {
  const seedRoot = path.resolve(options.seedRoot || getSeedConfigRoot())
  const configRoot = path.resolve(options.configRoot || getConfigRoot())
  const destProjectsJson = path.join(configRoot, "projects.json")

  if (existsSync(destProjectsJson)) {
    return { seeded: false, reason: "projects.json already exists" }
  }

  // Avoid copying seed onto itself (dev: seed == repo config).
  if (path.resolve(seedRoot) === path.resolve(configRoot)) {
    return { seeded: false, reason: "seed root equals config root" }
  }

  const seedProjectsJson = path.join(seedRoot, "projects.json")
  if (!existsSync(seedProjectsJson)) {
    return {
      seeded: false,
      reason: "seed projects.json missing",
      from: seedRoot,
      to: configRoot,
    }
  }

  mkdirSync(configRoot, { recursive: true })
  copyFileSync(seedProjectsJson, destProjectsJson)

  const seedProjectsDir = path.join(seedRoot, "projects")
  if (existsSync(seedProjectsDir) && statSync(seedProjectsDir).isDirectory()) {
    copyDirRecursive(seedProjectsDir, path.join(configRoot, "projects"))
  }

  console.log(`[config] seeded defaults from ${seedRoot} → ${configRoot}`)
  return { seeded: true, reason: "copied", from: seedRoot, to: configRoot }
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const st = statSync(from)
    if (st.isDirectory()) {
      copyDirRecursive(from, to)
    } else if (st.isFile()) {
      mkdirSync(path.dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
  }
}
