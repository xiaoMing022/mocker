# Electron macOS App Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce a double-clickable macOS `Mock Server.app` (and DMG) that runs the existing mock runtime without Node installed, with config persisted under Electron userData.

**Architecture:** Keep dual-mode (CLI + Electron). Extract path resolution into `src/core/paths.js` so config is writable outside asar when packaged. Use electron-builder to bundle `electron/`, `src/`, built `public/console/`, and production `node_modules`. Unsigned local builds first; document Gatekeeper first-open and future notarization.

**Tech Stack:** Electron 43, electron-builder, existing Express runtime, React console build artifacts

**Spec:** `docs/superpowers/specs/2026-08-03-electron-mac-app-design.md`

## Global Constraints

- CLI `npm start` and repo-relative `./config` behavior must remain the default when unpackaged
- Packaged config lives under `app.getPath("userData")/config` unless `MOCK_CONFIG_DIR` is set
- Admin binds `127.0.0.1` in Electron (already the case)
- Do not implement auto-update, Windows/Linux targets, or Apple notarization automation in this plan
- Console must be built (`public/console/index.html` exists) before packaging
- Prefer small, testable pure modules for path resolution

## File map

| File | Responsibility |
|------|----------------|
| `src/core/paths.js` | Package root, config root, console dir; env + `setPaths` overrides |
| `src/core/config-store.js` | Use `getConfigRoot()` instead of hard-coded repo config |
| `src/core/route-store.js` | Use `getConfigRoot()` for `projects/<slug>/routes.json` |
| `src/admin/app.js` | Use `getConsoleDir()` for static SPA |
| `electron/main.js` | Detect packaged; call `setPaths`; avoid unsafe chdir into asar |
| `package.json` | electron-builder `build` config + `dist:mac` script |
| `test/paths.test.js` | Unit tests for path overrides |
| `scripts/smoke-packaged-paths.mjs` | Optional offline check that packaged-style env works |
| `README.md` | How to build DMG, open unsigned app, where config lives |
| `docs/superpowers/specs/2026-08-03-electron-mac-app-design.md` | Design (already written) |

---

### Task 1: Centralize path resolution (`paths.js`)

**Files:**
- Create: `src/core/paths.js`
- Create: `test/paths.test.js`

**Interfaces:**
- Produces:
  - `getPackageRoot(): string`
  - `getConfigRoot(): string`
  - `getConsoleDir(): string`
  - `setPaths(partial: { packageRoot?: string, configRoot?: string, consoleDir?: string }): void`
  - `resetPathsForTests(): void` — clears overrides (test only)

- [x] **Step 1: Write failing tests**

Create `test/paths.test.js`:

```js
import assert from "node:assert/strict"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import {
  getConfigRoot,
  getConsoleDir,
  getPackageRoot,
  resetPathsForTests,
  setPaths,
} from "../src/core/paths.js"

describe("paths", () => {
  afterEach(() => {
    delete process.env.MOCK_CONFIG_DIR
    resetPathsForTests()
  })

  it("defaults package root to repo root (parent of src/)", () => {
    const root = getPackageRoot()
    assert.ok(root.endsWith("mock-server") || root.includes("mock-server"))
    // more stable: package root contains package.json name via paths relative
    assert.equal(path.basename(getConsoleDir()), "console")
    assert.ok(getConsoleDir().endsWith(path.join("public", "console")))
  })

  it("MOCK_CONFIG_DIR overrides config root", () => {
    process.env.MOCK_CONFIG_DIR = "/tmp/mock-cfg-test"
    assert.equal(getConfigRoot(), path.resolve("/tmp/mock-cfg-test"))
  })

  it("setPaths configRoot wins over default but loses to MOCK_CONFIG_DIR", () => {
    setPaths({ configRoot: "/tmp/from-set" })
    assert.equal(getConfigRoot(), path.resolve("/tmp/from-set"))
    process.env.MOCK_CONFIG_DIR = "/tmp/from-env"
    assert.equal(getConfigRoot(), path.resolve("/tmp/from-env"))
  })
})
```

- [x] **Step 2: Run tests — expect FAIL (module missing)**

```bash
node --test test/paths.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `../src/core/paths.js`

- [x] **Step 3: Implement `src/core/paths.js`**

```js
import path from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
// src/core → package root
const defaultPackageRoot = path.resolve(moduleDir, "../..")

/** @type {{ packageRoot?: string, configRoot?: string, consoleDir?: string }} */
let overrides = {}

/**
 * @param {{ packageRoot?: string, configRoot?: string, consoleDir?: string }} partial
 */
export function setPaths(partial = {}) {
  overrides = { ...overrides, ...partial }
}

/** Clear overrides (unit tests only). */
export function resetPathsForTests() {
  overrides = {}
}

