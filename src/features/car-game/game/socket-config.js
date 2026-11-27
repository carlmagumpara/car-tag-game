// Build-time Socket.IO configuration. Vercel Functions only accept WebSocket
// upgrades, so production sets VITE_GAME_TRANSPORTS=websocket and points the
// path at the function route. Local development keeps polling as a fallback.

export function getSocketConfig() {
  const configuredUrl = import.meta.env.VITE_GAME_SERVER_URL
  const url =
    configuredUrl ||
    (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')

  const path = import.meta.env.VITE_GAME_SOCKET_PATH || '/socket.io'
  const transports = (import.meta.env.VITE_GAME_TRANSPORTS || 'websocket,polling')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return { serverUrl: url, socketPath: path, transports }
}
