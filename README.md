# Mock Server

本地多项目 Mock 服务：每项目独立端口，控制台配置接口与响应，未命中可转发真实后端。

**所有业务项目（含 TTS Leaderboard）均为配置驱动**，与控制台「新建项目」同一套逻辑；重启后配置仍在。

## 快速开始

```bash
npm install
npm run seed:tts   # 首次或重置 TTS 接口样例（可选）
npm run dev
```

| 入口 | 默认地址 |
|------|----------|
| 控制台 | http://localhost:4000 |
| TTS Leaderboard | http://localhost:4001 |

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:4001
```

## 架构

```text
请求 → 控制台动态接口（当前启用场景）
     → 可选代码 createRouter（默认无）
     → 上游 proxy / 404
```

| 层 | 职责 |
|----|------|
| **config 项目** | 启停、端口、名称、proxy；控制台可新建/关闭/删除 |
| **动态接口** | 一接口多场景；热更新 |
| **fixtures/** | 仅作 seed 样例库，不参与运行时 |
| **proxy** | 未 mock 时转发真实后端 |

### 一接口多场景

同一 `method + path` 一条接口，内含多个响应场景，列表下拉即可切换当前场景。

## 控制台

http://localhost:4000

- **+ 新建项目** / **关闭·开启** / **删除**（managed 项目）
- **概览**：名称、端口、上游
- **接口 Mock**：场景切换、试请求、curl、导入导出
- **请求日志**：source + 场景名

## 配置（持久化）

```text
config/projects.json                 # 全部项目元数据（含 tts-leaderboard）
config/projects/<slug>/routes.json   # 接口与场景
fixtures/tts-leaderboard/            # seed 用样例（npm run seed:tts）
```

```bash
# 从 fixtures 重导 TTS 路由（覆盖 routes.json，并确保项目在 config 中 managed）
npm run seed:tts
```

环境变量：`ADMIN_PORT`、`CORS_ORIGIN`、`MOCK_DELAY_MS`

## 目录

```text
config/
  projects.json
  projects/<slug>/routes.json
fixtures/
  tts-leaderboard/web|admin/*.json
public/console/
scripts/seed-tts-routes.js
src/
  server.js
  admin/
  core/
  lib/http.js
  projects/index.js          # 可选代码注册表（默认空）
```

## TTS Leaderboard

与其它项目一样：`managed: true`，可在控制台关闭/删除/改端口。

| 命令 | 说明 |
|------|------|
| `npm run seed:tts` | 从 `fixtures/tts-leaderboard/` 写入接口场景 |

主要接口：`/api/v1/arena/*`、`/api/v1/leaderboard`、`/api/v1/contact`、`/api/v1/site/contact-info`、`/api/admin/*`。

## 可选：代码扩展

仅当需要自定义 `createRouter` 时，在 `src/projects/index.js` 注册；一般不必。
