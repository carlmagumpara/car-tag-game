// Client-side tag and round rules for the You vs AI mode. The semantics mirror
// server/src/tag.js and server/src/round.js so both modes play the same game,
// but this module is local-only: no socket, no server state, no network events.

import { TAG_COOLDOWN_MS } from './constants.js'

export const AI_MATCH = Object.freeze({
  roundSeconds: 60, // matches server config.ROUND_SECONDS default
  minPlayers: 2, // matches server MIN_PLAYERS
  tagRadius: 38, // matches server config.TAG_RADIUS default
  tagCooldownMs: TAG_COOLDOWN_MS, // 5s of immunity after every tag, like multiplayer
})

export function createAiMatch(now = 0, roundSeconds = AI_MATCH.roundSeconds) {
  return {
    phase: 'waiting', // waiting -> playing -> finished -> waiting (next round)
    roundSeconds,
    endsAt: 0,
    readyIds: [],
    winnerIds: [],
    standings: [],
    itId: null,
    cooldownUntil: 0,
    tagEvent: null,
  }
}

// The AI starts as "it" so it chases the player from the first tick.
export function assignAiIt(match, players, id) {
  match.itId = id
  match.cooldownUntil = 0
  for (const player of players) player.isIt = player.id === id
  return { taggerId: null, taggedId: id, itId: id, reason: 'reassign', at: 0 }
}

function maybeStart(match, players, now) {
  if (match.phase !== 'waiting' && match.phase !== 'finished') return false
  if (players.length < AI_MATCH.minPlayers) return false
  if (!players.every((player) => player.ready)) return false

  for (const player of players) {
    player.tags = 0
    player.ready = false
  }
  match.phase = 'playing'
  match.endsAt = now + match.roundSeconds * 1000
  match.winnerIds = []
  match.standings = []
  match.tagEvent = null
  return true
}

// Mirrors setPlayerReady: one driver's ready flag, evaluated against the whole
// local roster. The AI mirror calls this for both drivers on the same array.
export function setAiReady(match, players, id, ready, now) {
  const player = players.find((item) => item.id === id)
  if (!player || match.phase === 'playing') return { changed: false, started: false }

  const next = Boolean(ready)
  if (player.ready === next) return { changed: false, started: false }
  player.ready = next
  return { changed: true, started: maybeStart(match, players, now) }
}

// Contact test against the current tagger, with the same cooldown as the server.
export function evaluateAiTag(match, players, now) {
  if (match.phase !== 'playing' || !match.itId || now < match.cooldownUntil) return null
  const tagger = players.find((player) => player.id === match.itId)
  if (!tagger) return null

  for (const player of players) {
    if (player.id === tagger.id) continue
    const dx = player.x - tagger.x
    const dy = player.y - tagger.y
    if (dx * dx + dy * dy <= AI_MATCH.tagRadius * AI_MATCH.tagRadius) {
      return { taggerId: tagger.id, taggedId: player.id, itId: player.id, reason: 'tag', at: now }
    }
  }
  return null
}

export function applyAiTag(match, players, hit, now) {
  const tagger = players.find((player) => player.id === hit.taggerId)
  const tagged = players.find((player) => player.id === hit.taggedId)
  if (!tagger || !tagged) return false
  tagger.isIt = false
  tagger.tags += 1
  tagged.isIt = true
  match.itId = tagged.id
  match.cooldownUntil = now + AI_MATCH.tagCooldownMs
  match.tagEvent = hit
  return true
}

export function maybeFinishAiRound(match, players, now) {
  if (match.phase !== 'playing' || now < match.endsAt) return false

  const standings = players
    .map((player) => ({ id: player.id, name: player.name, tags: player.tags }))
    .sort((a, b) => b.tags - a.tags || a.id.localeCompare(b.id))
  const topTags = standings[0]?.tags ?? 0

  match.standings = standings
  match.winnerIds = topTags > 0 ? standings.filter((entry) => entry.tags === topTags).map((entry) => entry.id) : []
  match.phase = 'finished'
  match.endsAt = now
  match.tagEvent = null
  for (const player of players) player.ready = false
  return true
}

// Same shape as the server's game:state payload, so the HUD can read both.
export function publicAiGame(match, players, now) {
  const secondsLeft =
    match.phase === 'playing'
      ? Math.max(0, Math.ceil((match.endsAt - now) / 1000))
      : match.phase === 'finished'
        ? 0
        : match.roundSeconds

  return {
    phase: match.phase,
    roundSeconds: match.roundSeconds,
    secondsLeft,
    endsAt: match.endsAt,
    minPlayers: AI_MATCH.minPlayers,
    readyIds: players.filter((player) => player.ready).map((player) => player.id),
    winnerIds: [...match.winnerIds],
    standings: match.standings.map((standing) => ({ ...standing })),
  }
}
