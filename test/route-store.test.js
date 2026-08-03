import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  normalizeRoute,
  normalizeRouteList,
  validateRoutesPayload,
} from "../server/core/route-store.js"

describe("normalizeRoute scenarios + match", () => {
  it("keeps match and requestExample", () => {
    const route = normalizeRoute({
      method: "POST",
      path: "/api/v1/arena/vote",
      activeScenarioId: "a",
      scenarios: [
        {
          id: "a",
          name: "成功 A",
          statusCode: 200,
          response: { ok: true },
          match: { body: { winner: "A" } },
        },
      ],
      requestExample: {
        headers: { "X-Session-Token": "t" },
        body: { winner: "A" },
      },
    })
    assert.ok(route)
    assert.equal(route.scenarios[0].match.body.winner, "A")
    assert.equal(route.requestExample.body.winner, "A")
    assert.equal(route.scenarios[0].mode, "json")
    assert.equal(route.scenarios[0].stream, null)
  })

  it("normalizes sse mode and stream events", () => {
    const route = normalizeRoute({
      method: "POST",
      path: "/api/chat/stream",
      scenarios: [
        {
          id: "s",
          name: "流式",
          mode: "sse",
          statusCode: 200,
          stream: {
            events: [
              { event: "message", data: { delta: "hi" }, delayMs: 10 },
              { data: "plain" },
            ],
            endWithDone: true,
            keepAliveMs: 100,
          },
        },
      ],
    })
    assert.ok(route)
    const sc = route.scenarios[0]
    assert.equal(sc.mode, "sse")
    assert.equal(sc.stream.events.length, 2)
    assert.equal(sc.stream.events[0].event, "message")
    assert.deepEqual(sc.stream.events[0].data, { delta: "hi" })
    assert.equal(sc.stream.events[0].delayMs, 10)
    assert.equal(sc.stream.endWithDone, true)
    assert.equal(sc.stream.keepAliveMs, 100)
  })

  it("defaults invalid mode to json and empty stream for sse", () => {
    const route = normalizeRoute({
      method: "GET",
      path: "/s",
      scenarios: [
        { name: "a", mode: "nope", response: { a: 1 } },
        { name: "b", mode: "sse" },
      ],
    })
    assert.equal(route.scenarios[0].mode, "json")
    assert.equal(route.scenarios[1].mode, "sse")
    assert.deepEqual(route.scenarios[1].stream.events, [])
    assert.equal(route.scenarios[1].stream.endWithDone, false)
  })
})

describe("legacy migration", () => {
  it("groups same method+path into one route", () => {
    const { routes, migrated } = normalizeRouteList([
      {
        id: "1",
        name: "Vote 成功 A",
        method: "POST",
        path: "/v",
        enabled: true,
        response: { w: "A" },
      },
      {
        id: "2",
        name: "Vote 成功 B",
        method: "POST",
        path: "/v",
        enabled: false,
        response: { w: "B" },
      },
    ])
    assert.equal(migrated, true)
    assert.equal(routes.length, 1)
    assert.equal(routes[0].scenarios.length, 2)
  })
})

describe("validateRoutesPayload", () => {
  it("rejects duplicate method+path", () => {
    const r = validateRoutesPayload([
      {
        method: "GET",
        path: "/a",
        scenarios: [{ name: "d", response: {} }],
      },
      {
        method: "GET",
        path: "/a",
        scenarios: [{ name: "d2", response: {} }],
      },
    ])
    assert.equal(r.ok, false)
  })
})
