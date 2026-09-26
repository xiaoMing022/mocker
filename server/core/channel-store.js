import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { getConfigRoot } from "./paths.js"

const KINDS = new Set(["websocket", "rtc"])

/**
 * @typedef {{ path: string }} ChannelBind
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: "websocket" | "rtc",
 *   enabled: boolean,
 *   bind: ChannelBind | null,
 *   origin: "spec" | "console"
 * }} Channel
 */

function projectsConfigDir() {
  return path.join(getConfigRoot(), "projects")
}

/**
 * @param {string} slug
 */
export function getChannelsPath(slug) {
  return path.join(projectsConfigDir(), slug, "channels.json")
}

/**
 * @param {string} slug
 * @returns {Channel[]}
 */
export function loadChannels(slug) {
  const filePath = getChannelsPath(slug)
  if (!existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"))
    const list = Array.isArray(parsed?.channels) ? parsed.channels : []
    const result = validateChannelsPayload(list)
    if (result.ok) return result.channels
    console.warn(`[channels:${slug}] skipped invalid channel rows`)
    /** @type {Channel[]} */
    const kept = []
    /** @type {Set<string>} */
    const keys = new Set()
    for (const item of list) {
      const channel = normalizeChannel(item)
      if (!channel) continue
      const key = `${channel.kind}:${channel.name}`
      if (keys.has(key)) continue
      keys.add(key)
      kept.push(channel)
    }
    return kept
  } catch (error) {
    console.warn(`[channels:${slug}] failed to read channels.json: ${error.message}`)
    return []
  }
}

/**
 * @param {string} slug
 * @param {Channel[]} channels
 */
export function saveChannels(slug, channels) {
  const dir = path.join(projectsConfigDir(), slug)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = getChannelsPath(slug)
  const tmpPath = `${filePath}.tmp`
  const payload = `${JSON.stringify({ version: 1, channels }, null, 2)}\n`
  writeFileSync(tmpPath, payload, "utf8")
  renameSync(tmpPath, filePath)
}

/**
 * @param {unknown} input
 * @returns {Channel | null}
 */
export function normalizeChannel(input) {
  if (!input || typeof input !== "object") return null
  const kind = input.kind === "websocket" || input.kind === "rtc" ? input.kind : null
  if (!kind) return null
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name) return null

  let bind = null
  if (input.bind && typeof input.bind === "object" && typeof input.bind.path === "string") {
    const bindPath = input.bind.path.trim()
    if (bindPath.startsWith("/")) bind = { path: bindPath }
  }
  if (kind === "websocket" && !bind) return null

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    name,
    kind,
    enabled: input.enabled !== false,
    bind,
    origin: input.origin === "console" ? "console" : "spec",
  }
}

/**
 * @param {unknown} channelsInput
 * @returns {{ ok: true, channels: Channel[] } | { ok: false, errors: string[] }}
 */
export function validateChannelsPayload(channelsInput) {
  if (!Array.isArray(channelsInput)) {
    return { ok: false, errors: ["channels must be an array"] }
  }
  /** @type {string[]} */
  const errors = []
  /** @type {Channel[]} */
  const channels = []
  /** @type {Set<string>} */
  const keys = new Set()

  for (let i = 0; i < channelsInput.length; i += 1) {
    const channel = normalizeChannel(channelsInput[i])
    if (!channel) {
      errors.push(
        `channels[${i}] is invalid (kind websocket|rtc, name, and a /path for websocket)`,
      )
      continue
    }
    const key = `${channel.kind}:${channel.name}`
    if (keys.has(key)) {
      errors.push(`duplicate channel: ${key}`)
      continue
    }
    keys.add(key)
    channels.push(channel)
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, channels }
}

/**
 * Runtime status is computed. Nothing in this process speaks the protocol yet.
 * @param {Channel} channel
 */
export function toChannelView(channel) {
  return {
    ...channel,
    runtime: "unimplemented",
  }
}

export { KINDS }
