import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampDelayMs,
  formatSseBody,
  formatSseEvent,
  stringifySseData,
  summarizeSseStream,
} from "../server/lib/sse.js"

describe("clampDelayMs", () => {
  it("clamps negative and over max", () => {
    assert.equal(clampDelayMs(-1), 0)
    assert.equal(clampDelayMs(100), 100)
    assert.equal(clampDelayMs(120_000), 60_000)
    assert.equal(clampDelayMs("nope"), 0)
  })
})

describe("formatSseEvent", () => {
  it("formats string data", () => {
    assert.equal(formatSseEvent({ data: "hello" }), "data: hello\n\n")
  })

  it("stringifies object data", () => {
    assert.equal(
      formatSseEvent({ data: { delta: "你" } }),
      'data: {"delta":"你"}\n\n',
    )
  })

  it("includes event id retry", () => {
    const text = formatSseEvent({
      id: "1",
      event: "message",
      retry: 3000,
      data: "x",
    })
    assert.equal(text, "id: 1\nevent: message\nretry: 3000\ndata: x\n\n")
  })

  it("splits multiline data", () => {
    assert.equal(
      formatSseEvent({ data: "a\nb" }),
      "data: a\ndata: b\n\n",
    )
  })

  it("does not quote [DONE] string", () => {
    assert.equal(formatSseEvent({ data: "[DONE]" }), "data: [DONE]\n\n")
  })
})

describe("formatSseBody", () => {
  it("joins events and optional [DONE]", () => {
    const body = formatSseBody({
      events: [{ data: "a" }, { data: { n: 1 } }],
      endWithDone: true,
    })
    assert.equal(
      body,
      'data: a\n\ndata: {"n":1}\n\ndata: [DONE]\n\n',
    )
  })

  it("allows empty events", () => {
    assert.equal(formatSseBody({ events: [] }), "")
    assert.equal(formatSseBody({ events: [], endWithDone: true }), "data: [DONE]\n\n")
  })
})

describe("summarizeSseStream", () => {
  it("builds preview and counts", () => {
    const s = summarizeSseStream({
      events: [{ data: "one" }, { data: { x: 1 } }],
      endWithDone: true,
    })
    assert.equal(s.mode, "sse")
    assert.equal(s.eventCount, 3)
    assert.equal(s.endWithDone, true)
    assert.deepEqual(s.preview, ["one", '{"x":1}', "[DONE]"])
  })
})

describe("stringifySseData", () => {
  it("passes strings through", () => {
    assert.equal(stringifySseData("[DONE]"), "[DONE]")
  })
})
