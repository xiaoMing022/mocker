import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getByPath,
  pickScenario,
  resolveProxyTarget,
  scenarioMatches,
} from "../src/core/match.js"

describe("getByPath", () => {
  it("reads nested values", () => {
    assert.equal(getByPath({ a: { b: 1 } }, "a.b"), 1)
    assert.equal(getByPath({ a: 1 }, "a.b"), undefined)
  })
})

describe("scenarioMatches", () => {
  it("matches body path fields", () => {
    const ok = scenarioMatches(
      { body: { winner: "A" } },
      { headers: {}, query: {}, body: { winner: "A", battleId: "1" } },
    )
    assert.equal(ok, true)
    const no = scenarioMatches(
      { body: { winner: "A" } },
      { headers: {}, query: {}, body: { winner: "B" } },
    )
    assert.equal(no, false)
  })

  it("matches headers case-insensitively", () => {
    assert.equal(
      scenarioMatches(
        { headers: { "X-Session-Token": "abc" } },
        { headers: { "x-session-token": "abc" }, query: {}, body: {} },
      ),
      true,
    )
  })
})

describe("pickScenario", () => {
  const route = {
    activeScenarioId: "default",
    scenarios: [
      {
        id: "a",
        name: "A",
        match: { body: { winner: "A" } },
        statusCode: 200,
        response: { w: "A" },
      },
      {
        id: "b",
        name: "B",
        match: { body: { winner: "B" } },
        statusCode: 200,
        response: { w: "B" },
      },
      {
        id: "default",
        name: "默认",
        match: null,
        statusCode: 200,
        response: { w: "default" },
      },
    ],
  }

  it("picks conditional over active", () => {
    const s = pickScenario(route, {
      headers: {},
      query: {},
      body: { winner: "B" },
    })
    assert.equal(s.id, "b")
  })

  it("falls back to active when no condition matches", () => {
    const s = pickScenario(route, {
      headers: {},
      query: {},
      body: { winner: "C" },
    })
    assert.equal(s.id, "default")
  })
})

describe("resolveProxyTarget", () => {
  const defaults = { enabled: true, target: "https://default.example" }

  it("uses path-prefix rule target", () => {
    const r = resolveProxyTarget(
      "/api/admin/stats",
      [{ pathPrefix: "/api/admin", target: "https://admin.example", enabled: true }],
      defaults,
    )
    assert.equal(r.target, "https://admin.example")
    assert.equal(r.enabled, true)
  })

  it("disables proxy for matched rule", () => {
    const r = resolveProxyTarget(
      "/api/local/x",
      [{ pathPrefix: "/api/local", enabled: false }],
      defaults,
    )
    assert.equal(r.enabled, false)
  })

  it("falls back to default target", () => {
    const r = resolveProxyTarget("/api/v1/x", [], defaults)
    assert.equal(r.target, "https://default.example")
  })
})
