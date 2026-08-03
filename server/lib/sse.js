/**
 * Server-Sent Events helpers for mock scenarios.
 */

const MAX_DELAY_MS = 60_000
const PREVIEW_EVENTS = 5
const PREVIEW_DATA_LEN = 200

/**
 * @param {unknown} ms
 * @returns {number}
 */
export function clampDelayMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.floor(n), MAX_DELAY_MS)
}

/**
 * @param {unknown} data
 * @returns {string}
 */
export function stringifySseData(data) {
  if (typeof data === "string") return data
  if (data === undefined) return ""
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

/**
 * Format one SSE event block (including trailing blank line).
 * Multi-line data becomes multiple `data:` lines per the SSE spec.
 *
 * @param {{
 *   event?: string,
 *   data?: unknown,
 *   id?: string,
 *   retry?: number
 * }} evt
 * @returns {string}
 */
export function formatSseEvent(evt) {
  if (!evt || typeof evt !== "object") return "data: \n\n"

  const lines = []
  if (evt.id != null && String(evt.id) !== "") {
    lines.push(`id: ${String(evt.id).replace(/\n/g, "")}`)
  }
  if (evt.event != null && String(evt.event) !== "") {
    lines.push(`event: ${String(evt.event).replace(/\n/g, "")}`)
  }
  if (evt.retry != null && Number.isFinite(Number(evt.retry))) {
    lines.push(`retry: ${Math.floor(Number(evt.retry))}`)
  }

  const dataStr = stringifySseData(evt.data)
  if (dataStr.includes("\n")) {
    for (const part of dataStr.split("\n")) {
      lines.push(`data: ${part}`)
    }
  } else {
    lines.push(`data: ${dataStr}`)
  }

  return `${lines.join("\n")}\n\n`
}

/**
 * @param {{
 *   events?: Array<{ event?: string, data?: unknown, id?: string, retry?: number, delayMs?: number }>,
 *   endWithDone?: boolean
 * }|null|undefined} stream
 * @returns {string}
 */
export function formatSseBody(stream) {
  const events = Array.isArray(stream?.events) ? stream.events : []
  let out = ""
  for (const evt of events) {
    out += formatSseEvent(evt || {})
  }
  if (stream?.endWithDone) {
    out += formatSseEvent({ data: "[DONE]" })
  }
  return out
}

/**
 * @param {{
 *   events?: Array<{ data?: unknown }>,
 *   endWithDone?: boolean,
 *   keepAliveMs?: number
 * }|null|undefined} stream
 */
export function summarizeSseStream(stream) {
  const events = Array.isArray(stream?.events) ? stream.events : []
  const preview = []
  for (let i = 0; i < Math.min(events.length, PREVIEW_EVENTS); i += 1) {
    let s = stringifySseData(events[i]?.data)
    if (s.length > PREVIEW_DATA_LEN) s = `${s.slice(0, PREVIEW_DATA_LEN)}…`
    preview.push(s)
  }
  if (stream?.endWithDone) {
    if (preview.length < PREVIEW_EVENTS) preview.push("[DONE]")
  }
  return {
    mode: "sse",
    eventCount: events.length + (stream?.endWithDone ? 1 : 0),
    endWithDone: Boolean(stream?.endWithDone),
    keepAliveMs: clampDelayMs(stream?.keepAliveMs),
    preview,
  }
}

/**
 * Default SSE response headers (caller may set scenario headers first).
 * @returns {Record<string, string>}
 */
export function defaultSseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  }
}

function wait(ms, signal) {
  const delay = clampDelayMs(ms)
  if (!delay) return Promise.resolve()
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const t = setTimeout(resolve, delay)
    const onAbort = () => {
      clearTimeout(t)
      resolve()
    }
    signal?.addEventListener?.("abort", onAbort, { once: true })
  })
}

/**
 * Write an SSE mock response. Sets res.locals.responseBody summary for logs.
 *
 * @param {import("express").Response} res
 * @param {{
 *   statusCode?: number,
 *   delayMs?: number,
 *   headers?: Record<string, string>,
 *   stream?: {
 *     events?: Array<{ event?: string, data?: unknown, id?: string, retry?: number, delayMs?: number }>,
 *     endWithDone?: boolean,
 *     keepAliveMs?: number
 *   },
 *   signal?: { aborted: boolean, addEventListener?: Function }
 * }} options
 */
export async function sendSse(res, options = {}) {
  const statusCode =
    Number.isInteger(options.statusCode) &&
    options.statusCode >= 100 &&
    options.statusCode <= 599
      ? options.statusCode
      : 200

  const stream = options.stream || { events: [] }
  const events = Array.isArray(stream.events) ? stream.events : []
  const signal = options.signal

  res.locals.responseBody = summarizeSseStream(stream)

  if (res.headersSent) return

  try {
    for (const [key, value] of Object.entries(options.headers || {})) {
      if (value != null) res.setHeader(key, value)
    }
    for (const [key, value] of Object.entries(defaultSseHeaders())) {
      if (!res.getHeader(key)) res.setHeader(key, value)
    }

    res.status(statusCode)
    if (typeof res.flushHeaders === "function") res.flushHeaders()

    await wait(options.delayMs, signal)
    if (signal?.aborted || res.writableEnded || res.destroyed) return

    for (const evt of events) {
      if (signal?.aborted || res.writableEnded || res.destroyed) return
      await wait(evt?.delayMs, signal)
      if (signal?.aborted || res.writableEnded || res.destroyed) return
      res.write(formatSseEvent(evt || {}))
    }

    if (stream.endWithDone) {
      if (signal?.aborted || res.writableEnded || res.destroyed) return
      res.write(formatSseEvent({ data: "[DONE]" }))
    }

    const keepAliveMs = clampDelayMs(stream.keepAliveMs)
    if (keepAliveMs > 0 && !signal?.aborted && !res.writableEnded && !res.destroyed) {
      const started = Date.now()
      const interval = 15_000
      while (Date.now() - started < keepAliveMs) {
        if (signal?.aborted || res.writableEnded || res.destroyed) return
        const remaining = keepAliveMs - (Date.now() - started)
        const slice = Math.min(interval, remaining)
        await wait(slice, signal)
        if (signal?.aborted || res.writableEnded || res.destroyed) return
        if (Date.now() - started < keepAliveMs) {
          res.write(": keepalive\n\n")
        }
      }
    }
  } finally {
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end()
      } catch {
        /* ignore */
      }
    }
  }
}
