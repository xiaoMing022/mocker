const defaultDelayMs = Number(process.env.MOCK_DELAY_MS ?? 0)

/** JSON response helper used by dynamic routes (and optional code routers). */
export async function sendJson(res, body, status = 200, delayMs = defaultDelayMs) {
  await wait(delayMs)
  res.status(status).json(body)
}

function wait(ms) {
  if (!ms) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
