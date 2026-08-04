# Mocker

本地多项目 Mock 工作台：每项目独立端口，Web / 桌面双入口配置接口与场景，未命中可按规则转发上游。

仓库：https://github.com/xiaoMing022/mocker

**双入口：**

| 入口 | 说明 | 命令 |
|------|------|------|
| **Web** | 浏览器控制台 + 后台服务 | `npm run dev` / `npm start` |
| **Desktop** | Electron 桌面壳（同一套 runtime） | `npm run desktop` / `npm run dist:mac` |

业务项目均为**配置驱动**，与控制台「新建项目」同一套机制。

---

## 快速开始

```bash
git clone git@github.com:xiaoMing022/mocker.git
cd mocker
npm install          # 根目录 + apps/web 依赖
npm run build        # 构建 Web 控制台 → public/console/
npm run dev          # Web 开发：API :4000 + Vite :5173
```

| 入口 | 地址 / 用法 |
|------|-------------|
| Web 控制台（开发） | http://localhost:5173 |
| Web 控制台（生产） | http://localhost:4000（先 `npm run build`） |
| 桌面端开发 | `npm run dev:desktop`（Vite HMR + Electron） |
| 桌面端 | `npm run desktop` |

仅服务端 + 已构建控制台：

```bash
npm run build && npm start
```

### 桌面端

```bash
npm run desktop          # 构建控制台后启动 Electron
npm run dev:desktop      # 开发：Vite + Electron
npm run dist:dir         # 产出可双击的 .app
npm run dist:mac         # .app + .dmg + .zip
```

**关闭行为：** 点击窗口关闭按钮会**退出应用**并释放全部 Mock 端口。若需后台继续提供 Mock，请用菜单栏 / 托盘中的 **「隐藏窗口（后台保持 Mock）」**。

打包产物在 `release/`（如 `release/mac-arm64/Mocker.app`），该目录已被 gitignore，不会提交。

**首次打开未签名包：** Finder **右键 → 打开**，或：

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Mocker.app"
```

**配置目录：**

| 场景 | 路径 |
|------|------|
| 开发（`npm start` / `npm run desktop` 源码） | 仓库内 `config/` |
| 打包后的 `.app`（可写） | `~/Library/Application Support/Mocker/config/` |
| 打包后的 `.app`（只读种子） | `Contents/Resources/seed-config/`（首次启动拷贝到可写目录） |
| 自定义配置目录 | 环境变量 `MOCK_CONFIG_DIR` |
| 自定义种子目录 | 环境变量 `MOCK_SEED_CONFIG_DIR` |

**首次启动种子：** 若可写配置目录中还没有 `projects.json`，会从种子目录复制默认项目（含 `routes.json`）。**已有配置绝不覆盖**，因此暂停/环境选择等状态会跨重启保留。

环境变量（可选）：`ADMIN_PORT`、`ADMIN_HOST`、`CORS_ORIGIN`、`MOCK_DELAY_MS`、`MOCK_CONFIG_DIR`、`MOCK_SEED_CONFIG_DIR`

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
| 项目 | 新建、暂停/恢复（释放端口）、删除、重载；运行开关写入配置并跨重启保持 |
| 环境 | 项目内多环境（测试/灰度/线上…），共享接口 Mock，切换 active 上游 Proxy |
| 接口 | 一接口多场景；`match` 优先于「当前启用」场景 |
| 响应模式 | 场景级 `mode`: `json`（默认）或 `sse` 流式 |
| 日志 | 请求/响应详情；可保存为场景 |
| Proxy | 默认上游 + 按 `pathPrefix` 的规则列表 |

### 暂停

暂停后**不监听端口**，配置与 `routes.json` 完整保留，随时恢复。`enabled: false` 会写入 `projects.json`，再次启动应用时仍为暂停。

---

## 目录结构

```text
mocker/
├── apps/
│   ├── web/                 # Web 控制台（Vite + React + Ant Design）
│   │   └── src/
│   │       ├── components/  # MethodTag、ProjectStatusTag、KeyValueEditor
│   │       ├── features/    # 按域拆分：shell / overview / routes / logs / projects
│   │       ├── hooks/       # useProjects、useHashRoute
│   │       └── utils/       # 错误提示、状态文案、curl、ids
│   └── desktop/             # 桌面端 Electron 壳（模块化 bootstrap）
│       ├── main.js          # 薄入口：接线 window / tray / lifecycle
│       ├── paths-electron.js
│       ├── window.js
│       ├── tray.js
│       ├── app-lifecycle.js
│       └── preload.cjs
├── server/                  # 后端 runtime + Admin API + Mock 引擎
│   ├── server.js            # CLI / Web 入口
│   ├── runtime.js           # 共享启动（Web + Desktop）
│   ├── admin/               # 管理 API + 静态控制台
│   ├── core/
│   │   ├── util/            # headers / ids / http-error
│   │   ├── config/          # model（归一化校验）+ store（持久化）
│   │   ├── project/         # views 等项目视图构建
│   │   ├── config-seed.js
│   │   ├── project-manager.js
│   │   └── …                # routes、proxy、match、paths
│   └── lib/                 # http / sse 纯工具
├── public/console/          # Web 构建产物（gitignore，由 npm run build 生成）
├── config/                  # 项目元数据与 routes（开发时；打包后作 seed）
├── scripts/
└── package.json             # 根脚本：双入口编排
```

### `server/core` 模块

| 路径 | 职责 |
|------|------|
| `util/headers.js` | `normalizeHeaderMap` / `flattenHeaders`（proxy 与配置共用） |
| `util/ids.js` | `SLUG_RE` / `ENV_ID_RE` 与校验 |
| `util/http-error.js` | `createHttpError(status, message)` 统一 HTTP 错误 |
| `config/model.js` | 配置归一化、多环境、`resolveEffectiveProxy`、校验 |
| `config/store.js` | `projects.json` 读写持久化 |
| `config-store.js` | 对 `config/model` + `config/store` 的 re-export 门面 |
| `config-seed.js` | 首次启动从种子目录拷贝默认配置（不覆盖已有） |
| `project/views.js` | 管理 API 用的项目视图构建 |
| `project-manager.js` | 项目生命周期、路由 CRUD、日志、环境切换 |
| `route-store.js` | `routes.json` 规范化 / 迁移 |
| `paths.js` | 包根路径 / 配置目录 / 种子目录 / 控制台静态目录 |
| `match.js` | 场景匹配、proxy 规则、日志截断 |
| `dynamic-routes.js` | 请求命中 Mock 场景 |
| `proxy.js` | 上游转发回落（含环境/路由级额外 headers） |
| `request-log.js` | 内存请求日志 |
| `create-project-app.js` | 单项目 Express 应用 |

### `apps/desktop` 模块

| 文件 | 职责 |
|------|------|
| `main.js` | 薄 bootstrap：配置路径、接线各控制器、启动 runtime |
| `paths-electron.js` | 开发/打包路径与 `setPaths`（含 seed-config） |
| `window.js` | `BrowserWindow` 创建、显示、关闭策略 |
| `tray.js` | 菜单栏托盘与菜单（隐藏窗口、退出等） |
| `app-lifecycle.js` | 单实例、activate、退出时 `stop()` 释放端口 |
| `preload.cjs` | 预加载桥（如有） |

### `apps/web` 功能分层（简要）

| 区域 | 说明 |
|------|------|
| `features/shell` | 顶栏、侧栏项目列表、工作区布局、主题配置 |
| `features/overview` | 项目信息、多环境面板、Proxy 规则、draft 校验 |
| `features/routes` | 接口列表、场景抽屉、试请求、场景表单 helpers |
| `features/logs` | 请求日志与保存为场景 |
| `features/projects` | 新建项目弹窗 |
| `components/` | 跨页复用：`MethodTag`、`ProjectStatusTag`、`KeyValueEditor` |
| `utils/` | `showError`、项目状态文案、curl、`ENV_ID_RE` |

---

## 控制台功能

- 项目：新建、暂停/恢复、删除、重载、侧栏筛选
- 环境：测试 / 灰度 / 线上等一键切换（共享 routes，仅切换上游）
- 概览：名称/端口/当前环境 proxy/路径规则、运行开关
- 接口 Mock：场景切换、match、requestExample、试请求、curl、导入导出
- **SSE 流式**：场景 `mode: "sse"`，配置 `stream.events[]`
- 请求日志：筛选、详情、curl、保存为场景
- 主题：浅色 / 深色（Web 与桌面共用同一套 UI）

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

本地验证：

```bash
curl -N -X POST 'http://127.0.0.1:<port>/path' \
  -H 'Accept: text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

