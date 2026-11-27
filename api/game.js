import { createGameServer } from '../server/src/create-game-server.js'

// Vercel Functions are routed at the exact path /api/game and receive that
// full path in req.url (subpaths like /api/game/health are not routed to the
// function). Socket.IO therefore listens on /api/game itself, and the plain
// GET /api/game request doubles as the health check.
const { httpServer } = createGameServer({ socketPath: '/api/game', healthPath: '/api/game' })

export default httpServer
