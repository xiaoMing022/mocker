import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  dialog,
  clipboard,
} from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getConfigRoot, setPaths } from "../src/core/paths.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

/** Dev only: match CLI cwd so config/ and public/ resolve from repo root. */
if (!app.isPackaged) {
  process.chdir(rootDir)
}

function configurePathsForElectron() {
  if (app.isPackaged) {
    const userData = app.getPath("userData")
    setPaths({
      configRoot: path.join(userData, "config"),
      packageRoot: app.getAppPath(),
    })
  }
}

/** @type {import('../src/runtime.js').MockRuntime | null} */
let runtime = null
/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {Tray | null} */
let tray = null
let isQuitting = false

const useDevRenderer =
  process.argv.includes("--dev-renderer") ||
  process.env.MOCK_ELECTRON_DEV_RENDERER === "1"

function createTrayIcon() {
  // Minimal 16×16 PNG (solid dark square) — fine for template tray icons.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVQ4T2NkYGD4z0AEYBxVSFQBADL4AQzqyT+RAAAAAElFTkSuQmCC",
    "base64",
  )
  let image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) {
    image = nativeImage.createEmpty()
  } else if (process.platform === "darwin") {
    image = image.resize({ width: 16, height: 16 })
    image.setTemplateImage(true)
  }
  return image
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "打开控制台",
      click: () => {
        showMainWindow()
      },
    },
    {
      label: "在浏览器中打开",
      enabled: Boolean(runtime?.adminUrl),
      click: () => {
        if (runtime?.adminUrl) void shell.openExternal(runtime.adminUrl)
      },
    },
    { type: "separator" },
    {
      label: "复制 Admin 地址",
      enabled: Boolean(runtime?.adminUrl),
      click: () => {
        if (runtime?.adminUrl) clipboard.writeText(runtime.adminUrl)
      },
    },
    {
      label: "打开配置目录",
      click: () => {
        void shell.openPath(getConfigRoot())
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        void quitApp()
      },
    },
  ])
}

function ensureTray() {
  if (tray) return
  tray = new Tray(createTrayIcon())
  if (process.platform === "darwin" && tray.getBounds().width === 0) {
    // Empty icon fallback: show text in menu bar.
    tray.setTitle("Mock")
  }
  tray.setToolTip("Mock Server")
  tray.setContextMenu(buildTrayMenu())
  tray.on("click", () => {
    showMainWindow()
  })
  tray.on("double-click", () => {
    showMainWindow()
  })
}

function refreshTray() {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  if (runtime?.adminUrl) {
    tray.setToolTip(`Mock Server · ${runtime.adminUrl}`)
  }
}

function getRendererUrl() {
  if (useDevRenderer) {
    return process.env.MOCK_ELECTRON_RENDERER_URL || "http://127.0.0.1:5173"
  }
  if (!runtime) throw new Error("runtime not started")
  return runtime.adminUrl
}

async function loadRenderer(win) {
  const url = getRendererUrl()
  const maxAttempts = useDevRenderer ? 30 : 1
  let lastError
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await win.loadURL(url)
      return
    } catch (error) {
      lastError = error
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
  throw lastError || new Error(`Failed to load ${url}`)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Mock Server",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show()
  })

  mainWindow.on("close", (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  void loadRenderer(mainWindow).catch((error) => {
    console.error("[electron] failed to load renderer:", error)
    dialog.showErrorBox(
      "控制台加载失败",
      useDevRenderer
        ? "无法连接 Vite 开发服 (http://127.0.0.1:5173)。请确认已运行 npm run dev:console。"
        : "无法打开控制台。请先执行 npm run build，再运行 npm run electron。",
    )
  })
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function startRuntime() {
  const { startMockRuntime } = await import("../src/runtime.js")
  runtime = await startMockRuntime({
    host: "127.0.0.1",
  })
  refreshTray()
}

async function quitApp() {
  if (isQuitting) return
  isQuitting = true
  try {
    if (runtime) {
      await runtime.stop()
      runtime = null
    }
  } catch (error) {
    console.error("[electron] failed to stop runtime:", error)
  } finally {
    tray?.destroy()
    tray = null
    // Destroy hidden window so app can exit.
    if (mainWindow) {
      mainWindow.destroy()
      mainWindow = null
    }
    app.quit()
  }
}

function installAppMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null)
    return
  }
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: "退出",
          accelerator: "Command+Q",
          click: () => {
            void quitApp()
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        {
          label: "显示控制台",
          click: () => showMainWindow(),
        },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    showMainWindow()
  })

  app
    .whenReady()
    .then(async () => {
      configurePathsForElectron()
      app.setName("Mock Server")
      installAppMenu()
      ensureTray()
      try {
        await startRuntime()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[electron] failed to start mock runtime:", message)
        const cfgHint = app.isPackaged
          ? `\n配置目录: ${path.join(app.getPath("userData"), "config")}`
          : ""
        dialog.showErrorBox(
          "Mock Server 启动失败",
          `${message}\n\n请检查 ADMIN_PORT / 项目端口是否被占用。${cfgHint}`,
        )
        isQuitting = true
        app.quit()
        return
      }
      createMainWindow()

      app.on("activate", () => {
        showMainWindow()
      })
    })
    .catch((error) => {
      console.error(error)
      app.quit()
    })

  app.on("before-quit", (event) => {
    if (isQuitting) return
    // Ensure runtime stops even when quitting via dock.
    event.preventDefault()
    void quitApp()
  })

  app.on("window-all-closed", () => {
    // Keep running in tray on all platforms for mock ports.
  })
}
