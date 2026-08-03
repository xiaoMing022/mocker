import assert from "node:assert/strict"
import http from "node:http"
import { describe, it } from "node:test"

import express from "express"

import { createDynamicRoutesMiddleware } from "../src/core/dynamic-routes.js"

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

function request(port, { method = "GET", path = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        })
      },
    )
    req.on("error", reject)
    if (body != null) req.write(body)
    req.end()
  })
}

describe("SSE dynamic route HTTP", () => {
  it("streams sse events and leaves json intact", async () => {
    const routes = [
      {
        id: "r1",
        name: "stream",
        method: "POST",
        path: "/api/stream",
        enabled: true,
        activeScenarioId: "sse1",
        scenarios: [
          {
            id: "sse1",
            name: "流",
            statusCode: 200,
            delayMs: 0,
            response: {},
            headers: {},
            match: null,
            mode: "sse",
            stream: {
              events: [
                { data: { delta: "A" }, delayMs: 0 },
                { data: { delta: "B" }, delayMs: 0 },
              ],
              endWithDone: true,
              keepAliveMs: 0,
            },
          },
        ],
        note: "",
        requestExample: null,
      },
      {
        id: "r2",
        name: "json",
        method: "GET",
        path: "/api/json",
        enabled: true,
        activeScenarioId: "j1",
        scenarios: [
          {
            id: "j1",
            name: "默认",
            statusCode: 200,
            delayMs: 0,
            response: { ok: true },
            headers: {},
            match: null,
            mode: "json",
            stream: null,
          },
        ],
        note: "",
        requestExample: null,
      },
    ]

    const app = express()
    app.use(express.json())
    app.use(createDynamicRoutesMiddleware({ getRoutes: () => routes }))

    const { server, port } = await listen(app)
    try {
      const sse = await request(port, {
        method: "POST",
        path: "/api/stream",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      assert.equal(sse.status, 200)
      assert.match(String(sse.headers["content-type"] || ""), /text\/event-stream/)
      assert.ok(sse.body.includes('data: {"delta":"A"}'))
      assert.ok(sse.body.includes('data: {"delta":"B"}'))
      assert.ok(sse.body.includes("data: [DONE]"))
      assert.equal(sse.headers["x-mock-route"], "r1")

      const json = await request(port, { path: "/api/json" })
      assert.equal(json.status, 200)
      assert.deepEqual(JSON.parse(json.body), { ok: true })
    } finally {
      await new Promise((r) => server.close(r))
    }
  })
})
