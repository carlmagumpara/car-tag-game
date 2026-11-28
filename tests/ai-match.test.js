import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AI_MATCH,
  applyAiTag,
  armAiCountdown,
  assignAiIt,
  canAiDrive,
  createAiMatch,
  evaluateAiTag,
  maybeFinishAiRound,
  maybeStartAiRound,
  publicAiGame,
  setAiReady,
} from '../src/features/car-game/game/ai-match.js'
import { IMMUNITY_MS, TAG_COOLDOWN_MS } from '../src/features/car-game/game/constants.js'

const driver = (id, overrides = {}) => ({
  id,
  name: id,
  x: 0,
  y: 0,
  isIt: false,
  tags: 0,
  ready: false,
  immuneUntil: 0,
  ...overrides,
})

function startRound(match, players, now = 1000) {
  armAiCountdown(match, players, now)
  return maybeStartAiRound(match, players, now + match.countdownMs)
}

test('local timers mirror the multiplayer defaults', () => {
  assert.equal(AI_MATCH.tagCooldownMs, TAG_COOLDOWN_MS)
  assert.equal(AI_MATCH.tagCooldownMs, 1000)
  assert.equal(AI_MATCH.immunityMs, IMMUNITY_MS)
  assert.equal(AI_MATCH.immunityMs, 2000)
  assert.equal(AI_MATCH.roundSeconds, 90)
})

test('a new match waits for the countdown before playing', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assert.equal(match.phase, 'waiting')
  assert.equal(match.roundSeconds, AI_MATCH.roundSeconds)

  const first = setAiReady(match, players, 'you', true, 1000)
  assert.deepEqual(first, { changed: true, started: false, cancelled: false })
  assert.equal(match.phase, 'countdown')

  setAiReady(match, players, 'ai', true, 1000)
  assert.equal(maybeStartAiRound(match, players, 3999), false)
  assert.equal(maybeStartAiRound(match, players, 4000), true)
  assert.equal(match.phase, 'playing')
  assert.equal(match.endsAt, 4000 + match.roundSeconds * 1000)
  assert.ok(players.every((player) => player.ready === false && player.tags === 0))
})

test('the rival stays parked until the player readies up', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')

  assert.equal(canAiDrive(match), false)
  setAiReady(match, players, 'you', true, 1000)
  assert.equal(canAiDrive(match), true)

  // Cancelling READY parks the rival again.
  setAiReady(match, players, 'you', false, 1100)
  assert.equal(canAiDrive(match), false)

  startRound(match, players, 4000)
  assert.equal(canAiDrive(match), true)

  maybeFinishAiRound(match, players, match.endsAt, 'ai')
  assert.equal(canAiDrive(match), false)
})

test('the AI starts as it and readiness cannot change mid-round', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  assert.equal(match.itId, 'ai')
  assert.equal(players[1].isIt, true)
  assert.equal(players[0].isIt, false)

  startRound(match, players)
  assert.deepEqual(setAiReady(match, players, 'you', false, 5000), {
    changed: false,
    started: false,
    cancelled: false,
  })
})

test('a ready cancel stops the countdown', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  setAiReady(match, players, 'you', true, 1000)
  assert.deepEqual(setAiReady(match, players, 'you', false, 1100), {
    changed: true,
    started: false,
    cancelled: true,
  })
  assert.equal(match.phase, 'waiting')
  assert.equal(match.nextRoundAt, 0)
})

test('tags transfer with a global gate, immunity and only while playing', () => {
  const match = createAiMatch(1000)
  const players = [driver('you', { x: 10 }), driver('ai', { x: 20, isIt: true })]
  assignAiIt(match, players, 'ai')
  assert.equal(evaluateAiTag(match, players, 1000), null)

  startRound(match, players)
  const now = 5000
  const hit = evaluateAiTag(match, players, now)
  assert.equal(hit.taggerId, 'ai')
  assert.equal(hit.taggedId, 'you')
  assert.equal(hit.reason, 'tag')

  assert.equal(applyAiTag(match, players, hit, now), true)
  assert.equal(players[1].tags, 1)
  assert.equal(players[1].isIt, false)
  assert.equal(players[0].isIt, true)
  assert.equal(match.itId, 'you')
  assert.equal(players[0].immuneUntil, now + AI_MATCH.immunityMs)
  assert.equal(match.tagEvent.immunityMs, AI_MATCH.immunityMs)
  assert.equal(evaluateAiTag(match, players, now + AI_MATCH.tagCooldownMs - 1), null)
  // Still touching the same pair: the contact latch also blocks a tag-back.
  assert.equal(evaluateAiTag(match, players, now + AI_MATCH.tagCooldownMs), null)
  players[1].x = 500
  evaluateAiTag(match, players, now + AI_MATCH.tagCooldownMs)
  players[1].x = 20
  assert.ok(evaluateAiTag(match, players, now + AI_MATCH.tagCooldownMs + 1))
})

