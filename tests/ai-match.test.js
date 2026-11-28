import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AI_MATCH,
  applyAiTag,
  assignAiIt,
  createAiMatch,
  evaluateAiTag,
  maybeFinishAiRound,
  publicAiGame,
  setAiReady,
} from '../src/features/car-game/game/ai-match.js'

const driver = (id, overrides = {}) => ({
  id,
  name: id,
  x: 0,
  y: 0,
  isIt: false,
  tags: 0,
  ready: false,
  ...overrides,
})

const readyPair = (match, players, now = 1000) => {
  setAiReady(match, players, players[0].id, true, now)
  return setAiReady(match, players, players[1].id, true, now)
}

test('local matches use the same five-second tag immunity as multiplayer', () => {
  assert.equal(AI_MATCH.tagCooldownMs, 5000)
})

test('a new match waits for both drivers to ready up', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assert.equal(match.phase, 'waiting')
  assert.equal(match.roundSeconds, AI_MATCH.roundSeconds)

  const first = setAiReady(match, players, 'you', true, 1000)
  assert.deepEqual(first, { changed: true, started: false })
  assert.equal(match.phase, 'waiting')

  const second = setAiReady(match, players, 'ai', true, 1000)
  assert.equal(second.started, true)
  assert.equal(match.phase, 'playing')
  assert.equal(match.endsAt, 1000 + match.roundSeconds * 1000)
  assert.ok(players.every((player) => player.ready === false && player.tags === 0))
})

test('the AI starts as it and readiness cannot change mid-round', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  assert.equal(match.itId, 'ai')
  assert.equal(players[1].isIt, true)
  assert.equal(players[0].isIt, false)

  readyPair(match, players)
  assert.deepEqual(setAiReady(match, players, 'you', false, 1100), { changed: false, started: false })
})

test('tags transfer with a cooldown and only while playing', () => {
  const match = createAiMatch(1000)
  const players = [driver('you', { x: 10 }), driver('ai', { x: 20, isIt: true })]
  assignAiIt(match, players, 'ai')
  assert.equal(evaluateAiTag(match, players, 1000), null)

  readyPair(match, players)
  const hit = evaluateAiTag(match, players, 2000)
  assert.equal(hit.taggerId, 'ai')
  assert.equal(hit.taggedId, 'you')
  assert.equal(hit.reason, 'tag')

  assert.equal(applyAiTag(match, players, hit, 2000), true)
  assert.equal(players[1].tags, 1)
  assert.equal(players[1].isIt, false)
  assert.equal(players[0].isIt, true)
  assert.equal(match.itId, 'you')
  assert.equal(evaluateAiTag(match, players, 2000 + AI_MATCH.tagCooldownMs - 1), null)
  assert.ok(evaluateAiTag(match, players, 2000 + AI_MATCH.tagCooldownMs))
})

test('a finished round ranks drivers by tags and picks the top scorer', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  readyPair(match, players)

  players[1].tags = 3
  players[0].tags = 1
  match.endsAt = 1500
  assert.equal(maybeFinishAiRound(match, players, 1499), false)
  assert.equal(maybeFinishAiRound(match, players, 1500), true)
  assert.equal(match.phase, 'finished')
  assert.deepEqual(match.winnerIds, ['ai'])
  assert.deepEqual(match.standings.map((entry) => entry.tags), [3, 1])
})

test('a round with no tags has no winners', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  readyPair(match, players)
  match.endsAt = 1500
  maybeFinishAiRound(match, players, 1500)
  assert.deepEqual(match.winnerIds, [])
})

test('public game state matches the multiplayer payload shape', () => {
  const match = createAiMatch(1000, 60)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  setAiReady(match, players, 'you', true, 1000)

  const waiting = publicAiGame(match, players, 1000)
  assert.equal(waiting.phase, 'waiting')
  assert.equal(waiting.secondsLeft, 60)
  assert.equal(waiting.minPlayers, 2)
  assert.deepEqual(waiting.readyIds, ['you'])
  assert.deepEqual(waiting.winnerIds, [])
  assert.deepEqual(waiting.standings, [])

  setAiReady(match, players, 'ai', true, 1000)
  assert.equal(publicAiGame(match, players, 4000).secondsLeft, 57)
})

test('a fresh match resets scores, ready flags and the tagger', () => {
  const old = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(old, players, 'ai')
  readyPair(old, players)
  players[1].tags = 4

  const next = createAiMatch(5000)
  assignAiIt(next, players, 'ai')
  assert.equal(next.phase, 'waiting')
  assert.equal(next.cooldownUntil, 0)
  assert.deepEqual(next.winnerIds, [])
  assert.equal(players[1].tags, 4) // scores are cleared on start, not on construction
  readyPair(next, players, 5000)
  assert.ok(players.every((player) => player.tags === 0))
})
