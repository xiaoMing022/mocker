# Mocker

本地多项目 Mock 服务：每项目独立端口，Web / 桌面双入口配置接口与场景，未命中可按规则转发上游。

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

打包产物在 `release/`（如 `release/mac-arm64/Mock Server.app`），该目录已被 gitignore，不会提交。

**首次打开未签名包：** Finder **右键 → 打开**，或：

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Mock Server.app"
```

**配置目录：**

| 场景 | 路径 |
|------|------|
| 开发（`npm start` / `npm run desktop` 源码） | 仓库内 `config/` |
| 打包后的 `.app` | `~/Library/Application Support/Mock Server/config/` |
| 自定义 | 环境变量 `MOCK_CONFIG_DIR` |

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
| 响应模式 | 场景级 `mode`: `json`（默认）或 `sse` 流式 |
| 日志 | 请求/响应详情；可保存为场景 |
| Proxy | 默认上游 + 按 `pathPrefix` 的规则列表 |

### 暂停

暂停后**不监听端口**，配置与 `routes.json` 完整保留，随时恢复。

---

## 目录结构

```text
mocker/
├── apps/
│   ├── web/                 # Web 控制台（Vite + React + Ant Design）
│   │   └── src/
│   └── desktop/             # 桌面端 Electron 壳
│       ├── main.js
│       └── preload.cjs
├── server/                  # 后端 runtime + Admin API + Mock 引擎
│   ├── server.js            # CLI / Web 入口
│   ├── runtime.js           # 共享启动（Web + Desktop）
│   ├── admin/               # 管理 API + 静态控制台
│   ├── core/                # 路由、日志、proxy、配置、路径
│   └── lib/
├── public/console/          # Web 构建产物（gitignore，由 npm run build 生成）
├── config/                  # 项目元数据与 routes（开发时）
├── scripts/
└── package.json             # 根脚本：双入口编排
```

### `server/core` 模块

| 文件 | 职责 |
|------|------|
| `project-manager.js` | 项目生命周期、路由 CRUD、日志 |
| `config-store.js` | `projects.json` 读写与校验 |
| `route-store.js` | `routes.json` 规范化 / 迁移 |
| `paths.js` | 包根路径 / 配置目录 / 控制台静态目录 |
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
      "proxy": {
        "enabled": false,
        "target": "",
        "rules": []
      },
      "managed": true
    }
  }
}
```

### `config/projects/<slug>/routes.json`

`version: 2`，每条接口含多 `scenarios`（含可选 `mode` / `stream` / `match`）。

---

## License

[MIT](./LICENSE) © 2026 xiaoMing022
