import { config } from './config.js'
import { createGameServer } from './create-game-server.js'

const { httpServer, close } = createGameServer()

function shutdown() {
  close()
  setTimeout(() => process.exit(0), 100)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

httpServer.listen(config.port, () => {
  console.log(`Neon Drive server listening on port ${config.port}`)
  console.log(`Allowed origins: ${config.clientOrigins.join(', ')}`)
})
