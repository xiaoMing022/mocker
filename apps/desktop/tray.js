import { Menu, Tray, nativeImage, shell, clipboard } from "electron"

/**
 * @param {object} options
 * @param {() => { adminUrl?: string } | null} options.getRuntime
 * @param {() => void} options.showMainWindow
 * @param {() => void} options.hideToTray
 * @param {() => void | Promise<void>} options.quitApp
 * @param {() => string} options.getConfigRoot
 */
export function createTrayController({
  getRuntime,
  showMainWindow,
  hideToTray,
  quitApp,
  getConfigRoot,
}) {
  /** @type {Tray | null} */
  let tray = null

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
    const runtime = getRuntime()
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
        label: "隐藏窗口（后台保持 Mock）",
        click: () => hideToTray(),
      },
      {
        label: "退出 Mocker",
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
      tray.setTitle("Mock")
    }
    tray.setToolTip("Mocker")
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
    const runtime = getRuntime()
    if (runtime?.adminUrl) {
      tray.setToolTip(`Mocker · ${runtime.adminUrl}`)
    }
  }

  function destroyTray() {
    try {
      if (tray) {
        tray.destroy()
        tray = null
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ensureTray,
    refreshTray,
    destroyTray,
  }
}
