import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRandomName,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
} from '../src/features/car-game/game/player-name.js'

test('names are trimmed, whitespace-normalized and capped', () => {
  assert.equal(normalizePlayerName('  Ada   Racer  '), 'Ada Racer')
  assert.equal(normalizePlayerName('a'.repeat(50)).length, PLAYER_NAME_MAX_LENGTH)
})

test('empty and malformed names are rejected', () => {
  for (const value of [null, undefined, 42, '', '   ', 'Ada\nRacer']) {
    assert.equal(normalizePlayerName(value), null)
  }
})

test('random names use the shared format and fit the limit', () => {
  const adjectives = ['Neon', 'Swift', 'Midnight', 'Turbo', 'Cloudy', 'Electric', 'Golden', 'Quiet', 'Cosmic']
  for (let index = 0; index < 50; index += 1) {
    const name = createRandomName()
    assert.match(name, /^[A-Za-z]+ [A-Za-z]+ \d{2}$/)
    assert.ok(adjectives.some((word) => name.startsWith(word)))
    assert.ok(name.length <= PLAYER_NAME_MAX_LENGTH)
  }
})