export function getPackageRoot() {
  return overrides.packageRoot
    ? path.resolve(overrides.packageRoot)
    : defaultPackageRoot
}

export function getConfigRoot() {
  if (process.env.MOCK_CONFIG_DIR) {
    return path.resolve(process.env.MOCK_CONFIG_DIR)
  }
  if (overrides.configRoot) {
    return path.resolve(overrides.configRoot)
  }
  return path.join(getPackageRoot(), "config")
}

export function getConsoleDir() {
  if (overrides.consoleDir) {
    return path.resolve(overrides.consoleDir)
  }
  return path.join(getPackageRoot(), "public", "console")
}
```

- [x] **Step 4: Run tests — expect PASS**

```bash
node --test test/paths.test.js
```

Expected: all pass

- [x] **Step 5: Commit**

```bash
git add src/core/paths.js test/paths.test.js
git commit -m "feat: centralize package/config/console path resolution"
```

---

### Task 2: Wire config-store, route-store, admin app to `paths.js`

**Files:**
- Modify: `src/core/config-store.js`
- Modify: `src/core/route-store.js`
- Modify: `src/admin/app.js`
- Test: `test/paths.test.js` (extend), existing `test/route-store.test.js`, `npm test`

**Interfaces:**
- Consumes: `getConfigRoot`, `getConsoleDir` from `paths.js`
- Produces: same public APIs as today (`loadConfig`, `saveConfig`, `loadRoutes`, `createAdminApp`)

- [x] **Step 1: Update `config-store.js` path constants**

Remove hard-coded:

```js
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const configDir = path.join(rootDir, "config")
const configPath = path.join(configDir, "projects.json")
const configTmpPath = path.join(configDir, "projects.json.tmp")
```

Replace with getters (call at use-time so overrides apply):

```js
import { getConfigRoot } from "./paths.js"

function configDir() {
  return getConfigRoot()
}
function configPath() {
  return path.join(getConfigRoot(), "projects.json")
}
function configTmpPath() {
  return path.join(getConfigRoot(), "projects.json.tmp")
}
```

Update every use of `configDir` / `configPath` / `configTmpPath` / `rootDir` accordingly.  
`getConfigPath()` should return `configPath()`.

Remove unused `fileURLToPath` import if no longer needed.

- [x] **Step 2: Update `route-store.js`**

Replace:

```js
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const projectsConfigDir = path.join(rootDir, "config", "projects")
```

With:

```js
import { getConfigRoot } from "./paths.js"

function projectsConfigDir() {
  return path.join(getConfigRoot(), "projects")
}

export function getRoutesPath(slug) {
  return path.join(projectsConfigDir(), slug, "routes.json")
}
```

Update `saveRoutes` / any other reference to `projectsConfigDir` to call the function.

- [x] **Step 3: Update `src/admin/app.js`**

Replace hard-coded `consoleDir` / `consoleIndex` with:

```js
import { getConsoleDir } from "../core/paths.js"

// inside createAdminApp / sendConsole:
const consoleDir = getConsoleDir()
const consoleIndex = path.join(consoleDir, "index.html")
```

Ensure `express.static(consoleDir)` uses the same resolved dir.

- [x] **Step 4: Integration check — config override isolation**

Add to `test/paths.test.js` or new `test/config-paths.test.js`:

```js
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import { resetPathsForTests, setPaths } from "../src/core/paths.js"
import { loadConfig, saveConfig, getConfigPath } from "../src/core/config-store.js"
import { saveRoutes, loadRoutes } from "../src/core/route-store.js"

