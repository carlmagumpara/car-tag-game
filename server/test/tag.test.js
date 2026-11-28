import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyTag,
  createTagState,
  ensureIt,
  evaluateTag,
  publicTagState,
  removePlayer,
} from '../src/tag.js'

const player = (id, x, y) => ({ id, x, y, isIt: false, tags: 0 })
const RADIUS = 38
const COOLDOWN = 5000

test('first driver becomes it automatically', () => {
  const state = createTagState()
  const players = [player('a', 100, 100)]
  const hit = ensureIt(players, state, 1000, COOLDOWN)
  assert.equal(hit.reason, 'reassign')
  assert.equal(hit.itId, 'a')
  assert.equal(players[0].isIt, true)
  assert.equal(state.itId, 'a')
})

test('contact transfers it and increments the tagger score', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 130, 100)
  ensureIt([a, b], state, 1000, COOLDOWN)
  state.cooldownUntil = 0

  const hit = evaluateTag([a, b], state, 5000, RADIUS, COOLDOWN)
  assert.equal(hit.taggerId, 'a')
  assert.equal(hit.taggedId, 'b')
  assert.equal(applyTag(hit, [a, b], state, 5000, COOLDOWN), true)
  assert.equal(a.isIt, false)
  assert.equal(b.isIt, true)
  assert.equal(a.tags, 1)
  assert.equal(state.itId, 'b')
})

test('drivers outside the tag radius are safe', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 200, 100)
  ensureIt([a, b], state, 1000, COOLDOWN)
  state.cooldownUntil = 0
  assert.equal(evaluateTag([a, b], state, 5000, RADIUS, COOLDOWN), null)
})

test('the cooldown prevents an immediate tag-back', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  ensureIt([a, b], state, 1000, COOLDOWN)
  state.cooldownUntil = 0
  const first = evaluateTag([a, b], state, 5000, RADIUS, COOLDOWN)
  applyTag(first, [a, b], state, 5000, COOLDOWN)
  assert.equal(evaluateTag([a, b], state, 5100, RADIUS, COOLDOWN), null)
  assert.ok(evaluateTag([a, b], state, 5000 + COOLDOWN + 1, RADIUS, COOLDOWN))
})

test('immunity lasts the full five seconds after a tag', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 110, 100)
  ensureIt([a, b], state, 1000, COOLDOWN)
  state.cooldownUntil = 0
  const hit = evaluateTag([a, b], state, 5000, RADIUS, COOLDOWN)
  applyTag(hit, [a, b], state, 5000, COOLDOWN)

  for (const at of [5000, 6000, 9000, 9999]) {
    assert.equal(evaluateTag([a, b], state, at, RADIUS, COOLDOWN), null)
  }
  assert.ok(evaluateTag([a, b], state, 10000, RADIUS, COOLDOWN))
})

test('leaving driver hands it to another player', () => {
  const state = createTagState()
  const a = player('a', 100, 100)
  const b = player('b', 300, 300)
  ensureIt([a, b], state, 1000, COOLDOWN)
  const players = [a, b]
  const hit = removePlayer(players, state, 'a', 2000, COOLDOWN)
  assert.equal(hit.reason, 'reassign')
  assert.equal(hit.itId, 'b')
  assert.equal(players.length, 1)
  assert.equal(b.isIt, true)
})

test('empty rooms have no tagger', () => {
  const state = createTagState()
  const players = []
  assert.equal(ensureIt(players, state, 1000, COOLDOWN), null)
  assert.equal(state.itId, null)
  assert.deepEqual(publicTagState(players), [])
})
