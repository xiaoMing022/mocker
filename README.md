# Mock Server

本地多项目 Mock 服务：每项目独立端口，控制台配置接口与场景，未命中可按规则转发上游。

控制台前端：**React + Vite + Ant Design**（源码 `console/`，构建到 `public/console/`）。

业务项目均为**配置驱动**，与控制台「新建项目」同一套机制。

---

## 快速开始

```bash
npm install          # 安装根目录 + console 依赖
npm run build        # 构建控制台（npm start 需要）
npm run dev          # 开发：API :4000 + 控制台 Vite :5173
```

| 入口 | 地址 |
|------|------|
| 控制台（开发） | http://localhost:5173 |
| 控制台（生产） | http://localhost:4000（需先 `npm run build`） |
| 桌面壳 Electron | `npm run electron`（内嵌同一套 runtime） |

仅后端 + 已构建控制台：

```bash
npm run build && npm start
```

桌面应用（窗口 + 托盘，关窗不杀 Mock 端口）：

```bash
npm run electron          # 构建控制台后启动
npm run electron:dev      # Vite HMR + Electron（开发）
```

### 打包 macOS 应用（可双击）

```bash
npm run dist:mac          # 控制台构建 + .app / .dmg / .zip
npm run dist:dir          # 仅产出 .app（更快，便于本地冒烟）
```

产物在 `release/`：

- `Mock Server.app`（如 `release/mac-arm64/Mock Server.app`）— 可拖到「应用程序」
- `.dmg` — 分发给同事
- `.zip` — 便于 CI / 归档

**架构说明：** 当前 `package.json` 的 `build.mac.target` 仅构建 **arm64**（Apple Silicon）。Intel Mac 需将 arch 改为 `["x64"]`，或使用 `["arm64","x64"]` / universal（构建更慢）。

**首次打开（未签名构建）：**

若提示「无法验证开发者」，在 Finder 中 **右键 → 打开**，或：

```bash
xattr -dr com.apple.quarantine "/Applications/Mock Server.app"
# 或本地产物：
xattr -dr com.apple.quarantine "release/mac-arm64/Mock Server.app"
```

**配置目录（打包后）：**

`~/Library/Application Support/Mock Server/config/`

（开发时仍使用仓库内 `config/`。也可用环境变量 `MOCK_CONFIG_DIR` 覆盖。）

需要正式分发且免 Gatekeeper 警告时，使用 Apple Developer ID 签名并公证（见设计文档 L2：`docs/superpowers/specs/2026-08-03-electron-mac-app-design.md`）。

环境变量（可选）：`ADMIN_PORT`、`ADMIN_HOST`、`CORS_ORIGIN`、`MOCK_DELAY_MS`、`MOCK_CONFIG_DIR`

---

## 架构

```text
HTTP 请求
  → 动态 Mock 路由（场景 / match 条件）
  → 可选代码 Router（默认无）
  → 路径 proxy 规则 / 默认上游
  → 404 miss
```

| 能力 | 说明 |
|------|------|
| 项目 | 新建、暂停/恢复（释放端口）、删除、重载 |
| 接口 | 一接口多场景；`match` 优先于「当前启用」场景 |
| 响应模式 | 场景级 `mode`: `json`（默认）或 `sse` 流式（`stream.events`） |
| 日志 | 请求/响应详情；SSE 仅存摘要；可保存为场景 |
| Proxy | 默认上游 + 按 `pathPrefix` 的规则列表 |

### 暂停

暂停后**不监听端口**，配置与 `routes.json` 完整保留，随时恢复。

---

## 目录结构

```text
mock-server/
├── console/                 # 控制台前端（Vite React）
│   └── src/
│       ├── api/             # Admin API 客户端
│       ├── features/        # overview / routes / logs / projects
│       ├── hooks/
│       └── utils/
├── electron/                # 桌面壳（窗口 + 托盘）
│   ├── main.js
│   └── preload.cjs
├── public/console/          # 构建产物（gitignore，由 npm run build 生成）
├── config/
│   ├── projects.json        # 项目元数据（端口、proxy、启停）
│   └── projects/<slug>/
│       └── routes.json      # 接口与场景
├── src/
│   ├── runtime.js           # 共享启动（CLI + Electron）
│   ├── server.js            # CLI 入口
│   ├── admin/               # 管理 API + 静态控制台
│   ├── core/                # 路由、日志、proxy、配置
│   ├── lib/                 # 小工具
│   └── projects/            # 可选代码注册项目（默认空）
└── test/                    # 后端单测
```