describe("config under overridden root", () => {
  /** @type {string} */
  let tmp

  afterEach(() => {
    resetPathsForTests()
    delete process.env.MOCK_CONFIG_DIR
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("writes projects.json and routes under MOCK_CONFIG_DIR", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mock-cfg-"))
    process.env.MOCK_CONFIG_DIR = tmp

    const config = loadConfig([])
    assert.equal(getConfigPath(), path.join(tmp, "projects.json"))
    assert.ok(fs.existsSync(getConfigPath()))

    saveRoutes("demo", [
      {
        id: "r1",
        name: "ping",
        method: "GET",
        path: "/ping",
        enabled: true,
        activeScenarioId: "s1",
        scenarios: [
          {
            id: "s1",
            name: "ok",
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
    ])
    const routes = loadRoutes("demo")
    assert.equal(routes.length, 1)
    assert.ok(
      fs.existsSync(path.join(tmp, "projects", "demo", "routes.json")),
    )
  })
})
```

Adjust scenario/route shape if `saveRoutes` normalizes differently — match what `normalizeRoute` expects or call through the same helpers used in `route-store.test.js`.

- [x] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all existing tests pass + new path/config tests pass.  
If `runtime.test.js` or others write into real `./config`, leave as-is (default root unchanged).

- [x] **Step 6: Commit**

```bash
git add src/core/config-store.js src/core/route-store.js src/admin/app.js test/
git commit -m "feat: use configurable config/console roots for packaging"
```

---

### Task 3: Electron main — packaged userData config

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.cjs` only if exposing paths (optional; default skip)

**Interfaces:**
- Consumes: `setPaths` from `src/core/paths.js`, `app.isPackaged`, `app.getPath("userData")`
- Produces: Packaged launches write config under userData

- [x] **Step 1: Set paths before importing/starting runtime**

Near top of `electron/main.js` (after imports of electron + path), **before** `startRuntime`:

```js
import { setPaths } from "../src/core/paths.js"

// After app is ready is fine as long as it is BEFORE startMockRuntime.
// Prefer right before startRuntime inside whenReady:

function configurePathsForElectron() {
  if (app.isPackaged) {
    const userData = app.getPath("userData")
    setPaths({
      configRoot: path.join(userData, "config"),
      // package root: resources/app.asar or app directory
      packageRoot: app.getAppPath(),
    })
  }
  // unpackaged: keep default repo ./config
}
```

Call `configurePathsForElectron()` at the start of the `whenReady` handler, **before** `startRuntime()`.

- [x] **Step 2: Fix `chdir` for packaged mode**

Current code:

```js
process.chdir(rootDir)
```

Replace with:

```js
const rootDir = path.resolve(__dirname, "..")
// Only chdir when developing from source (writable repo).
// Packaged app must not rely on cwd for config; paths.js handles it.
if (!app.isPackaged) {
  process.chdir(rootDir)
}
```

Note: `app.isPackaged` is available even before ready.

- [x] **Step 3: Improve first-run error copy**

If runtime fails to start, append config path hint when packaged:

```js
const cfgHint = app.isPackaged
  ? `\n配置目录: ${path.join(app.getPath("userData"), "config")}`
  : ""
dialog.showErrorBox(
  "Mock Server 启动失败",
  `${message}\n\n请检查 ADMIN_PORT / 项目端口是否被占用。${cfgHint}`,
)
```

- [x] **Step 4: Manual smoke from source (unpackaged)**

```bash
npm run build
npm run electron:only
```

Expected:
- Window opens console
- Create a project in UI → files under repo `config/`
- Tray quit frees ports

- [x] **Step 5: Commit**

```bash
git add electron/main.js
git commit -m "feat(electron): use userData config when packaged"
```

---

### Task 4: electron-builder + `dist:mac` script

**Files:**
- Modify: `package.json`
- Create: `build/entitlements.mac.plist` (minimal hardened runtime entitlements if builder requires)
- Create: `scripts/ensure-console-built.mjs` (fail fast if console missing)
- Modify: `.gitignore` — ignore `release/`

**Interfaces:**
- Produces: `npm run dist:mac` → `release/` artifacts

- [x] **Step 1: Install electron-builder as devDependency**

```bash
npm install -D electron-builder
```

- [x] **Step 2: Add ensure script**

Create `scripts/ensure-console-built.mjs`:

```js
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const index = path.join(root, "public", "console", "index.html")
if (!existsSync(index)) {
  console.error(
    "[dist] missing public/console/index.html — run: npm run build",
  )
  process.exit(1)
}
console.log("[dist] console build present:", index)
```

- [x] **Step 3: Extend `package.json`**

Add scripts:

```json
{
  "scripts": {
    "dist:mac": "npm run build && node scripts/ensure-console-built.mjs && electron-builder --mac",
    "dist:dir": "npm run build && node scripts/ensure-console-built.mjs && electron-builder --mac --dir"
  },
  "build": {
    "appId": "dev.mockserver.app",
    "productName": "Mock Server",
    "copyright": "Copyright © Mock Server contributors",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "package.json",
      "electron/**/*",
      "src/**/*",
      "public/console/**/*",
      "!**/*.map",
      "!console/**/*",
      "!test/**/*",
      "!docs/**/*",
      "!config/**/*"
    ],
    "asar": true,
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": [
        { "target": "dmg", "arch": ["arm64"] },
        { "target": "zip", "arch": ["arm64"] }
      ],
      "identity": null,
      "hardenedRuntime": false,
      "gatekeeperAssess": false
    }
  }
}
```

Notes for implementer:
- On Intel Mac, change `arch` to `["x64"]` or `["universal"]` if needed.
- `"identity": null` forces unsigned build (avoids looking for a cert).
- Excluding `config/**/*` from the bundle is intentional — packaged app uses userData; do not ship developer’s local routes into the app.

- [x] **Step 4: `.gitignore`**

Add:

```
release/
dist/
*.dmg
```

- [x] **Step 5: Minimal `build/` placeholder**

Optional empty `build/.gitkeep` for buildResources. Skip custom icon in MVP (Electron default icon OK).

- [x] **Step 6: Run directory package first (faster than DMG)**

```bash
npm run dist:dir
```

Expected:
- Completes without error
- Produces something like `release/mac-arm64/Mock Server.app` (exact folder name depends on electron-builder version/arch)

- [x] **Step 7: Smoke-launch the packaged app from CLI**

```bash
# Adjust path to match dist output:
open "release/mac-arm64/Mock Server.app"
# or:
"release/mac-arm64/Mock Server.app/Contents/MacOS/Mock Server"
```

Expected:
- App starts; window shows console
- `~/Library/Application Support/Mock Server/config/` appears after first write (productName may be "Mock Server")
- Creating a project persists after quit + relaunch
- Single instance lock still works

If app is killed by Gatekeeper when opened via Finder, from Terminal:

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Mock Server.app"
open "release/mac-arm64/Mock Server.app"
```

- [x] **Step 8: Build DMG**

```bash
npm run dist:mac
```

Expected: `.dmg` under `release/`

- [x] **Step 9: Commit**

```bash
git add package.json package-lock.json scripts/ensure-console-built.mjs .gitignore build/
git commit -m "feat: package macOS app with electron-builder"
```

Do **not** commit `release/` binaries.

---

### Task 5: README + design status + smoke checklist

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-03-electron-mac-app-design.md` (status → Approved/Implemented)
- Modify: `docs/superpowers/plans/2026-07-31-electron-shell.md` (mark packaging items done when finished)

- [x] **Step 1: README section (Chinese, match existing tone)**

Add under 快速开始 / 桌面应用:

```markdown
### 打包 macOS 应用（可双击）

```bash
npm run dist:mac
```

产物在 `release/`：

- `Mock Server.app` — 可拖到「应用程序」
- `.dmg` — 分发给同事

**首次打开（未签名构建）：**

若提示「无法验证开发者」，在 Finder 中 **右键 → 打开**，或：

```bash
xattr -dr com.apple.quarantine "/Applications/Mock Server.app"
```

**配置目录（打包后）：**

`~/Library/Application Support/Mock Server/config/`

（开发时仍使用仓库内 `config/`。）

需要正式分发且免 Gatekeeper 警告时，使用 Apple Developer ID 签名并公证（见设计文档 L2）。
```

- [x] **Step 2: Document arch note**

If team has both Apple Silicon and Intel, note how to set `mac.target.arch` to `["arm64","x64"]` or universal (slower build).

- [x] **Step 3: Final verification checklist**

Run and tick mentally:

| Check | Command / action |
|-------|------------------|
| Unit tests | `npm test` |
| CLI still works | `npm start` → health on :4000, config in repo |
| Dev Electron | `npm run electron:only` |
| Packaged app | open `.app` from `release/` |
| Config isolation | packaged writes only under userData |
| Quit | tray 退出 → ports free (`lsof -i :4000`) |

- [x] **Step 4: Commit**

```bash
git add README.md docs/
git commit -m "docs: macOS packaged app build and first-open notes"
```

---

### Task 6 (optional stretch): Tray show config path + Open config folder

**Files:**
- Modify: `electron/main.js`

Only if Tasks 1–5 are green and time remains.

- [ ] Add tray item「打开配置目录」:

```js
{
  label: "打开配置目录",
  click: () => {
    const { getConfigRoot } = require? // ESM:
    // import at top: getConfigRoot from paths
    void shell.openPath(getConfigRoot())
  },
}
```

Use static `import { getConfigRoot } from "../src/core/paths.js"` at top of main (after path setup is fine; getConfigRoot reads current overrides).

- [ ] Commit: `feat(electron): tray action to open config folder`

---

## Roadmap context (not this plan)

After the `.app` ships, suggested order for mock-engine work:

1. Path params / wildcard route matching  
2. Response + SSE templates (`{{params.id}}`, `{{uuid}}`)  
3. Log → SSE scenario  
4. Match operators / OpenAPI import  
5. Notarization CI (L2) if distributing outside the team

---

## Self-review

| Spec requirement | Task |
|------------------|------|
| Double-click `.app` / DMG | Task 4–5 |
| userData config when packaged | Task 1–3 |
| CLI `./config` unchanged | Task 1–2 defaults |
| `MOCK_CONFIG_DIR` override | Task 1 |
| Ship built console | Task 4 ensure script |
| Unsigned first; document Gatekeeper | Task 5 |
| No auto-update / Win-Linux | Out of scope (documented) |
| Tests for path/config | Task 1–2 |

**Placeholder scan:** none intentional.  
**Type consistency:** `setPaths` / `getConfigRoot` names stable across tasks.
