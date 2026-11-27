import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRoomId as createClientRoomId,
  isValidRoomId,
  normalizeRoomId,
  roomUrl,
} from '../src/features/car-game/game/room-id.js'
import {
  ROOM_ID_PATTERN,
  createRoomId as createServerRoomId,
  normalizeRoomId as normalizeServerRoomId,
} from '../server/src/rooms.js'

test('client and server generate the same six-character code format', () => {
  for (let index = 0; index < 200; index += 1) {
    const clientCode = createClientRoomId()
    const serverCode = createServerRoomId()
    assert.match(clientCode, ROOM_ID_PATTERN)
    assert.match(serverCode, ROOM_ID_PATTERN)
    assert.equal(isValidRoomId(serverCode), true)
    assert.equal(normalizeServerRoomId(clientCode), clientCode)
  }
})

test('codes avoid ambiguous characters', () => {
  for (let index = 0; index < 200; index += 1) {
    const code = createClientRoomId()
    assert.doesNotMatch(code, /[OI01]/)
  }
})

test('normalizing accepts lowercase and surrounding whitespace', () => {
  assert.equal(normalizeRoomId(' a2b3c4 '), 'A2B3C4')
  assert.equal(normalizeRoomId('n3qm24'), 'N3QM24')
})

test('normalizing rejects malformed codes', () => {
  for (const value of [null, undefined, 123, '', 'ABC12', 'ABCDEFG', 'AB1CDE', 'AB-234', 'AB O12']) {
    assert.equal(normalizeRoomId(value), null)
    assert.equal(isValidRoomId(value), false)
  }
})

test('roomUrl points at the game route for a code', () => {
  globalThis.window = {
    location: { origin: 'https://example.test', pathname: '/game/', search: '' },
  }
  try {
    assert.equal(roomUrl('ABC234'), 'https://example.test/game/#/game/ABC234')
  } finally {
    delete globalThis.window
  }
})
