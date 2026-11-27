import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { io } from 'socket.io-client'
import { createGameServer } from '../server/src/create-game-server.js'

const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

let httpServer
let closeServer
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
