# AGENTS.md

Mocker: local multi-project mock server. Express 5 backend (plain ESM JS, `server/`), web console (React 19 + Vite + Ant Design TS, `apps/web/`), Electron shell (`apps/desktop/`) sharing the same runtime (`server/runtime.js`). README.md has full architecture/config docs — trust it, it matches the code.

## Commands

- Dev (API :4000 + Vite :5173): `npm run dev`
- `npm test` runs `node --test test/**/*.test.js`. On Node 20 that unquoted glob may not expand; pass files explicitly with `node --test test/*.test.js`. `node --test test/` fails on Node 22 (the directory is loaded as a module).
- Single test: `node --test test/match.test.js`; filter: add `--test-name-pattern="..."`
- Typecheck web: `npx tsc -b` in `apps/web` (also runs inside `npm run build --prefix apps/web`)
- Build console → `public/console/`: `npm run build` (required before `npm start` serves the console, and before `desktop`/`dist:*`)
- No linter/formatter is configured — don't hunt for one. Verification = `npm test` (or `node --test test/*.test.js`) for server changes, `tsc -b` for web changes.

## Package boundaries

- NOT npm workspaces. `apps/web` is a separate package with its own lockfile/node_modules, installed by root `postinstall`. After adding a web dependency: `npm install --prefix apps/web`.
- Root `package.json` `"main"` is the Electron entry (`apps/desktop/main.js`) — don't repurpose it.
- Desktop packaging: `npm run dist:dir` / `dist:mac` (unsigned, arm64, output in gitignored `release/`); `scripts/ensure-console-built.mjs` guards that the console is built first.

## Runtime config (gotchas)

- Dev reads/writes `config/` in the repo — **`config/projects.json` and `config/projects/*/routes.json` are tracked files the running app mutates** (pause state, activeEnvironment, route edits via console). Expect dirty diffs; don't commit app-generated churn.
- Packaged app uses `~/Library/Application Support/Mocker/config/`, seeded once from bundled `config/` (never overwrites). Override dirs: `MOCK_CONFIG_DIR`, `MOCK_SEED_CONFIG_DIR`. Other env vars: `ADMIN_PORT`, `ADMIN_HOST`, `CORS_ORIGIN`, `MOCK_DELAY_MS`.
- Mock request pipeline: dynamic scenario match → optional code router (`server/projects/index.js`, empty by default — prefer config-driven projects) → proxy rules/upstream → 404.
- In web dev, Vite proxies only `/__mock` and `/health` to :4000 (see `apps/web/vite.config.ts`).

## Git traps

- **`test/` and `docs/` are gitignored** — tests are intentionally local-only and never pushed. `git add .` won't stage test changes; use `git add -f` if a test must be committed. Don't delete them thinking they're untracked junk.
- Also ignored: `public/console/*` (build output, `.gitkeep` kept), `release/`, `dist/`.

## Conventions

- Server/tests: plain ESM JavaScript with `node:test`; only `apps/web` is TypeScript.
- Commits: conventional style with optional scope, e.g. `feat(web):`, `refactor(desktop):`, `fix:`.
- Vite 8 declares engines `^20.19 || >=22.12`; this machine's Node v20.14.0 is below that requirement, so check Node first if web dev/build misbehaves.

## Cursor Cloud specific instructions

- Login shells resolve `node` to `/exec-daemon/node` v22.14+, which satisfies Vite 8 and Electron (`>= 22.12`). Do not assume the Node 20.14 note above applies to Cloud Agents.
- Install with frozen lockfiles: `npm ci --ignore-scripts && npm ci --prefix apps/web`. Plain root `npm ci` runs `scripts/postinstall.mjs`, which `npm install`s `apps/web` and rewrites the `name` field in `apps/web/package-lock.json`.
- `npm run dev` binds the admin API to http://127.0.0.1:4000. Vite 8 listens on IPv6 `localhost` (`http://localhost:5173`); `curl http://127.0.0.1:5173` is refused. The sample `demo` project listens on port 4001 (`GET /api/orders`).
- Desktop packaging (`dist:mac` / `dist:dir`) targets unsigned macOS arm64 and is outside the Linux cloud dev loop.
