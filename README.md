# Mock Server

本地多项目 Mock 服务：每个项目独立端口，未命中的接口可转发到真实后端，并通过 HTML 控制台管理配置。

## 快速开始

```bash
npm install
npm run dev
```

| 入口 | 默认地址 |
|------|----------|
| 控制台 / 管理 API | http://localhost:4000 |
| TTS Leaderboard Mock | http://localhost:4001 |

前端项目示例：

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:4001
```

## 能力

1. **项目级隔离** — 每个业务项目独立 Express 实例与端口  
2. **Mock 优先 + 上游转发** — 已定义路由走本地；未定义且开启 proxy 时原样转发  
3. **可视化配置** — 控制台修改启用状态、端口、上游 URL，写入 `config/projects.json` 并热重载  

## 控制台（Mock 工作台）

打开 http://localhost:4000

B 端工作台能力：

- **多项目侧栏**：切换项目（URL hash：`#/tts-leaderboard/routes`）
- **概览**：启用 / 端口 / 上游转发、状态与错误
- **接口 Mock**：在页面上配置动态路由（method、path、status、delay、JSON 响应）
- **请求日志**：观测 dynamic / code / proxy / miss 命中来源

匹配顺序：**控制台动态路由 → 代码 `routes.js` → 上游代理 / 404**。  
同 method+path 时控制台覆盖代码 mock；删除或禁用动态路由后恢复代码行为。

动态路由落盘：`config/projects/<slug>/routes.json`（保存后热更新，无需整进程重启）。

管理 API：

```bash
curl http://localhost:4000/__mock/projects
curl http://localhost:4000/health

# 项目配置
curl -X PATCH http://localhost:4000/__mock/projects/tts-leaderboard \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"port":4001,"proxy":{"enabled":true,"target":"https://api.example.com"}}'

# 动态路由
curl http://localhost:4000/__mock/projects/tts-leaderboard/routes
curl -X POST http://localhost:4000/__mock/projects/tts-leaderboard/routes \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","path":"/api/demo","statusCode":200,"response":{"ok":true}}'

# 请求日志
curl http://localhost:4000/__mock/projects/tts-leaderboard/logs
```

## 配置文件

`config/projects.json`：

```json
{
  "adminPort": 4000,
  "projects": {
    "tts-leaderboard": {
      "enabled": true,
      "port": 4001,
      "proxy": {
        "enabled": false,
        "target": ""
      }
    }
  }
}
```

- 控制台保存会写回此文件  
- 代码里新增项目且配置中不存在时，启动会合并默认项并写回  

环境变量：

| 变量 | 说明 |
|------|------|
| `ADMIN_PORT` | 覆盖管理端口 |
| `CORS_ORIGIN` | CORS 允许来源，默认 `*` |
| `MOCK_DELAY_MS` | 全局 mock 响应延迟默认值 |

## 目录结构

```text
config/projects.json          # 运行时配置
public/console/               # HTML 控制台
src/
  server.js                   # 启动 Host
  admin/                      # 管理端 API + 静态资源
  core/                       # 配置、项目管理、代理、项目 app 组装
  lib/                        # 共享工具
  projects/<slug>/            # 业务 mock（代码扩展）
```

## 添加新项目

1. 创建 `src/projects/<project-slug>/`  
2. 导出项目元数据与路由，例如：

```js
// src/projects/my-app/index.js
import { createMyAppRouter } from "./routes.js"

export const myAppProject = {
  slug: "my-app",
  name: "My App",
  description: "Mocks for My App",
  defaultPort: 4002,
  createRouter: createMyAppRouter,
}
```

3. 在 `src/projects/index.js` 注册到 `projects` 数组  
4. 重启 `npm run dev`，在控制台确认端口 / 转发配置  

## TTS Leaderboard 接口

在项目端口根路径提供（默认 `4001`）：

- `POST /api/v1/arena/verify`
- `POST /api/v1/arena/battle`
- `POST /api/v1/arena/vote`
- `GET /api/v1/leaderboard`
- `POST /api/v1/contact`
- `GET /api/v1/site/contact-info`
- `GET /api/admin/stats`
- `GET /api/admin/models`
- `GET /api/admin/leaderboard`

## 转发行为

1. 请求先匹配项目内 mock 路由  
2. 未匹配时：  
   - `proxy.enabled` 且 `target` 为合法 `http(s)` URL → 原样转发  
   - 否则 → `404` JSON  

## 设计文档

- 设计：`docs/superpowers/specs/2026-07-30-multi-project-mock-server-design.md`  
- 实现计划：`docs/superpowers/plans/2026-07-30-multi-project-mock-server.md`  
