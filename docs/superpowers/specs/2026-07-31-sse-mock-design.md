# SSE Mock Design (P0)

**Date:** 2026-07-31  
**Status:** Approved  
**Scope:** Scenario-level Server-Sent Events mock; WebRTC deferred

## Goal

Extend the multi-project mock server so a scenario can respond as **SSE** (`text/event-stream`) with a configurable event sequence, while keeping existing JSON scenarios backward-compatible.

## Decisions

| Decision | Choice |
|----------|--------|
| Response mode attachment | **Scenario-level** `mode: "json" \| "sse"` (not route-level) |
| Stream content model | Generic `stream.events[]` (`event` / `data` / `id` / `retry` / `delayMs`) |
| OpenAI-style end | Optional `stream.endWithDone` → final `data: [DONE]` |
| WebRTC | Deferred (no schema fields this release) |
| WebSocket | Future (P2), same “event timeline” mental model |

## Data model

```ts
type ScenarioMode = "json" | "sse"

type SseEvent = {
  event?: string
  data: string | object
  id?: string
  retry?: number
  delayMs?: number  // clamp 0..60000
}

type Scenario = {
  id: string
  name: string
  statusCode: number
  delayMs: number          // wait before first write (both modes)
  response: unknown        // used when mode === "json"
  headers: Record<string, string>
  match: ScenarioMatch | null
  mode?: ScenarioMode      // default "json"
  stream?: {
    events: SseEvent[]
    endWithDone?: boolean
    keepAliveMs?: number   // hold connection after events; optional keepalive comments
  }
}
```

**Normalization rules**

- Missing / invalid `mode` → `"json"`
- `mode === "sse"` without `stream` → `{ events: [], endWithDone: false, keepAliveMs: 0 }`
- Empty `events` is valid (headers then end / keepAlive)
- Object `data` → `JSON.stringify` when writing; string `data` written as-is
- Legacy routes without `mode` unchanged

## Runtime pipeline

```
match route + pickScenario
  → mode === "sse" ? sendSse(...) : sendJson(...)
  → miss → proxy / 404
```

Default SSE headers (do not override scenario-provided keys):

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

Mock debug headers (`X-Mock-Route`, `X-Mock-Scenario`, …) remain.

Client disconnect (`req`/`res` close) aborts remaining timers/writes.

## Logging

- `source: "dynamic"`
- `responseBody` summary only:

```json
{
  "mode": "sse",
  "eventCount": 3,
  "endWithDone": true,
  "preview": ["{\"delta\":\"你\"}", "你好", "[DONE]"]
}
```

Preview caps length (e.g. first 5 events, truncate each string).

## Console

- Scenario form: mode Select (`JSON` | `SSE`)
- SSE: stream events JSON textarea, `endWithDone`, `keepAliveMs`; keep status/delay/headers/match
- Try request: `fetch` + stream reader for SSE; AbortController stop optional (P0: at least full read)
- curl: add `-N` and `Accept: text/event-stream` when active/editing scenario is SSE
- Routes list: small `SSE` tag when active scenario is SSE

## Out of scope (P0)

- WebRTC signaling/media
- WebSocket
- Auto-split fullText into tokens
- OpenAPI import
- Path params / templates

## Success criteria

1. Existing JSON mocks need no config changes
2. SSE scenario streams events with per-event delays via curl `-N` / console try
3. Same path can mix SSE success + JSON error match scenarios
4. Miss still proxies
5. Automated tests cover SSE framing + JSON regression

## Future (documented only)

- P1: event templates, log→SSE scenario, list badges polish
- P2: WebSocket sequences, request variable templates, path params
- Later: WebRTC signaling mock (reuse event timeline idea)
