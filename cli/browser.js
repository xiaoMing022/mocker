import { spawn } from "node:child_process"

/**
 * @param {string} admin
 * @returns {Promise<{ action: "open" | "serve", url: string }>}
 */
export async function resolveStartAction(admin) {
  const url = admin.replace(/\/$/, "")
  try {
    const response = await fetch(`${url}/health`)
    if (response.ok) {
      const body = await response.json().catch(() => ({}))
      if (body?.ok) return { action: "open", url }
    }
  } catch {
    /* not running */
  }
  return { action: "serve", url }
}

/**
 * Open the console in the default browser. Failure is logged, not fatal.
 * @param {string} url
 */
export function openConsole(url) {
  const { command, args } = openCommand(process.platform, url)
  const child = spawn(command, args, { stdio: "ignore", detached: true })
  child.on("error", (error) => {
    console.error(`Could not open the browser: ${error.message}`)
    console.error(url)
  })
  child.unref()
}

/**
 * @param {string} platform
 * @param {string} url
 */
export function openCommand(platform, url) {
  if (platform === "darwin") return { command: "open", args: [url] }
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] }
  return { command: "xdg-open", args: [url] }
}
