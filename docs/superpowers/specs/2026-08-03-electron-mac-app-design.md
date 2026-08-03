# Electron macOS App Packaging Design

**Date:** 2026-08-03  
**Status:** Implemented  
**Scope:** Make Mock Server a double-clickable macOS app (`.app` / `.dmg`); CLI mode remains primary for developers

## Current state (honest answer)

| Question | Answer |
|----------|--------|
| Can I double-click to run on Mac today? | **Yes** (unsigned L0: first open may need 右键 → 打开) |
| What works today? | `npm run dist:mac` / `dist:dir` → `release/`; also `npm run electron` from source |
| Installer / `.app` bundle? | electron-builder: `Mock Server.app` + `.dmg` + `.zip` (arm64) |
| Config location when packaged? | `~/Library/Application Support/Mock Server/config/` via `app.getPath("userData")` |

### Implementation notes (post-ship)

1. **Packager** — `electron-builder` in `package.json` `build`; scripts `dist:mac` / `dist:dir`.
2. **Config path** — `src/core/paths.js` + packaged `setPaths({ configRoot: userData/config })`.
3. **cwd** — unpackaged only `chdir` to repo; packaged relies on `paths.js`.
4. **Gatekeeper** — unsigned MVP; README documents right-click Open / `xattr` quarantine clear; L2 notarization still follow-on.

## Goal

Ship a **local macOS app** that:

1. Double-click `Mock Server.app` (or open from Applications after DMG install).
2. Starts the same shared runtime (`startMockRuntime`) bound to `127.0.0.1`.
3. Shows the existing React console window; tray quit stops all mock ports.
4. Persists config under Electron **userData** (not inside the app bundle).
5. Leaves `npm start` / `npm run electron` (dev from source) unchanged in behavior for engineers.

**Non-goals (this phase):** auto-update, Windows/Linux installers, App Store, paid cert purchase automation, path-params mock features.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Packager | **electron-builder** | Mature DMG + zip; simple `package.json` `build` key |
| mac targets | `dmg` + `zip` (arm64 + x64 or universal later) | DMG for install UX; zip for CI smoke |
| Signing (MVP) | **Unsigned / ad-hoc local** first; document notarization path | Most teams lack cert day-1; still get a real `.app` |
| Config root (packaged) | `app.getPath('userData')/config` | Writable, per-user, survives app upgrades |
| Config root (CLI / unpackaged Electron) | Repo `./config` (today) | Zero migration for existing workflows |
| Override | `MOCK_CONFIG_DIR` env always wins | Tests + power users |
| Static console | Ship built `public/console/**` inside package | Already how production CLI serves UI |
| Process model | Unchanged: main process imports `src/runtime.js` | No IPC rewrite |
| asar | Default on; only config is outside | Static assets + JS fine read-only |

## Path resolution

Introduce a single module `src/core/paths.js`:

```js
// Conceptual API
export function getPackageRoot()   // where src/, public/ live (asar or repo)
export function getConfigRoot()    // writable config directory
export function getConsoleDir()    // public/console for static serve
export function setPaths(overrides) // called by Electron main before runtime starts
```

**Resolution order for config root:**

1. `process.env.MOCK_CONFIG_DIR` if set  
2. Explicit override from `setPaths({ configRoot })` (Electron packaged → userData)  
3. Default: `<packageRoot>/config`

**Electron main (packaged):**

```js
import { app } from "electron"
import { setPaths } from "../src/core/paths.js"

if (app.isPackaged) {
  setPaths({
    configRoot: path.join(app.getPath("userData"), "config"),
  })
}
// do NOT chdir into asar for config writes
```

**Seed behavior (first launch packaged):**

- If `config/projects.json` missing under userData, create default empty config (`adminPort: 4000`, `projects: {}`).
- Do **not** require shipping a sample project; user creates via console.

## electron-builder sketch

```json
{
  "build": {
    "appId": "dev.mockserver.app",
    "productName": "Mock Server",
    "copyright": "Copyright © Mock Server",
    "directories": { "output": "release" },
    "files": [
      "package.json",
      "electron/**/*",
      "src/**/*",
      "public/console/**/*",
      "!public/console/.gitkeep",
      "node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": ["dmg", "zip"],
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    }
  }
}
```

Scripts:

| Script | Purpose |
|--------|---------|
| `npm run build` | Console SPA (existing) |
| `npm run dist:mac` | `build` + `electron-builder --mac` |
| `npm run electron` | Dev from source (existing) |

## User-facing launch UX

| Mode | How to run |
|------|------------|
| Packaged `.app` | Double-click (unsigned: first time may need 右键 → 打开) |
| DMG | Drag to Applications, then open |
| Dev | `npm run electron` / `electron:dev` |
| Headless service | `npm start` |

Tray / window behavior stays as MVP (hide on close, quit from tray).

## Gatekeeper / codesign levels

| Level | Experience | Requirement |
|-------|------------|-------------|
| **L0 Local unsigned** | `.app` works; first open: right-click → Open or `xattr -dr com.apple.quarantine` | No Apple account |
| **L1 Ad-hoc sign** | Slightly better local trust | `codesign -s -` |
| **L2 Developer ID + notarize** | True double-click for other Macs | Paid Apple Developer Program + CI secrets |

**This plan delivers L0 (+ optional L1). L2 is documented, not blocked.**

## Success criteria

1. `npm run dist:mac` produces `release/mac*/Mock Server.app` and a `.dmg`.
2. Opening the app without Node installed still starts Admin + console window.
3. Creating a project writes under `~/Library/Application Support/Mock Server/config/` (product name may vary by electron-builder `productName`).
4. Second launch reloads the same projects / routes.
5. Quit from tray frees admin + project ports.
6. `npm test` and `npm start` from repo still pass / behave as before.
7. README documents: build DMG, first-open Gatekeeper workaround, config location.

## Risks

| Risk | Mitigation |
|------|------------|
| ESM + electron-builder packaging | Keep `"type": "module"`; test packaged smoke early |
| `http-proxy-middleware` native bits | Pure JS — OK in asar |
| Port in use on second instance | Existing single-instance lock + error dialog |
| userData path differs by productName | Assert once in smoke script; document path |
| Console not built before dist | `dist:mac` depends on `npm run build`; fail if `public/console/index.html` missing |

## Follow-on (out of this plan)

- Path params / response templates (mock engine)
- Log → SSE scenario
- Auto-update
- Windows NSIS / Linux AppImage
- Notarization CI
