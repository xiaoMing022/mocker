import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { getPackageRoot, setPaths } from "../server/core/paths.js"

/**
 * Writable config directory for an installed CLI (no apps/web in the package).
 * Matches the packaged desktop app on macOS.
 * @param {{ platform?: string, home?: string, env?: NodeJS.ProcessEnv }} input
 */
export function userConfigDir({
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
} = {}) {
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Mocker", "config")
  }
  if (platform === "win32") {
    const base = env.APPDATA || path.join(home, "AppData", "Roaming")
    return path.join(base, "Mocker", "config")
  }
  const base = env.XDG_CONFIG_HOME || path.join(home, ".config")
  return path.join(base, "Mocker", "config")
}

/**
 * @param {{
 *   packageRoot: string,
 *   hasWebApp: boolean,
 *   platform?: string,
 *   home?: string,
 *   env?: NodeJS.ProcessEnv
 * }} input
 */
export function resolveCliConfigRoot({
  packageRoot,
  hasWebApp,
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
}) {
  if (env.MOCK_CONFIG_DIR) return path.resolve(env.MOCK_CONFIG_DIR)
  if (hasWebApp) return path.join(packageRoot, "config")
  return userConfigDir({ platform, home, env })
}

/**
 * Repo checkouts keep `config/` in the tree. Installed packages write
 * Application Support and seed from the bundled `config/`.
 */
export function configureCliPaths() {
  if (process.env.MOCK_CONFIG_DIR) return
  const packageRoot = getPackageRoot()
  const hasWebApp = existsSync(path.join(packageRoot, "apps/web/package.json"))
  const configRoot = resolveCliConfigRoot({
    packageRoot,
    hasWebApp,
    env: process.env,
  })
  setPaths({ packageRoot, configRoot })
}
