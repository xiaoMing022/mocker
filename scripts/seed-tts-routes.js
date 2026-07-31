#!/usr/bin/env node
/**
 * Seed tts-leaderboard console routes (scenario model) from fixtures.
 * Usage: npm run seed:tts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturesDir = path.join(root, "fixtures/tts-leaderboard")
const outDir = path.join(root, "config/projects/tts-leaderboard")
const outFile = path.join(outDir, "routes.json")
const projectsConfigPath = path.join(root, "config/projects.json")

function read(...segs) {
  return JSON.parse(readFileSync(path.join(fixturesDir, ...segs), "utf8"))
}

function scenario(partial) {
  return {
    id: randomUUID(),
    name: partial.name || "默认",
    statusCode: partial.statusCode ?? 200,
    delayMs: partial.delayMs ?? 120,
    response: partial.response ?? {},
    headers: partial.headers ?? {},
  }
}

function route(partial) {
  const scenarios = (partial.scenarios || []).map(scenario)
  const active =
    scenarios.find((s) => s.name === partial.activeScenarioName) || scenarios[0]
  return {
    id: randomUUID(),
    name: partial.name,
    method: partial.method,
    path: partial.path,
    enabled: partial.enabled !== false,
    activeScenarioId: active?.id || "",
    scenarios,
    note: partial.note || "",
  }
}

const leaderboardEntries = read("web", "leaderboard-entries.json")

const routes = [
  route({
    name: "[web] Arena 校验会话",
    method: "POST",
    path: "/api/v1/arena/verify",
    note: "body: { turnstileToken }",
    scenarios: [
      {
        name: "成功",
        delayMs: 120,
        response: read("web", "arena-verify-success.json"),
      },
      {
        name: "缺少 token",
        statusCode: 400,
        delayMs: 80,
        response: { code: 400, message: "缺少 turnstileToken", data: null },
      },
    ],
  }),
  route({
    name: "[web] Arena 对战",
    method: "POST",
    path: "/api/v1/arena/battle",
    note: "需要请求头 X-Session-Token（业务侧校验；mock 可直接返回成功）",
    scenarios: [
      {
        name: "成功",
        delayMs: 120,
        response: read("web", "arena-battle.json"),
      },
      {
        name: "未授权",
        statusCode: 401,
        delayMs: 80,
        response: {
          code: 401,
          message: "sessionToken 无效或已过期",
          data: null,
        },
      },
    ],
  }),
  route({
    name: "[web] Arena 投票",
    method: "POST",
    path: "/api/v1/arena/vote",
    note: "联调时在此切换 A / B / 非法 场景",
    activeScenarioName: "成功 A",
    scenarios: [
      {
        name: "成功 A",
        delayMs: 180,
        response: read("web", "arena-vote-success-a.json"),
      },
      {
        name: "成功 B",
        delayMs: 180,
        response: read("web", "arena-vote-success-b.json"),
      },
      {
        name: "非法选择",
        statusCode: 400,
        delayMs: 180,
        response: read("web", "arena-vote-invalid-choice.json"),
      },
      {
        name: "未授权",
        statusCode: 401,
        delayMs: 80,
        response: {
          code: 401,
          message: "sessionToken 无效或已过期",
          data: null,
        },
      },
    ],
  }),
  route({
    name: "[web] 排行榜",
    method: "GET",
    path: "/api/v1/leaderboard",
    scenarios: [
      {
        name: "正常列表",
        delayMs: 120,
        response: {
          code: 200,
          message: "success",
          data: {
            snapshotTime: "2026-06-30T10:00:00+08:00",
            items: leaderboardEntries,
          },
        },
      },
      {
        name: "空列表",
        delayMs: 80,
        response: {
          code: 200,
          message: "success",
          data: { snapshotTime: "2026-06-30T10:00:00+08:00", items: [] },
        },
      },
    ],
  }),
  route({
    name: "[web] 提交联系表单",
    method: "POST",
    path: "/api/v1/contact",
    scenarios: [
      {
        name: "成功",
        delayMs: 200,
        response: { code: 200, message: "success", data: { success: true } },
      },
      {
        name: "参数错误",
        statusCode: 400,
        delayMs: 100,
        response: {
          code: 400,
          message: "请填写姓名、邮箱与具体信息",
          data: null,
        },
      },
    ],
  }),
  route({
    name: "[web] 站点联系信息",
    method: "GET",
    path: "/api/v1/site/contact-info",
    scenarios: [
      {
        name: "默认",
        delayMs: 100,
        response: read("web", "site-contact-info.json"),
      },
    ],
  }),
  route({
    name: "[admin] 统计",
    method: "GET",
    path: "/api/admin/stats",
    scenarios: [
      { name: "默认", delayMs: 120, response: read("admin", "admin-stats.json") },
    ],
  }),
  route({
    name: "[admin] 模型列表",
    method: "GET",
    path: "/api/admin/models",
    scenarios: [
      {
        name: "默认",
        delayMs: 160,
        response: read("admin", "admin-models.json"),
      },
    ],
  }),
  route({
    name: "[admin] 排行榜",
    method: "GET",
    path: "/api/admin/leaderboard",
    scenarios: [
      {
        name: "默认",
        delayMs: 160,
        response: read("admin", "admin-leaderboard.json"),
      },
    ],
  }),
]

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(
  outFile,
  `${JSON.stringify({ version: 2, routes }, null, 2)}\n`,
)

// Ensure project exists in config as console-managed (same as UI-created projects)
const defaultProject = {
  name: "TTS Leaderboard",
  description: "TTS 排行榜 Web / Admin Mock（控制台管理）",
  enabled: true,
  port: 4001,
  proxy: { enabled: false, target: "" },
  managed: true,
}
let projectsConfig = { adminPort: 4000, projects: {} }
if (existsSync(projectsConfigPath)) {
  try {
    projectsConfig = JSON.parse(readFileSync(projectsConfigPath, "utf8"))
  } catch {
    /* keep default */
  }
}
if (!projectsConfig.projects) projectsConfig.projects = {}
const existing = projectsConfig.projects["tts-leaderboard"] || {}
projectsConfig.projects["tts-leaderboard"] = {
  ...defaultProject,
  ...existing,
  name: existing.name || defaultProject.name,
  description: existing.description || defaultProject.description,
  managed: true,
  proxy: {
    enabled: Boolean(existing.proxy?.enabled),
    target: existing.proxy?.target || "",
  },
  enabled: existing.enabled !== false,
  port: existing.port || defaultProject.port,
}
writeFileSync(projectsConfigPath, `${JSON.stringify(projectsConfig, null, 2)}\n`)

console.log(
  `Seeded ${routes.length} interfaces (${routes.reduce((n, r) => n + r.scenarios.length, 0)} scenarios) → ${path.relative(root, outFile)}`,
)
console.log(`Project config → ${path.relative(root, projectsConfigPath)} (managed: true)`)
