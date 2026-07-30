import express from "express"

import { readJsonFromModule } from "../../lib/data.js"
import { hasHeader, sendJson } from "../../lib/http.js"

const sessionTokenHeader = "X-Session-Token"

const adminLeaderboardResponse = readJson("data", "admin", "admin-leaderboard.json")
const adminModelsResponse = readJson("data", "admin", "admin-models.json")
const adminStatsResponse = readJson("data", "admin", "admin-stats.json")
const arenaBattleResponse = readJson("data", "web", "arena-battle.json")
const arenaInvalidChoiceResponse = readJson(
  "data",
  "web",
  "arena-vote-invalid-choice.json",
)
const arenaVoteSuccessAResponse = readJson("data", "web", "arena-vote-success-a.json")
const arenaVoteSuccessBResponse = readJson("data", "web", "arena-vote-success-b.json")
const arenaVerifySuccessResponse = readJson("data", "web", "arena-verify-success.json")
const leaderboardEntries = readJson("data", "web", "leaderboard-entries.json")
const siteContactInfoResponse = readJson("data", "web", "site-contact-info.json")

function readJson(...segments) {
  return readJsonFromModule(import.meta.url, ...segments)
}

export function createTtsLeaderboardRouter() {
  const router = express.Router()

  router.post("/api/v1/arena/verify", async (req, res) => {
    const turnstileToken = req.body?.turnstileToken

    if (typeof turnstileToken !== "string" || !turnstileToken.trim()) {
      await sendJson(
        res,
        {
          code: 400,
          message: "缺少 turnstileToken",
          data: null,
        },
        400,
        120,
      )
      return
    }

    await sendJson(res, arenaVerifySuccessResponse, 200, 120)
  })

  router.post("/api/v1/arena/battle", async (req, res) => {
    if (!hasHeader(req, sessionTokenHeader)) {
      await sendJson(
        res,
        {
          code: 401,
          message: "sessionToken 无效或已过期",
          data: null,
        },
        401,
        120,
      )
      return
    }

    await sendJson(res, arenaBattleResponse, 200, 120)
  })

  router.post("/api/v1/arena/vote", async (req, res) => {
    if (!hasHeader(req, sessionTokenHeader)) {
      await sendJson(
        res,
        {
          code: 401,
          message: "sessionToken 无效或已过期",
          data: null,
        },
        401,
        180,
      )
      return
    }

    const { battleId, winner } = req.body ?? {}
    if (!battleId || (winner !== "A" && winner !== "B")) {
      await sendJson(res, arenaInvalidChoiceResponse, 400, 180)
      return
    }

    await sendJson(
      res,
      winner === "A" ? arenaVoteSuccessAResponse : arenaVoteSuccessBResponse,
      200,
      180,
    )
  })

  router.get("/api/v1/leaderboard", async (_req, res) => {
    await sendJson(
      res,
      {
        code: 200,
        message: "success",
        data: {
          snapshotTime: "2026-06-30T10:00:00+08:00",
          items: leaderboardEntries,
        },
      },
      200,
      120,
    )
  })

  router.post("/api/v1/contact", async (req, res) => {
    const { name, email, content } = req.body ?? {}
    const isValid =
      typeof name === "string" &&
      Boolean(name.trim()) &&
      typeof email === "string" &&
      Boolean(email.trim()) &&
      typeof content === "string" &&
      Boolean(content.trim())

    if (!isValid) {
      await sendJson(
        res,
        {
          code: 400,
          message: "请填写姓名、邮箱与具体信息",
          data: null,
        },
        400,
        200,
      )
      return
    }

    await sendJson(
      res,
      {
        code: 200,
        message: "success",
        data: { success: true },
      },
      200,
      200,
    )
  })

  router.get("/api/v1/site/contact-info", async (_req, res) => {
    await sendJson(res, siteContactInfoResponse, 200, 100)
  })

  router.get("/api/admin/stats", async (_req, res) => {
    await sendJson(res, adminStatsResponse, 200, 120)
  })

  router.get("/api/admin/models", async (_req, res) => {
    await sendJson(res, adminModelsResponse, 200, 160)
  })

  router.get("/api/admin/leaderboard", async (_req, res) => {
    await sendJson(res, adminLeaderboardResponse, 200, 160)
  })

  return router
}