### `src/core` 模块

| 文件 | 职责 |
|------|------|
| `project-manager.js` | 项目生命周期、路由 CRUD、日志 |
| `config-store.js` | `projects.json` 读写与校验 |
| `route-store.js` | `routes.json` 规范化 / 迁移 |
| `match.js` | 场景匹配、proxy 规则、日志截断 |
| `dynamic-routes.js` | 请求命中 Mock 场景 |
| `proxy.js` | 上游转发回落 |
| `request-log.js` | 内存请求日志 |
| `create-project-app.js` | 单项目 Express 应用 |

---

## 控制台功能

- 项目：新建、暂停/恢复、删除、重载、侧栏筛选
- 概览：名称/端口/proxy/路径规则、运行开关
- 接口 Mock：场景切换、match、requestExample、试请求、curl、导入导出
- **SSE 流式**：场景 `mode: "sse"`，配置 `stream.events[]`（`event` / `data` / `id` / `retry` / `delayMs`）、`endWithDone`、`keepAliveMs`；试请求按流读取；curl 使用 `-N`
- 请求日志：筛选、详情、curl、保存为场景
- 主题：浅色 / 深色

### SSE 场景示例（`routes.json`）

```json
{
  "name": "聊天流",
  "mode": "sse",
  "statusCode": 200,
  "delayMs": 0,
  "stream": {
    "events": [
      { "data": { "delta": "你" }, "delayMs": 50 },
      { "data": { "delta": "好" }, "delayMs": 50 }
    ],
    "endWithDone": true,
    "keepAliveMs": 0
  },
  "headers": {},
  "match": null
}
```

本地验证：`curl -N -X POST 'http://127.0.0.1:<port>/path' -H 'Accept: text/event-stream' -H 'Content-Type: application/json' -d '{}'`

开发时 API 由 Vite 代理到 `:4000`（见 `console/vite.config.ts`）。

---

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 后端 + 控制台 HMR |
| `npm run dev:server` | 仅 Express |
| `npm run dev:console` | 仅 Vite |
| `npm run build` | 构建控制台 → `public/console` |
| `npm start` | 启动后端并托管已构建控制台 |
| `npm run electron` | 构建 + 打开桌面壳 |
| `npm run electron:dev` | 控制台 HMR + Electron |
| `npm run electron:only` | 不构建，直接开 Electron（需已 build） |
| `npm run dist:mac` | 打包 macOS `.app` + `.dmg` + `.zip` → `release/` |
| `npm run dist:dir` | 仅打包 `.app`（更快） |
| `npm test` | 后端测试 |

### Electron 行为

- 与 `npm start` 共用 `src/runtime.js`（多项目端口 + Admin API）
- 关闭窗口 → **隐藏到托盘**，Mock 继续监听
- 托盘：打开控制台 / 浏览器打开 / 复制地址 / 退出（释放端口）
- 单实例：再次启动会聚焦已有窗口
- **打包应用**：`npm run dist:mac` / `dist:dir`（见上文「打包 macOS 应用」）
- 自动更新 / Developer ID 公证尚未做

---

## 配置文件

```text
config/projects.json
config/projects/<slug>/routes.json
```

在控制台新建项目并配置接口即可；可选在 `src/projects/index.js` 注册需要自定义 `createRouter()` 的代码项目。

---

## Admin API（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET/POST | `/__mock/projects` | 列表 / 新建 |
| PATCH | `/__mock/projects/:slug` | 更新配置 |
| POST | `.../pause` · `.../resume` · `.../reload` | 暂停 / 恢复 / 重载 |
| DELETE | `/__mock/projects/:slug` | 删除 managed 项目 |
| GET/PUT/POST | `.../routes` | 路由读写 |
| GET | `.../logs` · `.../logs/:id` | 请求日志 |
| POST | `.../logs/:id/to-scenario` | 日志转场景 |
