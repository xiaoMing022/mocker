import assert from "node:assert/strict"
import http from "node:http"
import { after, describe, it } from "node:test"

import { startMockRuntime } from "../src/runtime.js"

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
    server.on("error", reject)
  })
}

function request(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        })
      })
      .on("error", reject)
  })
}

describe("startMockRuntime", () => {
  /** @type {Awaited<ReturnType<typeof startMockRuntime>> | null} */
  let runtime = null

  after(async () => {
    if (runtime) await runtime.stop()
  })

  it("starts admin health and stops cleanly", async () => {
    const port = await getFreePort()
    process.env.ADMIN_PORT = String(port)

    runtime = await startMockRuntime({ host: "127.0.0.1" })
    assert.equal(runtime.adminPort, port)
    assert.equal(runtime.adminUrl, `http://127.0.0.1:${port}`)

    const health = await request(`${runtime.adminUrl}/health`)
    assert.equal(health.status, 200)

    await runtime.stop()
    runtime = null

    await assert.rejects(async () => request(`http://127.0.0.1:${port}/health`))
    delete process.env.ADMIN_PORT
  })
})
