import express from "express"

/**
 * TTS Leaderboard project shell.
 *
 * Happy-path responses live in the console route table
 * (`config/projects/tts-leaderboard/routes.json`), seeded from
 * `fixtures/` via `npm run seed:tts`.
 *
 * createRouter is reserved for future code-only branching logic.
 * Leave empty so dynamic routes + proxy are the primary path.
 */
export const ttsLeaderboardProject = {
  slug: "tts-leaderboard",
  name: "TTS Leaderboard",
  description: "Mock APIs for the TTS Leaderboard web and admin apps.",
  defaultPort: 4001,
  createRouter: () => express.Router(),
}
