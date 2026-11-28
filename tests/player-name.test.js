import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRandomName,
  loadPlayerName,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_STORAGE_KEY,
  savePlayerName,
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

test('storage helpers fall back safely without a browser', () => {
  assert.equal(loadPlayerName(), null)
  assert.equal(savePlayerName('  Ada   Racer  '), 'Ada Racer')
  assert.equal(PLAYER_NAME_STORAGE_KEY, 'neon-drive:player-name')
})

test('chosen names are saved to and loaded from localStorage', () => {
  const previousWindow = globalThis.window
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
  }
  try {
    assert.equal(loadPlayerName(), null)
    assert.equal(savePlayerName('  Ada   Racer  '), 'Ada Racer')
    assert.equal(store.get(PLAYER_NAME_STORAGE_KEY), 'Ada Racer')
    assert.equal(loadPlayerName(), 'Ada Racer')

    assert.equal(savePlayerName('Turbo Comet 42'), 'Turbo Comet 42')
    assert.equal(loadPlayerName(), 'Turbo Comet 42')

    // Clearing an invalid choice removes the saved value entirely.
    assert.equal(savePlayerName('   '), null)
    assert.equal(store.has(PLAYER_NAME_STORAGE_KEY), false)
    assert.equal(loadPlayerName(), null)

    store.set(PLAYER_NAME_STORAGE_KEY, 'Ada\nRacer')
    assert.equal(loadPlayerName(), null)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('blocked storage does not break the name helpers', () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error('storage blocked')
      },
      setItem() {
        throw new Error('storage blocked')
      },
      removeItem() {
        throw new Error('storage blocked')
      },
    },
  }
  try {
    assert.equal(loadPlayerName(), null)
    assert.equal(savePlayerName('Ada Racer'), 'Ada Racer')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
