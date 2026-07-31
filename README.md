# Mock Server

本地多项目 Mock 服务：每项目独立端口，控制台配置接口与响应，未命中可转发真实后端。

## 快速开始

```bash
npm install
npm run dev
```

| 入口 | 默认地址 |
|------|----------|
| 控制台 | http://localhost:4000 |
| TTS Leaderboard | http://localhost:4001 |

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:4001
```

## 架构（当前）

```text
请求 → 控制台动态接口（当前启用场景）
     → 代码 createRouter()（可选，默认空）
     → 上游 proxy / 404
```

| 层 | 职责 |
|----|------|
| **动态接口** | 一接口一条；内含多个**响应场景**，可一键切换 |
| **fixtures/** | 离线样例，`npm run seed:tts` 导入 |
| **proxy** | 未 mock 时转发真实后端 |

### 一接口多场景

```json
{
  "method": "POST",
  "path": "/api/v1/arena/vote",
  "enabled": true,
  "activeScenarioId": "...",
  "scenarios": [
    { "name": "成功 A", "statusCode": 200, "response": {} },
    { "name": "成功 B", "statusCode": 200, "response": {} },
    { "name": "非法选择", "statusCode": 400, "response": {} }
  ]
}
```

旧版「每个响应单独一条路由」会在加载时**自动迁移**为场景模型。

## 控制台

http://localhost:4000

- 侧栏切换项目
- **概览**：启用 / 端口 / 上游
- **接口 Mock**
  - 列表内下拉切换当前场景（联调即时生效）
  - 编辑器：多场景 Tab、延迟预设、试请求、复制 curl
  - 搜索、导入 / 导出 JSON
- **请求日志**：source + **场景名**、耗时

## 配置

`config/projects.json` — 项目启停、端口、proxy  
`config/projects/<slug>/routes.json` — 动态接口表  

```bash
# 从 fixtures 重新导入 TTS 接口（覆盖 routes.json）
npm run seed:tts
```

环境变量：`ADMIN_PORT`、`CORS_ORIGIN`、`MOCK_DELAY_MS`

## 目录

```text
config/
  projects.json                 # 运行时项目配置
  projects/<slug>/routes.json   # 动态 mock 表
public/console/                 # 工作台 UI
scripts/
  seed-tts-routes.js            # fixture → routes.json
src/
  server.js                     # 进程入口
  admin/                        # 管理 API + 静态控制台
  core/                         # 配置、项目管理、动态路由、代理、日志
  lib/http.js                   # 响应工具
  projects/
    index.js                    # 代码侧项目注册表
    <slug>/
      index.js                  # meta + createRouter
      fixtures/                 # 可选：seed 用 JSON
```

## 添加 / 关闭项目

### 控制台（推荐）

- 左侧 **+ 新建项目**：填写名称、slug、端口 → 自动创建并启动（纯配置，无需写代码）
- **关闭项目**：停止监听并释放端口（配置保留，可再开启）
- **删除项目**：仅限控制台创建的项目；代码注册项目不可删，只能关闭

### 代码注册（可选，用于复杂 createRouter）

1. `src/projects/<slug>/index.js` 导出 `{ slug, name, description, defaultPort, createRouter }`
2. 在 `src/projects/index.js` 注册
3. 重启后控制台可见

## TTS Leaderboard

| 命令 / 路径 | 说明 |
|-------------|------|
| `npm run seed:tts` | 从 `fixtures/web` + `fixtures/admin` 写入控制台路由 |
| `fixtures/web/*.json` | Web 端响应样例 |
| `fixtures/admin/*.json` | Admin 端响应样例 |

主要接口：`/api/v1/arena/*`、`/api/v1/leaderboard`、`/api/v1/contact`、`/api/v1/site/contact-info`、`/api/admin/*`。  
投票成功 B / 非法选择在控制台为**备用关闭**路由（同 path 同时只能启用一条）。
