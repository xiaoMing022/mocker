#!/usr/bin/env node
/**
 * Seed tts-leaderboard console routes from data/web + data/admin fixtures.
 * Usage: node scripts/seed-tts-routes.js
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dataDir = path.join(root, "src/projects/tts-leaderboard/data")
const outDir = path.join(root, "config/projects/tts-leaderboard")
const outFile = path.join(outDir, "routes.json")

function read(...segs) {
  return JSON.parse(readFileSync(path.join(dataDir, ...segs), "utf8"))
}

function route(partial) {
  return {
    id: randomUUID(),
    name: partial.name,
    method: partial.method,
    path: partial.path,
    enabled: partial.enabled !== false,
    statusCode: partial.statusCode ?? 200,
    delayMs: partial.delayMs ?? 120,
    response: partial.response,
    headers: partial.headers ?? {},
  }
}

const leaderboardEntries = read("web", "leaderboard-entries.json")

const routes = [
  route({
    name: "[web] Arena 校验会话",
    method: "POST",
    path: "/api/v1/arena/verify",
    delayMs: 120,
    response: read("web", "arena-verify-success.json"),
  }),
  route({
    name: "[web] Arena 对战",
    method: "POST",
    path: "/api/v1/arena/battle",
    delayMs: 120,
    response: read("web", "arena-battle.json"),
  }),
  route({
    name: "[web] Arena 投票成功 A（默认）",
    method: "POST",
    path: "/api/v1/arena/vote",
    delayMs: 180,
    response: read("web", "arena-vote-success-a.json"),
  }),
  route({
    name: "[web] Arena 投票成功 B（备用，默认关闭）",
    method: "POST",
    path: "/api/v1/arena/vote",
    enabled: false,
    delayMs: 180,
    response: read("web", "arena-vote-success-b.json"),
  }),
  route({
    name: "[web] Arena 投票非法选择（备用，默认关闭）",
    method: "POST",
    path: "/api/v1/arena/vote",
    enabled: false,
    delayMs: 180,
    statusCode: 400,
    response: read("web", "arena-vote-invalid-choice.json"),
  }),
  route({
    name: "[web] 排行榜",
    method: "GET",
    path: "/api/v1/leaderboard",
    delayMs: 120,
    response: {
      code: 200,
      message: "success",
      data: {
        snapshotTime: "2026-06-30T10:00:00+08:00",
        items: leaderboardEntries,
      },
    },
  }),
  route({
    name: "[web] 提交联系表单",
    method: "POST",
    path: "/api/v1/contact",
    delayMs: 200,
    response: {
      code: 200,
      message: "success",
      data: { success: true },
    },
  }),
  route({
    name: "[web] 站点联系信息",
    method: "GET",
    path: "/api/v1/site/contact-info",
    delayMs: 100,
    response: read("web", "site-contact-info.json"),
  }),
  route({
    name: "[admin] 统计",
    method: "GET",
    path: "/api/admin/stats",
    delayMs: 120,
    response: read("admin", "admin-stats.json"),
  }),
  route({
    name: "[admin] 模型列表",
    method: "GET",
    path: "/api/admin/models",
    delayMs: 160,
    response: read("admin", "admin-models.json"),
  }),
  route({
    name: "[admin] 排行榜",
    method: "GET",
    path: "/api/admin/leaderboard",
    delayMs: 160,
    response: read("admin", "admin-leaderboard.json"),
  }),
]

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, `${JSON.stringify({ routes }, null, 2)}\n`)
console.log(`Seeded ${routes.length} routes → ${path.relative(root, outFile)}`)
console.log("Restart mock server (or reload project) to pick up if already running.")
