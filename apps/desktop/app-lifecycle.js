import { app, Menu } from "electron"

/**
 * Quit / single-instance / app menu helpers for the Electron shell.
 * @param {object} options
 * @param {() => { stop: () => Promise<void> } | null} options.getRuntime
 * @param {(r: null) => void} options.clearRuntime
 * @param {{ destroyMainWindow: () => void, showMainWindow: () => void, hideToTray: () => void }} options.window
 * @param {{ destroyTray: () => void }} options.tray
 */
export function createAppLifecycle({ getRuntime, clearRuntime, window, tray }) {
  let isQuitting = false

  function getIsQuitting() {
    return isQuitting
  }

  function markQuitting() {
    isQuitting = true
  }

  async function quitApp() {
    if (isQuitting) return
    isQuitting = true

    try {
      const runtime = getRuntime()
      if (runtime) {
        await runtime.stop()
        clearRuntime()
      }
    } catch (error) {
      console.error("[electron] failed to stop runtime:", error)
    }

    tray.destroyTray()
    window.destroyMainWindow()

    // exit(0) is more reliable than app.quit() after close preventDefault chains.
    app.exit(0)
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
            label: "退出 Mocker",
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
            click: () => window.showMainWindow(),
          },
          {
            label: "隐藏到后台（保持 Mock）",
            click: () => window.hideToTray(),
          },
          { type: "separator" },
          { role: "front" },
        ],
      },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  /**
   * Request single-instance lock. If another instance holds it, exit this process.
   * @returns {boolean} true if this process owns the lock
   */
  function acquireSingleInstanceLock() {
    const gotLock = app.requestSingleInstanceLock()
    if (!gotLock) {
      app.exit(0)
      return false
    }
    app.on("second-instance", () => {
      window.showMainWindow()
    })
    return true
  }

  function installQuitHandlers() {
    app.on("before-quit", (event) => {
      if (isQuitting) return
      event.preventDefault()
      void quitApp()
    })

    app.on("window-all-closed", () => {
      // quitApp handles process exit; do not leave a zombie tray-only process
      // after the user closed the only window via the red button.
      if (!isQuitting) {
        void quitApp()
      }
    })
  }

  return {
    quitApp,
    installAppMenu,
    acquireSingleInstanceLock,
    installQuitHandlers,
    getIsQuitting,
    markQuitting,
  }
}
