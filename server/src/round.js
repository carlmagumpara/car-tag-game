// Pure round rules. The server owns the phase, timer, loser and standings;
// clients only receive the resulting state. A room needs at least MIN_PLAYERS
// drivers. Once that many are connected, a short countdown leads into the first
// round automatically; readiness can cancel or re-arm it. Later rounds wait for
// an explicit READY after the results hold.

export const MIN_PLAYERS = 2

export function createRoundState(roundSeconds, countdownMs = 3000, resultHoldMs = 2500) {
  return {
    phase: 'waiting', // waiting -> countdown -> playing -> finished -> countdown
    roundSeconds,
    countdownMs,
    resultHoldMs,
    endsAt: 0,
    finishedAt: 0,
    nextRoundAt: 0,
    loserId: null,
    winnerIds: [],
    standings: [],
  }
}

export function publicRoundState(round, players, now) {
  const secondsLeft =
    round.phase === 'playing'
      ? Math.max(0, Math.ceil((round.endsAt - now) / 1000))
      : round.phase === 'countdown'
        ? Math.max(0, Math.ceil((round.nextRoundAt - now) / 1000))
        : round.phase === 'finished'
          ? 0
          : round.roundSeconds

  return {
    phase: round.phase,
    roundSeconds: round.roundSeconds,
    secondsLeft,
    endsAt: round.endsAt,
    nextRoundAt: round.nextRoundAt,
    countdownMs: round.countdownMs,
    minPlayers: MIN_PLAYERS,
    readyIds: players.filter((player) => player.ready).map((player) => player.id),
    winnerIds: [...round.winnerIds],
    loserId: round.loserId,
    standings: round.standings.map((standing) => ({ ...standing })),
  }
}

export function isRoundActive(round) {
  return round.phase === 'playing'
}

// A room code is a shareable link, so a newcomer may join in any phase. The
// server sends them the live round and tag state in game:init on connection.
export function canJoinRound() {
  return true
}

export function resetRound(players, round) {
  round.phase = 'waiting'
  round.endsAt = 0
  round.finishedAt = 0
  round.nextRoundAt = 0
  round.loserId = null
  round.winnerIds = []
  round.standings = []
  for (const player of players) {
    player.ready = false
    player.tags = 0
  }
}

// Arms the pre-round countdown when enough drivers are connected. Calling it
// again while a countdown is running is a no-op, so joins cannot restart it.
export function armCountdown(round, players, now) {
  if (players.length < MIN_PLAYERS) return false
  if (round.phase === 'playing' || round.phase === 'countdown') return false
  if (round.phase === 'finished') {
    // Keep the results screen visible long enough to read who lost.
    if (now < round.finishedAt + round.resultHoldMs) return false
    // A rematch is never automatic: a driver must explicitly confirm it. A
    // READY pressed during the hold is honored here once the hold expires.
    if (!players.some((player) => player.ready)) return false
  }
  round.phase = 'countdown'
  round.nextRoundAt = now + round.countdownMs
  round.endsAt = 0
  return true
}

// Consumes the countdown and starts the 90-second round. Tags only count once
// a round has actually started.
export function maybeStartRound(players, round, now) {
  if (round.phase !== 'countdown' || now < round.nextRoundAt) return false
  if (players.length < MIN_PLAYERS) return false

  for (const player of players) {
    player.tags = 0
    player.ready = false
  }
  round.phase = 'playing'
  round.endsAt = now + round.roundSeconds * 1000
  round.nextRoundAt = 0
  round.loserId = null
  round.winnerIds = []
  round.standings = []
  return true
}

export function setPlayerReady(players, round, id, ready, now) {
  const player = players.find((item) => item.id === id)
  if (!player || round.phase === 'playing') return { changed: false, started: false, cancelled: false }

  const next = Boolean(ready)
  if (player.ready === next) return { changed: false, started: false, cancelled: false }
  player.ready = next

  if (!next && round.phase === 'countdown') {
    round.phase = 'waiting'
    round.nextRoundAt = 0
    return { changed: true, started: false, cancelled: true }
  }
  if (next) armCountdown(round, players, now)
  return { changed: true, started: false, cancelled: false }
}

// Call after the disconnected player has been removed from `players`.
export function handlePlayerLeft(players, round, _id, now) {
  if (players.length === 0) {
    // An empty lobby must forget a finished round so new players can start clean.
    resetRound(players, round)
    return { aborted: true, started: false }
  }
  if (players.length < MIN_PLAYERS && (round.phase === 'playing' || round.phase === 'countdown')) {
    resetRound(players, round)
    return { aborted: true, started: false }
  }
  return { aborted: false, started: maybeStartRound(players, round, now) }
}

// At zero, the driver who is currently "it" loses; everyone else wins.
// Tag counts are still reported as the round results.
export function maybeFinishRound(players, round, now, itId = null) {
  if (round.phase !== 'playing' || now < round.endsAt) return false

  const standings = players
    .map((player) => ({ id: player.id, name: player.name, tags: player.tags }))
    .sort((a, b) => b.tags - a.tags || a.id.localeCompare(b.id))
  const loserId = players.some((player) => player.id === itId) ? itId : null

  round.standings = standings
  round.loserId = loserId
  round.winnerIds = players.filter((player) => player.id !== loserId).map((player) => player.id)
  round.phase = 'finished'
  round.endsAt = now
  round.finishedAt = now
  round.nextRoundAt = 0
  for (const player of players) player.ready = false
  return true
}
