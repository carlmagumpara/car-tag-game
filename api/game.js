import { createGameServer } from '../server/src/create-game-server.js'

// Vercel Functions serve WebSockets by exporting a Node http.Server.
// The Socket.IO endpoint is reached at /api/game/socket.io/... on the
// deployment domain; configure the client with that path and transports:
// ['websocket']. See README.md for the full setup.
const { httpServer } = createGameServer()

export default httpServer
