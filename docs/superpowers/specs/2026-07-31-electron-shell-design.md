# Electron Shell Design (MVP)

**Date:** 2026-07-31  
**Status:** Approved (conversation) / Implementing  
**Scope:** Desktop shell around existing mock-server; CLI/service mode remains primary

## Goal

Ship a minimal Electron wrapper so non-CLI users can open a desktop window for the console while the same Express runtime continues multi-port mock serving.

## Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Dual mode: `npm start` (service) + `npm run electron` (shell) |
| Process model | Electron main process imports shared runtime (same process as Node server) |
| UI | Existing React console via Admin HTTP URL (no IPC rewrite) |
| Close window | Hide to tray; mock ports keep listening |
| Quit | Tray → Quit stops admin + all project ports |
| Config paths | Unchanged (`./config` relative to repo root) for source/MVP |
| Packaging / auto-update / codesign | Deferred |
| WebRTC | Out of scope |

## Components

```text
src/runtime.js          # startMockRuntime() / stop — shared by CLI + Electron
src/server.js           # CLI entry: start + SIGINT/SIGTERM
electron/main.js        # window, tray, lifecycle
electron/preload.js     # thin bridge (version / platform only)
```

## Runtime API

```js
const runtime = await startMockRuntime()
// runtime.adminPort, runtime.adminUrl, runtime.manager
await runtime.stop()
```

## Tray actions (MVP)

- Show console window
- Open in browser
- Quit (stop runtime)

## Success criteria

1. `npm start` behavior unchanged  
2. `npm run electron` opens window on admin console after build  
3. Closing window does not kill mock ports  
4. Quit releases ports cleanly  
5. Existing `npm test` still passes  

## Out of scope (later)

- electron-builder installers  
- userData config migration  
- auto-update  
- pause-all tray action polish  
- deep-link / multi-window  
