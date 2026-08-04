import { app, dialog } from "electron"
import path from "node:path"
import { getConfigRoot } from "../../server/core/paths.js"
import { configurePathsForElectron, desktopDir } from "./paths-electron.js"
import { createWindowController } from "./window.js"
import { createTrayController } from "./tray.js"
import { createAppLifecycle } from "./app-lifecycle.js"

// Unpackaged: chdir to repo root. Packaged: setPaths(userData/config + seed).
// Call early so cwd is correct before runtime starts.
configurePathsForElectron(app)

const useDevRenderer =
  process.argv.includes("--dev-renderer") ||
  process.env.MOCK_ELECTRON_DEV_RENDERER === "1"

/** @type {import('../../server/runtime.js').MockRuntime | null} */
let runtime = null

// Controllers are wired with mutual callbacks; declare holders first.
/** @type {ReturnType<typeof createWindowController>} */
let window
/** @type {ReturnType<typeof createTrayController>} */
let tray
/** @type {ReturnType<typeof createAppLifecycle>} */
let lifecycle

window = createWindowController({
  preloadPath: path.join(desktopDir, "preload.cjs"),
  getRendererUrl: () => {
    if (useDevRenderer) {
      return process.env.MOCK_ELECTRON_RENDERER_URL || "http://127.0.0.1:5173"
    }
    if (!runtime) throw new Error("runtime not started")
    return runtime.adminUrl
  },
  useDevRenderer,
  onCloseRequest: () => lifecycle.quitApp(),
  isQuitting: () => lifecycle.getIsQuitting(),
  packaged: app.isPackaged,
})

tray = createTrayController({
  getRuntime: () => runtime,
  showMainWindow: () => window.showMainWindow(),
  hideToTray: () => window.hideToTray(),
  quitApp: () => lifecycle.quitApp(),
  getConfigRoot,
})

lifecycle = createAppLifecycle({
  getRuntime: () => runtime,
  clearRuntime: () => {
    runtime = null
  },
  window,
  tray,
})

async function startRuntime() {
  const { startMockRuntime } = await import("../../server/runtime.js")
  runtime = await startMockRuntime({
    host: "127.0.0.1",
  })
  tray.refreshTray()
}

if (!lifecycle.acquireSingleInstanceLock()) {
  // Second instance: exit already requested inside acquireSingleInstanceLock.
} else {
  lifecycle.installQuitHandlers()

  app
    .whenReady()
    .then(async () => {
      // Re-apply packaged paths after ready (userData is fully available).
      configurePathsForElectron(app)
      app.setName("Mocker")
      lifecycle.installAppMenu()
      tray.ensureTray()
      try {
        await startRuntime()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[electron] failed to start mock runtime:", message)
        const cfgHint = app.isPackaged
          ? `\n配置目录: ${path.join(app.getPath("userData"), "config")}`
          : ""
        dialog.showErrorBox(
          "Mocker 启动失败",
          `${message}\n\n请检查 ADMIN_PORT / 项目端口是否被占用。${cfgHint}`,
        )
        lifecycle.markQuitting()
        app.exit(1)
        return
      }
      window.createMainWindow()

      app.on("activate", () => {
        if (lifecycle.getIsQuitting()) return
        window.showMainWindow()
      })
    })
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
}
