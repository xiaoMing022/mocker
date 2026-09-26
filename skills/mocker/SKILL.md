---
name: mocker
version: 0.4.0
description: >
  Connect a user's frontend HTTP calls to the local Mocker server.
  Use when the user wants to mock APIs, point a frontend at a mock,
  write mocker.json, or run mocker apply, capture, or check.
metadata:
  requires:
    bins: ["mocker"]
  cliHelp: "mocker --help;mocker schema"
---

# mocker

通过 `mocker` 命令操作本机 mock。先确认 `mocker` 在 PATH 上。数据命令的 JSON 在 stdout，失败 JSON 在 stderr，退出码非 0。本文件用 `mocker skills read mocker` 读取。

优先：`mocker status`，然后 `mocker schema` 看文档形状，再 `apply` / `logs` / `capture` / `check`。你负责读用户前端里的请求；不要直接改 Mocker 的配置目录，也不要写框架专用扫描器。

# 把前端请求接到 Mocker

## 步骤

1. 读用户前端里的请求封装（`fetch`、`axios`，或项目自己的 request）。列出 method、path，并为每个接口准备一份示例 JSON 响应。除非用户明确要求把 base URL 指到 mock，否则不要改前端业务代码。
2. 确认服务在跑。没有就告诉用户执行 `mocker start`（会启动并打开控制台）。然后执行 `mocker status`。
3. `status` 里没有对应项目时，执行 `mocker project create --slug <slug> --name "<名称>"`。slug 只用小写字母、数字和连字符。
4. 在用户项目里写 `mocker.json`。字段形状以 `mocker schema` 的输出为准。场景使用稳定的 `name`。不要写 `id`、`origin`、`enabled`、`activeScenarioId`。`mode` 只能是 `json` 或 `sse`。
5. 执行 `mocker apply --file mocker.json --project <slug>`。同一 `method + path` 会更新基准场景。控制台另加的场景和当前启用场景会保留。
6. 把前端的 API base URL 指到 `mocker status` 里该项目的 `url`。前端打过之后，用 `mocker logs --project <slug>` 看真实请求。要把这些请求收成文档，执行 `mocker capture --project <slug> --file mocker.json`，核对后再 `mocker apply`。`capture` 对同一个 method+path 只取最新一条；`source=miss` 的响应体不会被当成成功 mock，场景名是 `captured`，响应先是 `{}`。
7. 执行 `mocker check --file mocker.json`。它按文档请求项目端口，读响应头 `X-Mock-Scenario-Origin`。打中的必须是文档里的基准场景，并且状态码一致。`check` 不会改当前场景。若打中控制台场景，先告诉用户将启用文档里每条接口的第一个场景名，用户明确同意后再执行 `mocker scenario activate --file mocker.json`，然后重新 `check`。用户没同意就停，不要自己切。这条命令只改当前场景，不改响应内容，也不删控制台场景。
8. WebSocket 和 RTC 只放进 `channels`，响应里的 `runtime` 是 `unimplemented`。不要假设协议已经接通。

## 文档示例

```json
{
  "project": "shop-web",
  "routes": [
    {
      "method": "GET",
      "path": "/api/orders",
      "name": "订单列表",
      "scenarios": [
        { "name": "ok", "statusCode": 200, "response": { "list": [] } }
      ]
    }
  ],
  "channels": [
    { "kind": "websocket", "name": "chat", "bind": { "path": "/ws/chat" } }
  ]
}
```

已经在控制台配过的接口，第一次 apply 会加上基准场景，但不会把它设为当前场景。用户同意后用 `mocker scenario activate` 切换；控制台里仍可以改回去。
