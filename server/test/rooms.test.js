import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROOM_ID_PATTERN,
  RoomManager,
  createRoomId,
  normalizeRoomId,
} from '../src/rooms.js'

function makeManager(options = {}) {
  return new RoomManager({ maxPlayers: 10, roundSeconds: 30, maxRooms: 3, ...options })
}

test('generated ids are unique and shareable', () => {
  const ids = []
  for (let index = 0; index < 100; index += 1) {
    const id = createRoomId(ids)
    assert.match(id, ROOM_ID_PATTERN)
    assert.equal(ids.includes(id), false)
    ids.push(id)
  }
  assert.equal(new Set(ids).size, ids.length)
})

test('normalizing codes matches the client rules', () => {
  assert.equal(normalizeRoomId(' abc234 '), 'ABC234')
  assert.equal(normalizeRoomId('AB1CDE'), null)
  assert.equal(normalizeRoomId('short'), null)
})

test('rooms are created by code and reused on subsequent joins', () => {
  const manager = makeManager()
  const first = manager.getOrCreate('abc234')
  const second = manager.getOrCreate('ABC234')

  assert.equal(first.id, 'ABC234')
  assert.equal(second, first)
  assert.equal(manager.size, 1)
  assert.deepEqual(manager.ids(), ['ABC234'])
})

test('each room owns independent player, tag and round state', () => {
  const manager = makeManager()
  const a = manager.getOrCreate('AAAAAA')
  const b = manager.getOrCreate('BBBBBB')

  a.store.add('one')
  a.tagState.itId = 'one'
  a.round.phase = 'playing'
  a.limiters.set('one', () => {})
  a.chatLimiters.set('one', () => {})
  a.voicePeers.set('one', { muted: false })

  assert.equal(b.store.size, 0)
  assert.equal(b.tagState.itId, null)
  assert.equal(b.round.phase, 'waiting')
  assert.equal(b.limiters.size, 0)
  assert.equal(b.chatLimiters.size, 0)
  assert.equal(b.voiceLimiters.size, 0)
  assert.equal(b.voicePeers.size, 0)
})

test('an invalid code creates a fresh room with a valid generated id', () => {
  const manager = makeManager()
  const room = manager.getOrCreate('not-a-code!')

  assert.match(room.id, ROOM_ID_PATTERN)
  assert.equal(manager.get(room.id), room)
})

test('existing rooms can still be joined at the room cap', () => {
  const manager = makeManager()
  const first = manager.getOrCreate('AAAAAA')
  manager.getOrCreate('BBBBBB')
  manager.getOrCreate('CCCCCC')

  assert.equal(manager.create(), null)
  assert.equal(manager.getOrCreate('DDDDDD'), null)
  assert.equal(manager.getOrCreate('AAAAAA'), first)
})

test('removing a room frees its code and slot', () => {
  const manager = makeManager()
  const room = manager.getOrCreate('AAAAAA')

  assert.equal(manager.remove(room.id), true)
  assert.equal(manager.get(room.id), null)
  assert.equal(manager.remove(room.id), false)
  assert.equal(manager.create('AAAAAA').id, 'AAAAAA')
})
