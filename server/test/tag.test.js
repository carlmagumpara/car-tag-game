import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTag,
  createTagState,
  ensureIt,
  evaluateTag,
  publicTagState,
  removePlayer,
  resetTag,
} from '../src/tag.js'

const player = (id, x, y) => ({ id, x, y, isIt: false, tags: 0, immuneUntil: 0 })
const RADIUS = 38
const COOLDOWN = 1000
const IMMUNITY = 2000

function withRandom(value, fn) {
  const original = Math.random
  Math.random = () => value
  try {
    return fn()
  } finally {
    Math.random = original
  }
}

// Forces the first listed driver to be "it" for rules-focused tests; the
// random-selection test below covers the choice itself.
function ensureFirst(players, state, now, cooldownMs = COOLDOWN, immunityMs = IMMUNITY) {
  return withRandom(0, () => ensureIt(players, state, now, cooldownMs, immunityMs))
}

test('a lone driver becomes it automatically', () => {
  const state = createTagState()
  const players = [player('a', 100, 100)]
  const hit = ensureIt(players, state, 1000, COOLDOWN, IMMUNITY)
  assert.equal(hit.reason, 'reassign')
  assert.equal(hit.itId, 'a')
  assert.equal(players[0].isIt, true)
  assert.equal(state.itId, 'a')
})

test('the initial tagger is chosen at random', () => {
  const state = createTagState()
  const players = [player('a', 100, 100), player('b', 200, 100), player('c', 300, 100)]
  withRandom(0.99, () => ensureIt(players, state, 1000, COOLDOWN, IMMUNITY))
  assert.equal(state.itId, 'c')
  assert.deepEqual(players.map((item) => item.isIt), [false, false, true])

  withRandom(0.01, () => resetTag(players, state, 2000, COOLDOWN, IMMUNITY))
  assert.equal(state.itId, 'a')
  assert.deepEqual(players.map((item) => item.isIt), [true, false, false])
})

test('contact transfers it and increments the tagger score', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 130, 100)
  ensureFirst([a, b], state, 1000)
  state.cooldownUntil = 0

  const hit = evaluateTag([a, b], state, 5000, RADIUS)
  assert.equal(hit.taggerId, 'a')
  assert.equal(hit.taggedId, 'b')
  assert.equal(applyTag(hit, [a, b], state, 5000, COOLDOWN, IMMUNITY), true)
  assert.equal(a.isIt, false)
  assert.equal(b.isIt, true)
  assert.equal(a.tags, 1)
  assert.equal(state.itId, 'b')
  assert.equal(b.immuneUntil, 7000)
})

test('drivers outside the tag radius are safe', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 200, 100)
  ensureFirst([a, b], state, 1000)
  state.cooldownUntil = 0
  assert.equal(evaluateTag([a, b], state, 5000, RADIUS), null)
})

test('the global cooldown prevents an immediate tag-back', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  ensureFirst([a, b], state, 1000)
  state.cooldownUntil = 0
  const first = evaluateTag([a, b], state, 5000, RADIUS)
  applyTag(first, [a, b], state, 5000, COOLDOWN, IMMUNITY)
  assert.equal(evaluateTag([a, b], state, 5999, RADIUS), null)
  // After the gate, the contact latch still blocks an immediate tag-back until
  // the cars actually separate.
  assert.equal(evaluateTag([a, b], state, 6000, RADIUS), null)
  b.x = 500
  evaluateTag([a, b], state, 6001, RADIUS)
  b.x = 110
  assert.ok(evaluateTag([a, b], state, 6002, RADIUS))
})

test('immunity lasts two seconds and only protects the tagged driver', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  ensureFirst([a, b], state, 1000)
  state.cooldownUntil = 0
  const hit = evaluateTag([a, b], state, 5000, RADIUS)
  applyTag(hit, [a, b], state, 5000, 500, IMMUNITY)

  // Put "it" back on a while b's shield is active: b cannot be tagged, but a
  // can tag immune-free drivers once the global gate has closed.
  a.isIt = true
  b.isIt = false
  state.itId = 'a'
  state.cooldownUntil = 0
  state.contactKey = null
  assert.equal(evaluateTag([a, b], state, 5500, RADIUS), null)
  assert.equal(evaluateTag([a, b], state, 6999, RADIUS), null)
  assert.ok(evaluateTag([a, b], state, 7000, RADIUS))
})

test('continuous contact never transfers it twice', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  ensureFirst([a, b], state, 1000, 0, 0)
  state.cooldownUntil = 0
  applyTag(evaluateTag([a, b], state, 5000, RADIUS), [a, b], state, 5000, 0, 0)

  // Still touching: the contact latch blocks a repeat tag.
  a.isIt = true
  b.isIt = false
  state.itId = 'a'
  assert.equal(evaluateTag([a, b], state, 6000, RADIUS), null)
  assert.equal(evaluateTag([a, b], state, 6500, RADIUS), null)

  // Separation clears the latch, and a fresh bump counts again.
  assert.equal(evaluateTag([a, player('b', 500, 500)], state, 7000, RADIUS), null)
  b.x = 110
  b.y = 100
  assert.ok(evaluateTag([a, b], state, 8000, RADIUS))
})

test('a leaving tagger hands it to a random remaining driver', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 300, 300)
  const c = player('c', 500, 500)
  ensureFirst([a, b, c], state, 1000)
  const players = [a, b, c]

  const hit = withRandom(0.99, () =>
    removePlayer(players, state, 'a', 2000, COOLDOWN, IMMUNITY),
  )
  assert.equal(hit.reason, 'reassign')
  assert.equal(hit.itId, 'c')
  assert.equal(players.length, 2)
  assert.equal(c.isIt, true)
})

test('a fresh round clears immunity and the contact latch', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  b.immuneUntil = 9000
  state.contactKey = 'a|b'
  const hit = withRandom(0, () => resetTag([a, b], state, 10000, COOLDOWN, IMMUNITY))
  assert.equal(hit.itId, a.id)
  assert.equal(state.contactKey, null)
  assert.deepEqual([a.immuneUntil, b.immuneUntil], [12000, 0])
})

test('empty rooms have no tagger', () => {
  const state = createTagState()
  const players = []
  assert.equal(ensureIt(players, state, 1000, COOLDOWN, IMMUNITY), null)
  assert.equal(state.itId, null)
  assert.deepEqual(publicTagState(players), [])
})
