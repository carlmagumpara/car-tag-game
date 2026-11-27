// Pure round rules. The server owns the phase, timer and winner; clients only
// receive the resulting state. A round needs at least MIN_PLAYERS drivers and
// every connected driver must indicate ready before the countdown starts.

export const MIN_PLAYERS = 2

export function createRoundState(roundSeconds) {
  return {
    phase: 'waiting', // waiting -> playing -> finished -> waiting (next round)
    roundSeconds,
    endsAt: 0,
    winnerIds: [],
    standings: [],
  }
}

export function publicRoundState(round, players, now) {
  const secondsLeft =
    round.phase === 'playing'
      ? Math.max(0, Math.ceil((round.endsAt - now) / 1000))
      : round.phase === 'finished'
        ? 0
        : round.roundSeconds

  return {
    phase: round.phase,
    roundSeconds: round.roundSeconds,
    secondsLeft,
    endsAt: round.endsAt,
    minPlayers: MIN_PLAYERS,
    readyIds: players.filter((player) => player.ready).map((player) => player.id),
    winnerIds: [...round.winnerIds],
    standings: round.standings.map((standing) => ({ ...standing })),
  }
}

export function isRoundActive(round) {
  return round.phase === 'playing'
}

function resetRound(players, round) {
  round.phase = 'waiting'
  round.endsAt = 0
  round.winnerIds = []
  round.standings = []
  for (const player of players) {
    player.ready = false
    player.tags = 0
  }
}

// Consumes everyone's ready flag and starts the countdown. Tags only count
// once a round has actually started.
export function maybeStartRound(players, round, now) {
  // A finished round can go straight into the next one once everyone readies up.
  if (round.phase !== 'waiting' && round.phase !== 'finished') return false
  if (players.length < MIN_PLAYERS) return false
  if (!players.every((player) => player.ready)) return false

  for (const player of players) {
    player.tags = 0
    player.ready = false
  }
  round.phase = 'playing'
  round.endsAt = now + round.roundSeconds * 1000
  round.winnerIds = []
  round.standings = []
  return true
}

export function setPlayerReady(players, round, id, ready, now) {
  const player = players.find((item) => item.id === id)
  if (!player || round.phase === 'playing') return { changed: false, started: false }

  const next = Boolean(ready)
  if (player.ready === next) return { changed: false, started: false }
  player.ready = next
  return { changed: true, started: maybeStartRound(players, round, now) }
}

// Call after the disconnected player has been removed from `players`.
export function handlePlayerLeft(players, round, _id, now) {
  if (players.length === 0 || (round.phase === 'playing' && players.length < MIN_PLAYERS)) {
    // An empty lobby must forget a finished round so the next players can
    // start a fresh one; a round that loses a driver is aborted.
    resetRound(players, round)
    return { aborted: true, started: false }
  }
  return { aborted: false, started: maybeStartRound(players, round, now) }
}

export function maybeFinishRound(players, round, now) {
  if (round.phase !== 'playing' || now < round.endsAt) return false

  const standings = players
    .map((player) => ({ id: player.id, name: player.name, tags: player.tags }))
    .sort((a, b) => b.tags - a.tags || a.id.localeCompare(b.id))
  const topTags = standings[0]?.tags ?? 0

  round.standings = standings
  round.winnerIds = topTags > 0 ? standings.filter((entry) => entry.tags === topTags).map((entry) => entry.id) : []
  round.phase = 'finished'
  round.endsAt = now
  for (const player of players) player.ready = false
  return true
}
