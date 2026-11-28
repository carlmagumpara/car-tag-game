import express from 'express'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { CHAT_MAX_LENGTH, normalizeChatText } from './chat.js'
import { config } from './config.js'
import { normalizeCarColor, publicPlayer } from './players.js'
import { RoomManager, normalizeRoomId } from './rooms.js'
import {
  MIN_PLAYERS,
  handlePlayerLeft,
  isRoundActive,
  maybeFinishRound,
  maybeStartRound,
  publicRoundState,
  setPlayerReady,
} from './round.js'
import {
  applyTag,
  ensureIt,
  evaluateTag,
  publicTagState,
  removePlayer,
} from './tag.js'
import { normalizeVoiceSignal, normalizeVoiceState } from './voice.js'
import { createRateLimiter, SERVER_BOUNDS, validateMove } from './validation.js'

// Builds the game server without calling listen(), so the same code can run as
// a standalone Node process or as the default export of a Vercel Function.
// Every connected game lives in its own room; events and broadcasts are scoped
// to that room so separate shareable links never see each other.
export function createGameServer({ socketPath = config.socketPath, healthPath = '/health' } = {}) {
  const rooms = new RoomManager({
    maxPlayers: config.maxPlayers,
    roundSeconds: config.roundSeconds,
    maxRooms: config.maxRooms,
  })

  function broadcastTag(room, hit) {
    io.to(room.id).emit('tag:hit', { ...hit, players: publicTagState(room.store.snapshot()) })
  }

  function voicePeersPayload(room) {
    return {
      peers: Array.from(room.voicePeers, ([id, state]) => ({ id, muted: state.muted })),
    }
  }

  function broadcastVoicePeers(room) {
    io.to(room.id).emit('voice:peers', voicePeersPayload(room))
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
  function broadcastRound(room, force = false) {
    const payload = publicRoundState(room.round, room.store.snapshot(), Date.now())
    const signature = roundSignature(payload)
    if (!force && signature === room.lastRoundSignature) return
    room.lastRoundSignature = signature
    io.to(room.id).emit('game:state', payload)
  }

  function resetTagger(room, now) {
    room.tagState.itId = null
    room.tagState.cooldownUntil = 0
    room.tagState.lastTaggerId = null
    const reassignment = ensureIt(room.store.snapshot(), room.tagState, now, config.tagCooldownMs)
    if (reassignment) broadcastTag(room, reassignment)
  }

  // Call after an event that may have changed the phase (join, ready, leave,
  // tick). A fresh round gets a fresh "it" and a forced state broadcast.
  function afterRoundChange(room, previousPhase, now) {
    if (room.round.phase !== previousPhase) {
      if (isRoundActive(room.round)) resetTagger(room, now)
      broadcastRound(room, true)
    } else {
      broadcastRound(room)
    }
  }

  const app = express()
  app.disable('x-powered-by')

  app.get(healthPath, (_request, response) => {
    let players = 0
    for (const room of rooms.values()) players += room.store.size
    response.status(200).json({
      status: 'ok',
      players,
      rooms: rooms.size,
      roomIds: rooms.ids(),
      uptimeSeconds: Math.round(process.uptime()),
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
    // A client asks for a room through auth (browser) or query (raw clients).
    // An absent/invalid code creates a brand-new room with a generated id.
    const requested = normalizeRoomId(
      socket.handshake.auth?.roomId ?? socket.handshake.query?.room,
    )
    const room = requested ? rooms.getOrCreate(requested) : rooms.create()
    if (!room) {
      socket.emit('game:error', {
        code: 'ROOM_UNAVAILABLE',
        message: 'No game rooms are available right now. Please try again shortly.',
      })
      socket.disconnect(true)
      return
    }

    if (room.store.size >= config.maxPlayers) {
      socket.emit('game:error', {
        code: 'SERVER_FULL',
        message: `Room ${room.id} is full. Ask for a new code or try again shortly.`,
      })
      socket.disconnect(true)
      return
    }

    // A driver may pick a car color on the landing page. Anything else gets a
    // distinct default color from the room's spawn index.
    const requestedColor = normalizeCarColor(
      socket.handshake.auth?.carColor ?? socket.handshake.query?.carColor,
      null,
    )
    const previousPhase = room.round.phase
    const now = Date.now()
    const player = room.store.add(socket.id, requestedColor)
    room.limiters.set(socket.id, createRateLimiter())
    room.violations.set(socket.id, 0)
    // Chat is much slower than movement; voice signaling can burst during ICE.
    room.chatLimiters.set(socket.id, createRateLimiter({ minIntervalMs: 400, maxPerSecond: 3 }))
    room.voiceLimiters.set(socket.id, createRateLimiter({ minIntervalMs: 0, maxPerSecond: 50 }))
    socket.join(room.id)

    const reassignment = ensureIt(room.store.snapshot(), room.tagState, now, config.tagCooldownMs)
    if (reassignment) broadcastTag(room, reassignment)

    socket.emit('game:init', {
      id: socket.id,
      roomId: room.id,
      player: publicPlayer(player),
      players: room.store.snapshot().filter((item) => item.id !== socket.id).map(publicPlayer),
      config: {
        maxPlayers: config.maxPlayers,
        tickMs: config.tickMs,
        world: SERVER_BOUNDS,
        tag: { radius: config.tagRadius, cooldownMs: config.tagCooldownMs },
        roundSeconds: config.roundSeconds,
        minPlayers: MIN_PLAYERS,
      },
    })
    socket.to(room.id).emit('player:joined', publicPlayer(player))
    // Always give the new socket the current phase, even when the signature
    // has not changed since the last broadcast (e.g. joining mid-round).
    socket.emit('game:state', publicRoundState(room.round, room.store.snapshot(), now))
    // Existing voice participants are sent only to the newcomer; their peers
    // learn about them when they enable their own mic.
    socket.emit('voice:peers', voicePeersPayload(room))

    // A newcomer is never ready, so this only matters when the previous
    // unready driver left and everyone remaining had already readied up.
    maybeStartRound(room.store.snapshot(), room.round, now)
    afterRoundChange(room, previousPhase, now)

    socket.on('player:ready', (payload) => {
      const before = room.round.phase
      const ready = payload?.ready !== false
      setPlayerReady(room.store.snapshot(), room.round, socket.id, ready, Date.now())
      afterRoundChange(room, before, Date.now())
    })

    // Chat is room-scoped and ephemeral: no history is kept after disconnect.
    socket.on('chat:send', (payload) => {
      const text = normalizeChatText(payload?.text)
      if (!text) {
        socket.emit('game:error', {
          code: 'INVALID_CHAT',
          message: `Messages must be 1-${CHAT_MAX_LENGTH} characters and on one line.`,
        })
        return
      }
      const limiter = room.chatLimiters.get(socket.id)
      if (limiter && !limiter.allow(Date.now())) return
      const player = room.store.get(socket.id)
      if (!player) return
      io.to(room.id).emit('chat:message', {
        id: randomUUID(),
        playerId: socket.id,
        name: player.name,
        color: player.color,
        text,
        at: Date.now(),
      })
    })

    // WebRTC signaling is relayed, never interpreted. Both ends must be in
    // voice and in the same room, so a socket cannot signal into another game.
    function relayVoice(type, payload, kind) {
      const signal = normalizeVoiceSignal(payload, kind)
      if (!signal || !room.voicePeers.has(socket.id)) return
      const target = io.sockets.sockets.get(signal.to)
      if (!target || !target.rooms.has(room.id)) return
      if (!room.voicePeers.has(signal.to)) return
      const limiter = room.voiceLimiters.get(socket.id)
      if (limiter && !limiter.allow(Date.now())) return
      io.to(signal.to).emit(type, {
        from: socket.id,
        [kind === 'sdp' ? 'sdp' : 'candidate']: kind === 'sdp' ? signal.sdp : signal.candidate,
      })
    }

    socket.on('voice:state', (payload) => {
      const state = normalizeVoiceState(payload)
      if (!state) return
      if (state.enabled) room.voicePeers.set(socket.id, { muted: state.muted })
      else room.voicePeers.delete(socket.id)
      broadcastVoicePeers(room)
    })

    socket.on('voice:offer', (payload) => relayVoice('voice:offer', payload, 'sdp'))
    socket.on('voice:answer', (payload) => relayVoice('voice:answer', payload, 'sdp'))
    socket.on('voice:ice', (payload) => relayVoice('voice:ice', payload, 'candidate'))

    socket.on('player:move', (payload) => {
      const result = validateMove(payload, {
        now: Date.now(),
        limiter: room.limiters.get(socket.id),
      })

      if (!result.ok) {
        // Rate-limited packets are dropped silently; malformed ones are reported.
        if (result.code === 'RATE_LIMITED') return
        const count = (room.violations.get(socket.id) || 0) + 1
        room.violations.set(socket.id, count)
        socket.emit('game:error', { code: result.code, message: result.message })
        if (count >= 5) socket.disconnect(true)
        return
      }

      room.violations.set(socket.id, 0)
      room.store.update(socket.id, result.state)
    })

    socket.on('disconnect', () => {
      const before = room.round.phase
      const now = Date.now()
      const players = room.store.snapshot()
      const reassignment = removePlayer(players, room.tagState, socket.id, now, config.tagCooldownMs)
      room.store.remove(socket.id)
      handlePlayerLeft(room.store.snapshot(), room.round, socket.id, now)
      room.limiters.delete(socket.id)
      room.violations.delete(socket.id)
      room.chatLimiters.delete(socket.id)
      room.voiceLimiters.delete(socket.id)
      const wasInVoice = room.voicePeers.delete(socket.id)
      io.to(room.id).emit('player:left', { id: socket.id })
      if (wasInVoice) broadcastVoicePeers(room)
      if (reassignment) broadcastTag(room, reassignment)
      afterRoundChange(room, before, now)
      // An empty room has nothing left to share, so drop it and reclaim the code.
      if (room.store.size === 0) rooms.remove(room.id)
    })
  })

  // One broadcast per tick per room instead of one per incoming move.
  // Tag contact is resolved here, so the client can never claim a valid tag.
  // Scoring is only active while a room's timer is running.
  const tick = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.store.size === 0) {
        rooms.remove(room.id)
        continue
      }
      const players = room.store.snapshot()
      const now = Date.now()
      const before = room.round.phase
      maybeFinishRound(players, room.round, now)

      if (isRoundActive(room.round)) {
        const hit = evaluateTag(players, room.tagState, now, config.tagRadius, config.tagCooldownMs)
        if (hit && applyTag(hit, players, room.tagState, now, config.tagCooldownMs)) {
          broadcastTag(room, hit)
        }
      }

      io.to(room.id).emit('player:moved', { players: players.map(publicPlayer) })
      afterRoundChange(room, before, now)
    }
  }, config.tickMs)

  function close() {
    clearInterval(tick)
    io.close()
    httpServer.close()
  }

  return { app, httpServer, io, close, rooms }
}
