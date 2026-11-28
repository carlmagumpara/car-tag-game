import assert from 'node:assert/strict'
import test from 'node:test'
import {
  armCountdown,
  canJoinRound,
  createRoundState,
  handlePlayerLeft,
  isRoundActive,
  maybeFinishRound,
  maybeStartRound,
  publicRoundState,
  setPlayerReady,
} from '../src/round.js'

const driver = (id, name = id) => ({ id, name, tags: 0, ready: false })

function startRound(players, round, now) {
  armCountdown(round, players, now)
  return maybeStartRound(players, round, now + round.countdownMs)
}

test('a new round waits for players and reports its configured duration', () => {
  const round = createRoundState(30)
  const state = publicRoundState(round, [], 1000)
  assert.equal(state.phase, 'waiting')
  assert.equal(state.roundSeconds, 30)
  assert.equal(state.secondsLeft, 30)
  assert.equal(state.minPlayers, 2)
  assert.deepEqual(state.readyIds, [])
  assert.equal(state.loserId, null)
})

test('anyone may join a room, including while a round is playing', () => {
  const round = createRoundState(30)
  assert.equal(canJoinRound(round), true)
  round.phase = 'playing'
  assert.equal(canJoinRound(round), true)
  round.phase = 'countdown'
  assert.equal(canJoinRound(round), true)
})

test('one driver cannot arm the pre-round countdown', () => {
  const round = createRoundState(30)
  const players = [driver('a')]
  assert.equal(armCountdown(round, players, 1000), false)
  assert.equal(round.phase, 'waiting')
  assert.equal(round.nextRoundAt, 0)
})

test('two drivers start a round automatically after the countdown', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  assert.equal(armCountdown(round, players, 1000), true)
  assert.equal(round.phase, 'countdown')
  assert.equal(round.nextRoundAt, 4000)
  assert.equal(armCountdown(round, players, 2000), false)
  assert.equal(maybeStartRound(players, round, 3999), false)
  assert.equal(maybeStartRound(players, round, 4000), true)
  assert.equal(round.phase, 'playing')
  assert.equal(round.endsAt, 4000 + 30000)
  assert.equal(isRoundActive(round), true)
  assert.ok(players.every((player) => player.ready === false))
})

test('readiness arms or cancels the countdown', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  assert.deepEqual(setPlayerReady(players, round, 'a', true, 1000), {
    changed: true,
    started: false,
    cancelled: false,
  })
  assert.equal(round.phase, 'countdown')
  setPlayerReady(players, round, 'b', true, 1050)
  assert.deepEqual(setPlayerReady(players, round, 'b', false, 1100), {
    changed: true,
    started: false,
    cancelled: true,
  })
  assert.equal(round.phase, 'waiting')
  assert.equal(round.nextRoundAt, 0)
  assert.deepEqual(setPlayerReady(players, round, 'b', true, 1200), {
    changed: true,
    started: false,
    cancelled: false,
  })
  assert.equal(round.phase, 'countdown')
})

test('the countdown reports whole seconds from the shared end time', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  armCountdown(round, players, 1000)
  assert.equal(publicRoundState(round, players, 1500).secondsLeft, 3)
  assert.equal(publicRoundState(round, players, 4000).secondsLeft, 0)
  maybeStartRound(players, round, 4000)
  assert.equal(publicRoundState(round, players, 5000).secondsLeft, 29)
  assert.equal(publicRoundState(round, players, 33999).secondsLeft, 1)
  assert.equal(publicRoundState(round, players, 34000).secondsLeft, 0)
})

test('the driver who is it when time expires loses, even with the most tags', () => {
  const round = createRoundState(10)
  const players = [driver('a', 'Neon Falcon'), driver('b', 'Golden Kite')]
  startRound(players, round, 1000)
  players[0].tags = 3
  players[1].tags = 1

  assert.equal(maybeFinishRound(players, round, 13999, 'a'), false)
  assert.equal(round.phase, 'playing')
  assert.equal(maybeFinishRound(players, round, 14000, 'a'), true)
  assert.equal(round.phase, 'finished')
  assert.equal(round.loserId, 'a')
  assert.deepEqual(round.winnerIds, ['b'])
  assert.equal(round.standings[0].name, 'Neon Falcon')
  assert.equal(round.standings[0].tags, 3)
  assert.equal(publicRoundState(round, players, 14000).secondsLeft, 0)
})

test('a finished round arms its own countdown and resets scores on start', () => {
  const round = createRoundState(10)
  const players = [driver('a'), driver('b')]
  startRound(players, round, 0)
  players[0].tags = 4
  maybeFinishRound(players, round, 13000, 'b')

  round.nextRoundAt = 0
  // The results screen is held before the countdown can be armed.
  assert.equal(armCountdown(round, players, 14000), false)
  assert.equal(round.phase, 'finished')
  assert.equal(setPlayerReady(players, round, 'a', true, 16000).started, false)
  assert.equal(round.phase, 'countdown')
  assert.equal(maybeStartRound(players, round, 19000), true)
  assert.ok(players.every((player) => player.tags === 0))
  assert.equal(round.loserId, null)
})

test('losing a driver aborts an active round and clears its scores', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  startRound(players, round, 0)
  players[0].tags = 2
  players.splice(1, 1)

  const result = handlePlayerLeft(players, round, 'b', 5000)
  assert.equal(result.aborted, true)
  assert.equal(round.phase, 'waiting')
  assert.equal(round.endsAt, 0)
  assert.equal(players[0].tags, 0)
  assert.deepEqual(round.standings, [])
})

test('an empty lobby forgets a finished round so new players can start', () => {
  const round = createRoundState(10)
  const players = [driver('a'), driver('b')]
  startRound(players, round, 0)
  maybeFinishRound(players, round, 13000, 'a')
  players.length = 0

  handlePlayerLeft(players, round, 'b', 11000)
  assert.equal(round.phase, 'waiting')
  assert.deepEqual(round.winnerIds, [])
  assert.equal(round.loserId, null)
})
