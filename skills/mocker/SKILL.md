---
name: mocker
version: 0.4.0
description: >
  Use only when the user explicitly names Mocker in this conversation
  (Mocker, mocker, mocker.json, or the mocker CLI).
  Do not select this skill for a generic mock, fake API, MSW, json-server,
  or local stub. Do not suggest switching the user's project to Mocker.
metadata:
  requires:
    bins: ["mocker"]
  cliHelp: "mocker --help;mocker schema"
---

# mocker

只在当前对话点名了 Mocker 时使用。先确认 `mocker` 在 PATH 上。数据命令的 JSON 在 stdout，失败 JSON 在 stderr，退出码非 0。

命令和标志以 `mocker --help` 为准。文档字段以 `mocker schema` 为准。不要改 Mocker 的配置目录，也不要写框架扫描器。除非用户明确要求，不要改前端业务代码。

# 步骤

1. 读用户前端的请求封装，列出 method、path，并为每个接口准备一份示例 JSON。
2. 服务没跑就让用户执行 `mocker start`。然后 `mocker status`。项目用 `mocker project get --project <slug>`。接口和当前场景用 `mocker route list --project <slug>`。要看响应体再用 `mocker route get`。
3. 没有项目就 `mocker project create --slug <slug> --name "<名称>"`。slug 只用小写字母、数字和连字符。项目暂停就 `mocker project resume`。换上游用 `mocker project environment --id <环境 id>`。
4. 在用户项目里写 `mocker.json`。场景用稳定的 `name`。`tags` 是小写标签，用来筛选和切换。不要写 `id`、`origin`、`enabled`、`activeScenarioId`。
5. `mocker apply --file mocker.json --project <slug>`。
6. 把前端 API base URL 指到该项目的 `url`。用 `mocker logs --project <slug>` 看真实请求。要收成文档就 `mocker capture`，核对后再 apply。
7. `mocker check --file mocker.json`。没通过就说明原因。用户明确同意后才 `mocker scenario activate`，然后再 check。没同意就停。
8. WebSocket 和 RTC 只放进 `channels`。响应里的 `runtime` 是 `unimplemented`。

# 行为

这些规则决定怎么处理结果。字段形状不要从这里推断，去跑 `mocker schema`。

- apply 按 method + path 更新基准场景，保留控制台场景和当前启用场景。已有接口第一次 apply 不会切到基准场景。
- 文档里写了 `tags` 才更新基准场景的标签；没写就保留。控制台场景的标签不动。临时改标签用 `mocker scenario tag`。
- `:name` 匹配一个路径段，静态段优先。check 把每个参数代成 `1`。有 `requestExample.query` 就带上；非 GET/HEAD 再带 `requestExample.body`。
- check 要求打中文档里的基准场景，状态码和 JSON 体一致。`{}` 只有文档里的响应就是 `{}` 才通过。SSE 只比状态码和场景。
- capture 对同一个 method + 模板只留最新一条。`source=miss` 不当成成功 mock：场景名是 `captured`，响应是 `{}`。日志里的 `routePath` 是模板，`path` 是实际请求。
- `scenario activate --file` 把每条接口切到文档里的第一个场景。`--tag` 只在该接口恰好一个场景有这个标签时切换；有多个就列出名字并停。activate 只改当前场景。
- 卸掉各 agent 目录里的这份 skill 用 `mocker skills uninstall`。这不删除 mock 项目配置，也不卸载 `mocker` 命令。

# 控制台操作

这些命令对应控制台里的编辑。`mocker route import` 会换掉该项目的全部接口。`mocker project delete` 会删除该项目的配置。主题只在控制台里切换。

- `project update`、`project delete`、`project reload`
- `project environments --file` 替换整份环境，含代理目标和路径规则
- `route create`、`route update`、`route delete`、`route export`、`route import`
- `logs get`、`logs clear`、`logs to-scenario`
- `channel list`、`channel enable`、`channel disable`
- `call` 打一次已保存的示例请求。`curl` 打印对应的 curl

# 示例

```json
{
  "project": "shop-web",
  "routes": [
    {
      "method": "GET",
      "path": "/api/orders/:id",
      "name": "订单",
      "requestExample": { "query": { "verbose": "1" } },
      "scenarios": [
        {
          "name": "ok",
          "tags": ["ok"],
          "statusCode": 200,
          "response": { "id": "1" }
        }
      ]
    }
  ],
  "channels": [
    { "kind": "websocket", "name": "chat", "bind": { "path": "/ws/chat" } }
  ]
}
```
