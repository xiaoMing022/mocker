import { ttsLeaderboardProject } from "./tts-leaderboard/index.js"

/** Code-side project registry (meta + createRouter). Runtime ports/proxy live in config/projects.json. */
export const projects = [ttsLeaderboardProject]
