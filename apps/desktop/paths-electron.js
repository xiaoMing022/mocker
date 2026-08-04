import path from "node:path"
import { fileURLToPath } from "node:url"
import { setPaths } from "../../server/core/paths.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Repo root (two levels up from apps/desktop). */
export const rootDir = path.resolve(__dirname, "../..")

/** apps/desktop directory (for preload path, etc.). */
export const desktopDir = __dirname

/**
 * Configure process cwd / config paths for the Electron shell.
 * - unpackaged: chdir to repo root so config/ and public/ resolve like CLI
 * - packaged: writable userData/config + seed from extraResources
 * @param {import('electron').App} app
 */
export function configurePathsForElectron(app) {
  if (!app.isPackaged) {
    process.chdir(rootDir)
    return
  }

  const userData = app.getPath("userData")
  setPaths({
    configRoot: path.join(userData, "config"),
    packageRoot: app.getAppPath(),
    seedConfigRoot: path.join(process.resourcesPath, "seed-config"),
  })
}
