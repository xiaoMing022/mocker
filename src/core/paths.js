import path from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
// src/core → package root
const defaultPackageRoot = path.resolve(moduleDir, "../..")

/** @type {{ packageRoot?: string, configRoot?: string, consoleDir?: string }} */
let overrides = {}

/**
 * @param {{ packageRoot?: string, configRoot?: string, consoleDir?: string }} partial
 */
export function setPaths(partial = {}) {
  overrides = { ...overrides, ...partial }
}

/** Clear overrides (unit tests only). */
export function resetPathsForTests() {
  overrides = {}
}

export function getPackageRoot() {
  return overrides.packageRoot
    ? path.resolve(overrides.packageRoot)
    : defaultPackageRoot
}

export function getConfigRoot() {
  if (process.env.MOCK_CONFIG_DIR) {
    return path.resolve(process.env.MOCK_CONFIG_DIR)
  }
  if (overrides.configRoot) {
    return path.resolve(overrides.configRoot)
  }
  return path.join(getPackageRoot(), "config")
}

export function getConsoleDir() {
  if (overrides.consoleDir) {
    return path.resolve(overrides.consoleDir)
  }
  return path.join(getPackageRoot(), "public", "console")
}
