import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { config } from './config.js'
import { PlayerStore, publicPlayer } from './players.js'
import {
  MIN_PLAYERS,
  createRoundState,
  handlePlayerLeft,
  isRoundActive,
  maybeFinishRound,
  maybeStartRound,
  publicRoundState,
  setPlayerReady,
} from './round.js'
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
  const round = createRoundState(config.roundSeconds)
  const limiters = new Map()
  const violationCounts = new Map()
  let lastRoundSignature = ''

  function broadcastTag(hit) {
    io.to(ROOM).emit('tag:hit', { ...hit, players: publicTagState(store.snapshot()) })
  }

  function roundSignature(state) {
    return [
      state.phase,
      state.secondsLeft,
      state.readyIds.join(','),
      state.winnerIds.join(','),
    ].join('|')
  }

  // Sent on transitions and once per countdown second (not on the 20 Hz tick)
  // so React's HUD does not re-render for every movement snapshot.
  function broadcastRound(force = false) {
    const payload = publicRoundState(round, store.snapshot(), Date.now())
    const signature = roundSignature(payload)
    if (!force && signature === lastRoundSignature) return
    lastRoundSignature = signature
    io.to(ROOM).emit('game:state', payload)
  }

  function resetTagger(now) {
    tagState.itId = null
    tagState.cooldownUntil = 0
    tagState.lastTaggerId = null
    const reassignment = ensureIt(store.snapshot(), tagState, now, config.tagCooldownMs)
    if (reassignment) broadcastTag(reassignment)
  }

  // Call after an event that may have changed the phase (join, ready, leave,
  // tick). A fresh round gets a fresh "it" and a forced state broadcast.
  function afterRoundChange(previousPhase, now) {
    if (round.phase !== previousPhase) {
      if (isRoundActive(round)) resetTagger(now)
      broadcastRound(true)
    } else {
      broadcastRound()
    }
  }

  const app = express()
  app.disable('x-powered-by')

  app.get(healthPath, (_request, response) => {
    response.status(200).json({
      status: 'ok',
      players: store.size,
      uptimeSeconds: Math.round(process.uptime()),
      itId: tagState.itId,
      phase: round.phase,
      secondsLeft: publicRoundState(round, store.snapshot(), Date.now()).secondsLeft,
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

    const previousPhase = round.phase
    const now = Date.now()
    const player = store.add(socket.id)
    limiters.set(socket.id, createRateLimiter())
    violationCounts.set(socket.id, 0)
    socket.join(ROOM)

    const reassignment = ensureIt(store.snapshot(), tagState, now, config.tagCooldownMs)
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
        roundSeconds: config.roundSeconds,
        minPlayers: MIN_PLAYERS,
      },
    })
    socket.broadcast.emit('player:joined', publicPlayer(player))
    // Always give the new socket the current phase, even when the signature
    // has not changed since the last broadcast (e.g. joining mid-round).
    socket.emit('game:state', publicRoundState(round, store.snapshot(), now))

    // A newcomer is never ready, so this only matters when the previous
    // unready driver left and everyone remaining had already readied up.
    maybeStartRound(store.snapshot(), round, now)
    afterRoundChange(previousPhase, now)

    socket.on('player:ready', (payload) => {
      const before = round.phase
      const ready = payload?.ready !== false
      setPlayerReady(store.snapshot(), round, socket.id, ready, Date.now())
      afterRoundChange(before, Date.now())
    })

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
      const before = round.phase
      const now = Date.now()
      const players = store.snapshot()
      const reassignment = removePlayer(players, tagState, socket.id, now, config.tagCooldownMs)
      store.remove(socket.id)
      handlePlayerLeft(store.snapshot(), round, socket.id, now)
      limiters.delete(socket.id)
      violationCounts.delete(socket.id)
      io.emit('player:left', { id: socket.id })
      if (reassignment) broadcastTag(reassignment)
      afterRoundChange(before, now)
    })
  })

  // One broadcast per tick for the whole room instead of one per incoming move.
  // Tag contact is resolved here, so the client can never claim a valid tag.
  // Scoring is only active while a round's timer is running.
  const tick = setInterval(() => {
    const players = store.snapshot()
    const now = Date.now()
    const before = round.phase
    maybeFinishRound(players, round, now)

    if (isRoundActive(round)) {
      const hit = evaluateTag(players, tagState, now, config.tagRadius, config.tagCooldownMs)
      if (hit && applyTag(hit, players, tagState, now, config.tagCooldownMs)) broadcastTag(hit)
    }

    io.to(ROOM).emit('player:moved', { players: players.map(publicPlayer) })
    afterRoundChange(before, now)
  }, config.tickMs)

  function close() {
    clearInterval(tick)
    io.close()
    httpServer.close()
  }

  return { app, httpServer, io, close, store, tagState, round }
}
