import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
  for (const player of players) player.ready = true
  return maybeStartRound(players, round, now)
}

test('a new round waits for players and reports the default 30 seconds', () => {
  const round = createRoundState(30)
  const state = publicRoundState(round, [], 1000)
  assert.equal(state.phase, 'waiting')
  assert.equal(state.roundSeconds, 30)
  assert.equal(state.secondsLeft, 30)
  assert.equal(state.minPlayers, 2)
  assert.deepEqual(state.readyIds, [])
})

test('a room is closed only while the round timer is running', () => {
  const round = createRoundState(30)
  assert.equal(canJoinRound(round), true)
  round.phase = 'playing'
  assert.equal(canJoinRound(round), false)
  round.phase = 'finished'
  assert.equal(canJoinRound(round), true)
})

test('one driver cannot start the timer, even when ready', () => {
  const round = createRoundState(30)
  const players = [driver('a')]
  assert.equal(setPlayerReady(players, round, 'a', true, 1000).started, false)
  assert.equal(round.phase, 'waiting')
  assert.equal(round.endsAt, 0)
})

test('two drivers must both indicate ready before the timer starts', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  assert.equal(setPlayerReady(players, round, 'a', true, 1000).started, false)
  assert.equal(round.phase, 'waiting')

  const result = setPlayerReady(players, round, 'b', true, 1500)
  assert.equal(result.started, true)
  assert.equal(round.phase, 'playing')
  assert.equal(round.endsAt, 1500 + 30000)
  assert.equal(isRoundActive(round), true)
  assert.ok(players.every((player) => player.ready === false))
})

test('the countdown reports whole seconds and stops at zero', () => {
  const round = createRoundState(30)
  const players = [driver('a'), driver('b')]
  startRound(players, round, 0)
  assert.equal(publicRoundState(round, players, 1000).secondsLeft, 29)
  assert.equal(publicRoundState(round, players, 29999).secondsLeft, 1)
  assert.equal(publicRoundState(round, players, 30000).secondsLeft, 0)
})

test('the driver with the most tags wins when time expires', () => {
  const round = createRoundState(10)
  const players = [driver('a', 'Neon Falcon'), driver('b', 'Golden Kite')]
  startRound(players, round, 1000)
  players[0].tags = 3
  players[1].tags = 1

  assert.equal(maybeFinishRound(players, round, 10099), false)
  assert.equal(round.phase, 'playing')
  assert.equal(maybeFinishRound(players, round, 11000), true)
  assert.equal(round.phase, 'finished')
  assert.deepEqual(round.winnerIds, ['a'])
  assert.equal(round.standings[0].name, 'Neon Falcon')
  assert.equal(round.standings[0].tags, 3)
  assert.equal(publicRoundState(round, players, 11000).secondsLeft, 0)
})

test('ties share the win and a scoreless round has no winner', () => {
  const tied = createRoundState(10)
  const players = [driver('a'), driver('b')]
  startRound(players, tied, 0)
  players[0].tags = 2
  players[1].tags = 2
  maybeFinishRound(players, tied, 10000)
  assert.deepEqual(tied.winnerIds, ['a', 'b'])

  const scoreless = createRoundState(10)
  const idle = [driver('a'), driver('b')]
  startRound(idle, scoreless, 0)
  maybeFinishRound(idle, scoreless, 10000)
  assert.deepEqual(scoreless.winnerIds, [])
})

test('a finished round requires fresh ready signals before it restarts', () => {
  const round = createRoundState(10)
  const players = [driver('a'), driver('b')]
  startRound(players, round, 0)
  players[0].tags = 4
  maybeFinishRound(players, round, 10000)
  assert.equal(setPlayerReady(players, round, 'a', true, 11000).started, false)
  assert.equal(setPlayerReady(players, round, 'b', true, 12000).started, true)
  assert.equal(round.phase, 'playing')
  assert.ok(players.every((player) => player.tags === 0))
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
  maybeFinishRound(players, round, 10000)
  players.length = 0

  handlePlayerLeft(players, round, 'b', 11000)
  assert.equal(round.phase, 'waiting')
  assert.deepEqual(round.winnerIds, [])
})