test('continuous contact only tags once', () => {
  const match = createAiMatch(1000)
  const players = [driver('you', { x: 10 }), driver('ai', { x: 20, isIt: true })]
  assignAiIt(match, players, 'ai')
  startRound(match, players)
  applyAiTag(match, players, evaluateAiTag(match, players, 5000), 5000)

  players[1].isIt = true
  players[0].isIt = false
  players[0].immuneUntil = 0
  match.itId = 'ai'
  match.cooldownUntil = 0
  assert.equal(evaluateAiTag(match, players, 6000), null)
  assert.equal(evaluateAiTag(match, players, 6500), null)

  players[0].x = 500
  evaluateAiTag(match, players, 7000)
  players[0].x = 10
  assert.ok(evaluateAiTag(match, players, 8000))
})

test('whoever holds it at zero loses, regardless of tag counts', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  startRound(match, players)

  players[1].tags = 3
  players[0].tags = 1
  match.endsAt = 1500
  assert.equal(maybeFinishAiRound(match, players, 1499, 'ai'), false)
  assert.equal(maybeFinishAiRound(match, players, 1500, 'ai'), true)
  assert.equal(match.phase, 'finished')
  assert.equal(match.loserId, 'ai')
  assert.deepEqual(match.winnerIds, ['you'])
  assert.deepEqual(match.standings.map((entry) => entry.tags), [3, 1])
})

test('a finished local round waits for READY before the next one', () => {
  const match = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  startRound(match, players, 1000)
  maybeFinishAiRound(match, players, match.endsAt, 'ai')
  const holdEnd = match.finishedAt + match.resultHoldMs

  // No auto-countdown: without the human's confirmation the match stays done.
  assert.equal(armAiCountdown(match, players, holdEnd), false)
  assert.equal(armAiCountdown(match, players, holdEnd + 10000), false)
  assert.equal(match.phase, 'finished')
  assert.equal(match.nextRoundAt, 0)

  // READY during the results hold is honored once the hold expires. The local
  // hook mirrors the human's choice onto the rival, as it does in the UI.
  setAiReady(match, players, 'you', true, match.finishedAt + 100)
  setAiReady(match, players, 'ai', true, match.finishedAt + 100)
  assert.equal(armAiCountdown(match, players, holdEnd), true)
  assert.equal(match.phase, 'countdown')
  assert.ok(players.every((player) => player.ready))
  assert.equal(
    maybeStartAiRound(match, players, holdEnd + match.countdownMs),
    true,
  )
  assert.equal(match.phase, 'playing')
})

test('public game state matches the multiplayer payload shape', () => {
  const match = createAiMatch(1000, 60)
  const players = [driver('you'), driver('ai')]
  assignAiIt(match, players, 'ai')
  setAiReady(match, players, 'you', true, 1000)

  const waiting = publicAiGame(match, players, 1000)
  assert.equal(waiting.phase, 'countdown')
  assert.equal(waiting.secondsLeft, 3)
  assert.equal(waiting.minPlayers, 2)
  assert.deepEqual(waiting.readyIds, ['you'])
  assert.deepEqual(waiting.winnerIds, [])
  assert.deepEqual(waiting.standings, [])
  assert.equal(waiting.loserId, null)

  maybeStartAiRound(match, players, 4000)
  assert.equal(publicAiGame(match, players, 7000).secondsLeft, 57)
})

test('a fresh match resets scores, ready flags and the tagger', () => {
  const old = createAiMatch(1000)
  const players = [driver('you'), driver('ai')]
  assignAiIt(old, players, 'ai')
  startRound(old, players)
  players[1].tags = 4

  const next = createAiMatch(5000)
  assignAiIt(next, players, 'ai')
  assert.equal(next.phase, 'waiting')
  assert.equal(next.cooldownUntil, 0)
  assert.deepEqual(next.winnerIds, [])
  assert.equal(players[1].tags, 4) // scores are cleared on start, not on construction
  startRound(next, players, 5000)
  assert.ok(players.every((player) => player.tags === 0))
})
