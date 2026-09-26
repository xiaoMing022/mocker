/**
 * Reserved hook for WebSocket upgrade and RTC on a project HTTP server.
 * Callers pass the listening server and the project's channel records.
 * This build does not attach upgrade listeners or open media sockets.
 *
 * @param {import("node:http").Server} server
 * @param {import("../channel-store.js").Channel[]} _channels
 * @returns {import("node:http").Server}
 */
export function attachChannels(server, _channels) {
  return server
}
