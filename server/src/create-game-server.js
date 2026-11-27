import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { config } from './config.js'
import { PlayerStore, publicPlayer } from './players.js'
import {
  applyTag,
  createTagState,
  ensureIt,
  evaluateTag,
  publicTagState,
  removePlayer,
} from './tag.js'
import { createRateLimiter, SERVER_BOUNDS, validateMove } from './validation.js'

const ROOM = 'city'

// Builds the game server without calling listen(), so the same code can run as
// a standalone Node process or as the default export of a Vercel Function.
export function createGameServer({ socketPath = config.socketPath, healthPath = '/health' } = {}) {
  const store = new PlayerStore(config.maxPlayers)
  const tagState = createTagState()
  const limiters = new Map()
  const violationCounts = new Map()

  function broadcastTag(hit) {
    io.to(ROOM).emit('tag:hit', { ...hit, players: publicTagState(store.snapshot()) })
  }

  const app = express()
  app.disable('x-powered-by')

  app.get(healthPath, (_request, response) => {
    response.status(200).json({
      status: 'ok',
      players: store.size,
      uptimeSeconds: Math.round(process.uptime()),
      itId: tagState.itId,
    })
  })

  app.get('/', (_request, response) => {
    response.type('text/plain').send('Neon Drive multiplayer server')
  })

  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    path: socketPath,
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 2048,
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  io.on('connection', (socket) => {
    if (store.size >= config.maxPlayers) {
      socket.emit('game:error', { code: 'SERVER_FULL', message: 'The city is full. Please try again shortly.' })
      socket.disconnect(true)
      return
    }

    const player = store.add(socket.id)
    limiters.set(socket.id, createRateLimiter())
    violationCounts.set(socket.id, 0)
    socket.join(ROOM)

    const reassignment = ensureIt(store.snapshot(), tagState, Date.now(), config.tagCooldownMs)
    if (reassignment) broadcastTag(reassignment)

    socket.emit('game:init', {
      id: socket.id,
      player: publicPlayer(player),
      players: store.snapshot().filter((item) => item.id !== socket.id).map(publicPlayer),
      config: {
        maxPlayers: config.maxPlayers,
        tickMs: config.tickMs,
        world: SERVER_BOUNDS,
        tag: { radius: config.tagRadius, cooldownMs: config.tagCooldownMs },
      },
    })
    socket.broadcast.emit('player:joined', publicPlayer(player))

    socket.on('player:move', (payload) => {
      const result = validateMove(payload, {
        now: Date.now(),
        limiter: limiters.get(socket.id),
      })

      if (!result.ok) {
        // Rate-limited packets are dropped silently; malformed ones are reported.
        if (result.code === 'RATE_LIMITED') return
        const count = (violationCounts.get(socket.id) || 0) + 1
        violationCounts.set(socket.id, count)
        socket.emit('game:error', { code: result.code, message: result.message })
        if (count >= 5) socket.disconnect(true)
        return
      }

      violationCounts.set(socket.id, 0)
      store.update(socket.id, result.state)
    })

    socket.on('disconnect', () => {
      const reassignment = removePlayer(store.snapshot(), tagState, socket.id, Date.now(), config.tagCooldownMs)
      store.remove(socket.id)
      limiters.delete(socket.id)
      violationCounts.delete(socket.id)
      io.emit('player:left', { id: socket.id })
      if (reassignment) broadcastTag(reassignment)
    })
  })

  // One broadcast per tick for the whole room instead of one per incoming move.
  // Tag contact is resolved here, so the client can never claim a valid tag.
  const tick = setInterval(() => {
    const players = store.snapshot()
    const now = Date.now()
    const hit = evaluateTag(players, tagState, now, config.tagRadius, config.tagCooldownMs)
    if (hit && applyTag(hit, players, tagState, now, config.tagCooldownMs)) broadcastTag(hit)
    io.to(ROOM).emit('player:moved', { players: players.map(publicPlayer) })
  }, config.tickMs)

  function close() {
    clearInterval(tick)
    io.close()
    httpServer.close()
  }

  return { app, httpServer, io, close, store, tagState }
}