开发时 API 由 Vite 代理到 `:4000`（见 `apps/web/vite.config.ts`）。

---

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | Web：后端 + 控制台 HMR |
| `npm run dev:server` | 仅 Express |
| `npm run dev:web` | 仅 Vite 控制台 |
| `npm run dev:desktop` | 桌面开发：Vite + Electron |
| `npm run build` | 构建 Web 控制台到 `public/console/` |
| `npm start` | 生产 Web：服务端 + 已构建控制台 |
| `npm run desktop` | 构建后启动 Electron |
| `npm run desktop:only` | 不重建，直接 Electron |
| `npm run dist:dir` | 打包 macOS `.app` |
| `npm run dist:mac` | 打包 `.app` + `.dmg` + `.zip` |

---

## 配置文件

### `config/projects.json`

```json
{
  "adminPort": 4000,
  "projects": {
    "demo": {
      "name": "Demo",
      "description": "",
      "enabled": true,
      "port": 4001,
      "activeEnvironment": "test",
      "environments": {
        "test": {
          "name": "测试",
          "proxy": {
            "enabled": true,
            "target": "https://test.example.com",
            "rules": []
          }
        },
        "gray": {
          "name": "灰度",
          "proxy": {
            "enabled": true,
            "target": "https://gray.example.com"
          }
        },
        "prod": {
          "name": "线上",
          "proxy": {
            "enabled": true,
            "target": "https://api.example.com"
          }
        }
      },
      "managed": true
    }
  }
}
```

- `activeEnvironment`：当前生效的环境 id；接口 Mock（`routes.json`）在环境间共享。
- `environments.*.proxy`：该环境下未命中 Mock 时的上游；控制台可一键切换。
- 旧配置若只有顶层 `proxy`，启动时会自动迁移为 `environments.default`。
- `enabled: false` 表示项目暂停（不监听端口），会持久化。

### `config/projects/<slug>/routes.json`

`version: 2`，每条接口含多 `scenarios`（含可选 `mode` / `stream` / `match`）。

---

## License

[MIT](./LICENSE) © 2026 xiaoMing022
