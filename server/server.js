import { startMockRuntime } from "./runtime.js"

const runtime = await startMockRuntime()

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`)
  try {
    await runtime.stop()
  } finally {
    process.exit(0)
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
