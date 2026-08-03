# Electron Shell Implementation Plan

**Goal:** Dual-mode desktop shell over shared mock runtime.

## Tasks

- [x] Extract `src/runtime.js` (`startMockRuntime`)
- [x] Thin CLI `src/server.js`
- [x] `electron/main.js` window + tray + single instance
- [x] `electron/preload.cjs` (sandbox-safe)
- [x] package.json scripts + `main` field
- [x] README + design doc
- [x] `test/runtime.test.js`
- [x] Smoke: Electron starts admin `/health`

## Deferred

- [x] electron-builder installers — done (2026-08-03 macOS plan: `dist:mac` / `dist:dir`)
- [x] userData config root for packaged app — done (`src/core/paths.js` + Electron main)
- [ ] Auto-update / codesign (Developer ID + notarization still open)
- [ ] Tray pause-all projects
