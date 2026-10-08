# Mocker

本地多项目 Mock 服务。每个项目占用一个固定端口。人在 Web 控制台里切换场景、暂停项目、查看请求；agent 用 `mocker` 命令把接口文档应用到正在运行的服务上。没有命中的请求可以按环境转发到上游。

仓库：https://github.com/xiaoMing022/mocker

## 能做什么

- 一台机器上同时跑多个项目，各自独立端口。端口写在配置里，同一台机器上重启后保持不变。
- 一个接口可以有多份场景。控制台负责切换当前场景；文档里的基准场景和控制台另加的场景互不覆盖。
- 响应可以是 JSON，也可以是 SSE 流。
- 每个项目可以有多套环境（本地、测试、灰度、线上）。接口 Mock 共用，切换环境只换未命中请求的上游。
- 保留每个项目最近的请求日志。agent 可以据此核对前端实际打进来的请求。
- WebSocket 和 RTC 可以登记名称和路径。协议本身尚未接入。

## 安装

需要本机已有 Node.js 18 或更高版本。

发布到 npm 之后，全局安装。包名必须带 scope，因为 npm 上的 `mocker` 这个名字已经有人用了。装好以后终端里的命令仍然是 `mocker`：

```bash
npm install -g @你的npm用户名/mocker
mocker start
```

`mocker start` 会启动服务并打开 Web 控制台。服务已经在跑时，它只打开浏览器然后退出。

全局安装会把 agent skill 拷到 `~/.grok/skills/mocker` 和 `~/.agents/skills/mocker`。仓库里执行 `npm install` 不会写这两个目录。需要重装 skill 时执行 `mocker skills install`。

还没发布、或想从源码安装时：

```bash
git clone git@github.com:xiaoMing022/mocker.git
cd mocker
npm install
npm run pack:cli
npm install -g ./mocker-0.4.0.tgz
mocker start
```

`npm run pack:cli` 会先构建 Web 控制台。构建机的 Node 需要 `^20.19` 或 `>=22.12`。

## 第一次使用

安装包自带一个示例项目 `demo`，端口是 `4001`。第一次启动、并且本机还没有 Mocker 配置时，会把这份示例复制进去。已经有配置时不会覆盖。

```bash
mocker status
```

`status` 里能看到每个项目的 `port` 和 `url`。把前端的 API 地址指到该项目的 `url`。

换成自己的项目：

```bash
mocker project create --slug shop-web --name "Shop Web" --port 4100
```

不写 `--port` 时，从 `4001` 起分配本机下一个空端口，并立刻写入配置。之后重启还是这个端口。指定的端口已被占用时，创建会失败。

在业务项目里放一份 `mocker.json`：

```json
{
  "project": "shop-web",
  "routes": [
    {
      "method": "GET",
      "path": "/api/orders",
      "name": "订单列表",
      "scenarios": [
        {
          "name": "ok",
          "statusCode": 200,
          "response": { "list": [] }
        }
      ]
    }
  ]
}
```

然后：

```bash
mocker schema
mocker apply --file ./mocker.json --project shop-web
mocker logs --project shop-web
mocker check --file ./mocker.json
```

`apply` 按 `method + path` 更新基准场景，并保留控制台里另加的场景和当前启用的场景。`check` 再请求这些路径，确认打中的是文档里的基准场景，并且状态码一致。如果当前仍是控制台场景，先确认后再执行：

```bash
mocker scenario activate --file ./mocker.json
```

这条命令只切换当前场景，不改响应内容。

字段形状以 `mocker schema` 为准。场景使用稳定的 `name`。文档里不要写 `id`、`origin`、`enabled`、`activeScenarioId`。

## 配置放在哪里

| 场景 | 路径 |
|------|------|
| 已安装的 `mocker`，或打包后的桌面应用 | `~/Library/Application Support/Mocker/config/` |
| 在本仓库里直接运行 | 仓库内 `config/` |
| 自定义 | 环境变量 `MOCK_CONFIG_DIR` |

Windows 对应 `%APPDATA%\Mocker\config`，Linux 使用 XDG 配置目录。Admin 默认是 `http://127.0.0.1:4000`，可用 `--admin`、`MOCKER_ADMIN_URL` 或 `ADMIN_PORT` 改。

每人在自己的电脑上跑一份。配置和端口都在本机，不和其他人共享。

## 从源码开发

```bash
npm install
npm run dev
```

| 入口 | 地址或命令 |
|------|------------|
| Web 控制台（开发） | http://localhost:5173 |
| Web 控制台（生产） | http://localhost:4000，先执行 `npm run build` |
| 桌面端 | `npm run desktop` |
| macOS 安装包 | `npm run dist:mac`，产物在 `release/`，当前为未签名 arm64 |

点击桌面窗口的关闭按钮会退出应用并释放全部 Mock 端口。要在后台继续提供 Mock，用菜单栏里的「隐藏窗口（后台保持 Mock）」。

## 维护者：发布到 npm

npm 上无 scope 的包名 `mocker` 已被占用。发布前把 `package.json` 的 `name` 改成 `@你的npm用户名/mocker`，并删掉 `"private": true`。同时把本文件「安装」一节里的包名换成同一个名字。`bin` 保持 `"mocker": "./cli/mocker.js"`，用户安装后的命令名不变。

```bash
npm run build
npm login
npm publish --access public
```

scoped 包默认按私有包发布，免费账号需要 `--access public`。对方安装：

```bash
npm install -g @你的npm用户名/mocker
```

发到自己的 registry 时，包名可以仍叫 `mocker`（该仓库里没人占用的话）：

```bash
npm login --registry=https://你的仓库地址
npm publish --registry=https://你的仓库地址
```

对方：

```bash
npm install -g mocker --registry=https://你的仓库地址
```

每次更新先改 `version`，再重新 `npm run build` 和 `npm publish`。同一版本不能重复发布。`npm publish` 打包的是当前目录里的文件，包含尚未提交的改动，也包含 `npm run build` 生成的 `public/console/`。

## License

[MIT](./LICENSE) © 2026 xiaoMing022
