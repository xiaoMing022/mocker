import { createTtsLeaderboardRouter } from "./routes.js"

export const ttsLeaderboardProject = {
  slug: "tts-leaderboard",
  name: "TTS Leaderboard",
  description: "Mock APIs for the TTS Leaderboard web and admin apps.",
  defaultPort: 4001,
  createRouter: createTtsLeaderboardRouter,
}
