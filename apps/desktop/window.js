import { BrowserWindow, shell, dialog } from "electron"

/**
 * @param {object} options
 * @param {string} options.preloadPath
 * @param {() => string} options.getRendererUrl
 * @param {boolean} options.useDevRenderer
 * @param {() => void | Promise<void>} options.onCloseRequest
 * @param {() => boolean} options.isQuitting
 * @param {boolean} options.packaged
 */
export function createWindowController({
  preloadPath,
  getRendererUrl,
  useDevRenderer,
  onCloseRequest,
  isQuitting,
  packaged,
}) {
  /** @type {BrowserWindow | null} */
  let mainWindow = null

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
      width: 1360,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      title: "Mocker",
      backgroundColor: "#0b1220",
      show: false,
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      trafficLightPosition:
        process.platform === "darwin" ? { x: 16, y: 18 } : undefined,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    })

    mainWindow.on("ready-to-show", () => {
      mainWindow?.show()
    })

    // Red close button / window X: quit cleanly (was hide → black blank window).
    // Use tray "隐藏窗口" if you want mock ports to keep running in background.
    mainWindow.on("close", (event) => {
      if (isQuitting()) return
      event.preventDefault()
      void onCloseRequest()
    })

    mainWindow.on("closed", () => {
      mainWindow = null
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: "deny" }
    })

    // Recover from blank/black webContents after OS sleep or crash.
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
      console.error("[electron] renderer gone:", details)
      if (!isQuitting() && mainWindow && !mainWindow.isDestroyed()) {
        void loadRenderer(mainWindow).catch((err) => {
          console.error("[electron] reload after crash failed:", err)
        })
      }
    })

    void loadRenderer(mainWindow).catch((error) => {
      console.error("[electron] failed to load renderer:", error)
      const packagedHint = packaged
        ? "打包应用控制台资源缺失，请重新执行 npm run dist:dir。"
        : "无法打开控制台。请先执行 npm run build，再运行 npm run desktop。"
      dialog.showErrorBox(
        "控制台加载失败",
        useDevRenderer
          ? "无法连接 Vite 开发服 (http://127.0.0.1:5173)。请确认已运行 npm run dev:web。"
          : packagedHint,
      )
    })
  }

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    // If page is blank (black screen), force reload admin UI.
    const url = mainWindow.webContents.getURL()
    if (!url || url === "about:blank") {
      void loadRenderer(mainWindow).catch((err) => {
        console.error("[electron] reload blank window failed:", err)
      })
    }
  }

  function hideToTray() {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.hide()
    if (process.platform === "darwin") {
      // Keep dock icon so user can reopen; mock ports stay up.
    }
  }

  function destroyMainWindow() {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners("close")
        mainWindow.destroy()
      }
    } catch {
      /* ignore */
    }
    mainWindow = null
  }

  return {
    createMainWindow,
    showMainWindow,
    hideToTray,
    destroyMainWindow,
    getMainWindow: () => mainWindow,
  }
}
