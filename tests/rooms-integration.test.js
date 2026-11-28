import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { io } from 'socket.io-client'
import { createGameServer } from '../server/src/create-game-server.js'

const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

let httpServer
let closeServer
let rooms
let port
const sockets = []

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function once(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)
    const handler = (payload) => {
      cleanup()
      resolve(payload)
    }
    function cleanup() {
      clearTimeout(timer)
      socket.off(event, handler)
    }
    socket.on(event, handler)
  })
}

function waitForPhase(socket, phase, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for phase ${phase}`))
    }, timeoutMs)
    const handler = (payload) => {
      if (payload?.phase !== phase) return
      cleanup()
      resolve(payload)
    }
    function cleanup() {
      clearTimeout(timer)
      socket.off('game:state', handler)
    }
    socket.on('game:state', handler)
  })
}

function connect(roomId, extraAuth = {}) {
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    auth: { roomId, ...extraAuth },
  })
  sockets.push(socket)
  return socket
}

before(async () => {
  const server = createGameServer()
  httpServer = server.httpServer
  closeServer = server.close
  rooms = server.rooms
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  port = httpServer.address().port
})

after(async () => {
  for (const socket of sockets) socket.disconnect()
  await sleep(20)
  const closed = new Promise((resolve) => httpServer.once('close', resolve))
  closeServer()
  await Promise.race([closed, sleep(1000)])
})

test('game:init echoes the requested room and shares only its players', async () => {
  const a = connect('AAAAAA')
  const initA = await once(a, 'game:init')
  assert.equal(initA.roomId, 'AAAAAA')
  assert.deepEqual(initA.players, [])

  const b = connect('BBBBBB')
  const initB = await once(b, 'game:init')
  assert.equal(initB.roomId, 'BBBBBB')
  assert.deepEqual(initB.players, [])

  let joinsSeenByA = 0
  a.on('player:joined', () => {
    joinsSeenByA += 1
  })
  const joinSeenByB = once(b, 'player:joined')

  const c = connect('BBBBBB')
  const initC = await once(c, 'game:init')
  assert.equal(initC.roomId, 'BBBBBB')
  assert.equal(initC.players.length, 1)
  assert.equal(initC.players[0].id, initB.id)

  const joined = await joinSeenByB
  assert.equal(joined.id, c.id)
  await sleep(150)
  assert.equal(joinsSeenByA, 0)
})

test('a missing or malformed code gets a fresh generated room', async () => {
  const socket = connect('bad!!')
  const init = await once(socket, 'game:init')
  assert.match(init.roomId, ROOM_ID_PATTERN)
  assert.deepEqual(init.players, [])
})

test('a chosen car color is assigned and shared with the rest of the room', async () => {
  const a = connect('KART23', { carColor: '#F97316' })
  const initA = await once(a, 'game:init')
  assert.equal(initA.player.color, '#f97316')

  const b = connect('KART23', { carColor: 'not-a-color' })
  const initB = await once(b, 'game:init')
  assert.equal(initB.players[0].color, '#f97316')
  assert.match(initB.player.color, /^#[0-9a-f]{6}$/)
  assert.notEqual(initB.player.color, '#f97316')
})

test('simultaneous contact produces exactly one tag and one tagger', async () => {
  const a = connect('TAGAAA')
  const started = waitForPhase(a, 'playing', 8000)
  const b = connect('TAGAAA')
  const c = connect('TAGAAA')
  const inits = await Promise.all([
    once(a, 'game:init', 8000),
    once(b, 'game:init', 8000),
    once(c, 'game:init', 8000),
  ])
  await started
  // The fresh tagger starts with a short global gate.
  await sleep(1100)

  const room = rooms.get('TAGAAA')
  const socketsById = new Map(inits.map((init, index) => [init.id, [a, b, c][index]]))
  const hits = []
  a.on('tag:hit', (payload) => hits.push(payload))

  const tagger = room.store.snapshot().find((player) => player.isIt)
  const others = room.store.snapshot().filter((player) => player.id !== tagger.id)
  socketsById.get(tagger.id).emit('player:move', { x: 1700, y: 1200, angle: 0, speed: 0 })
  others.forEach((player, index) => {
    socketsById.get(player.id).emit('player:move', {
      x: 1702 + index * 2,
      y: 1200,
      angle: 0,
      speed: 0,
    })
  })
  await sleep(250)

  assert.equal(hits.length, 1)
  assert.equal(room.store.snapshot().filter((player) => player.isIt).length, 1)
  assert.ok(hits[0].immunityMs > 0)
  assert.ok(hits[0].immuneUntil > Date.now())
})

test('health reports active rooms and total players', async () => {
  const socket = connect('HEALTH')
  await once(socket, 'game:init')
  const response = await fetch(`http://127.0.0.1:${port}/health`)
  const body = await response.json()

  assert.equal(body.status, 'ok')
  assert.ok(body.roomIds.includes('HEALTH'))
  assert.ok(body.rooms >= 1)
  assert.ok(body.players >= 1)
})

test('a chosen handshake name is used and kept unique in the room', async () => {
  // Join sequentially: the server suffixes duplicate names in connect order,
  // so concurrent joins would make the expected suffix nondeterministic.
  const a = connect('NAMERZ', { name: 'Ada Racer' })
  const initA = await once(a, 'game:init')
  const b = connect('NAMERZ', { name: '  Ada   Racer  ' })
  const initB = await once(b, 'game:init')
  const c = connect('NAMERZ')
  const initC = await once(c, 'game:init')

  assert.equal(initA.player.name, 'Ada Racer')
  assert.equal(initB.player.name, 'Ada Racer 2')
  assert.match(initC.player.name, /^[A-Za-z]+ [A-Za-z]+ \d{2}$/)
})

test('chat is room-scoped and attributed with server-owned identity', async () => {
  const a = connect('CHATAA', { carColor: '#f97316' })
  const b = connect('CHATAA')
  const outsider = connect('CHATBB')
  await Promise.all([once(a, 'game:init'), once(b, 'game:init'), once(outsider, 'game:init')])

  const receivedByB = once(b, 'chat:message')
  let outsiderSawMessage = false
  outsider.on('chat:message', () => {
    outsiderSawMessage = true
  })

  a.emit('chat:send', { text: '  hello drivers  ' })
  const message = await receivedByB
  assert.equal(message.text, 'hello drivers')
  assert.equal(message.playerId, a.id)
  assert.equal(message.color, '#f97316')
  assert.match(message.name, /^[A-Za-z]+ [A-Za-z]+ \d{2}$/)
  assert.ok(message.at > 0)
  await sleep(100)
  assert.equal(outsiderSawMessage, false)
})

test('empty chat messages are rejected without a broadcast', async () => {
  const a = connect('CHATCC')
  await once(a, 'game:init')
  const error = once(a, 'game:error')
  a.emit('chat:send', { text: '   ' })
  const payload = await error
  assert.equal(payload.code, 'INVALID_CHAT')
})

test('voice peers and signaling stay inside the room and require opt-in', async () => {
  const a = connect('RACERZ')
  const b = connect('RACERZ')
  const outsider = connect('RACERX')
  await Promise.all([once(a, 'game:init'), once(b, 'game:init'), once(outsider, 'game:init')])

  let earlyOfferSeen = false
  b.on('voice:offer', () => {
    earlyOfferSeen = true
  })
  a.emit('voice:offer', { to: b.id, sdp: 'v=0' })
  await sleep(80)
  assert.equal(earlyOfferSeen, false)

  const peersForB = once(b, 'voice:peers')
  a.emit('voice:state', { enabled: true, muted: false })
  assert.deepEqual((await peersForB).peers, [{ id: a.id, muted: false }])

  const offerForA = once(a, 'voice:offer')
  let outsiderSawOffer = false
  outsider.on('voice:offer', () => {
    outsiderSawOffer = true
  })
  b.emit('voice:state', { enabled: true, muted: true })
  await once(b, 'voice:peers')
  const sdp = 'v=0\r\na=sendrecv\r\n'
  b.emit('voice:offer', { to: a.id, sdp })
  const offer = await offerForA
  assert.equal(offer.from, b.id)
  assert.equal(offer.sdp, sdp)
  await sleep(80)
  assert.equal(outsiderSawOffer, false)

  const peersForA = once(a, 'voice:peers')
  b.disconnect()
  assert.deepEqual((await peersForA).peers, [{ id: a.id, muted: false }])
})

test('a newcomer joins mid-round and receives the live round state', async () => {
  const a = connect('PLAYAA')
  // Subscribe before the second driver connects: the countdown starts on that
  // join, so a slow init must not hide the later phase broadcasts.
  const started = waitForPhase(a, 'playing', 8000)
  const b = connect('PLAYAA')
  const waitInitA = once(a, 'game:init', 8000)
  const waitInitB = once(b, 'game:init', 8000)
  const initA = await waitInitA
  await waitInitB
  assert.equal(initA.config.roundSeconds, 90)
  assert.equal(initA.config.tag.cooldownMs, 1000)
  assert.equal(initA.config.tag.immunityMs, 2000)

  a.emit('player:ready', { ready: true })
  b.emit('player:ready', { ready: true })
  await started

  const late = connect('PLAYAA')
  const init = await once(late, 'game:init', 8000)
  assert.equal(init.roomId, 'PLAYAA')
  assert.equal(init.round.phase, 'playing')
  assert.ok(init.round.secondsLeft > 0 && init.round.secondsLeft <= 90)
  assert.ok(init.players.some((player) => player.id === a.id))
  assert.ok(init.players.some((player) => player.id === b.id))
  assert.equal(init.players.filter((player) => player.isIt).length, 1)

  // The losing driver is the one holding "it" when the clock expires.
  const room = rooms.get('PLAYAA')
  room.round.endsAt = Date.now() - 1
  const finished = waitForPhase(a, 'finished', 6000)
  const state = await finished
  assert.equal(state.loserId, room.tagState.itId)
  assert.ok(!state.winnerIds.includes(state.loserId))
})

test('a finished round waits for READY instead of arming the next countdown', async () => {
  const a = connect('WA2TAA')
  const started = waitForPhase(a, 'playing', 8000)
  const b = connect('WA2TAA')
  await Promise.all([once(a, 'game:init', 8000), once(b, 'game:init', 8000)])
  await started

  const room = rooms.get('WA2TAA')
  room.round.endsAt = Date.now() - 1
  const finished = await waitForPhase(a, 'finished', 6000)
  assert.equal(finished.phase, 'finished')

  // Skip the results hold: the room must still not arm a countdown by itself.
  room.round.finishedAt = Date.now() - 6000
  await sleep(250)
  const idle = rooms.get('WA2TAA').round
  assert.equal(idle.phase, 'finished')
  assert.equal(idle.nextRoundAt, 0)

  const countdown = waitForPhase(a, 'countdown', 3000)
  a.emit('player:ready', { ready: true })
  assert.equal((await countdown).phase, 'countdown')
})
