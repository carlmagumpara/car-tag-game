// Client-side tag and round rules for the You vs AI mode. The semantics mirror
// server/src/tag.js and server/src/round.js so both modes play the same game,
// but this module is local-only: no socket, no server state, no network events.

import { IMMUNITY_MS, TAG_COOLDOWN_MS } from './constants.js'

export const AI_MATCH = Object.freeze({
  roundSeconds: 90, // matches server config.ROUND_SECONDS default
  countdownMs: 3000, // matches server config.COUNTDOWN_MS default
  resultHoldMs: 2500, // matches server config.RESULT_HOLD_MS default
  minPlayers: 2, // matches server MIN_PLAYERS
  tagRadius: 38, // matches server config.TAG_RADIUS default
  tagCooldownMs: TAG_COOLDOWN_MS,
  immunityMs: IMMUNITY_MS,
})

const contactKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function createAiMatch(now = 0, roundSeconds = AI_MATCH.roundSeconds) {
  return {
    phase: 'waiting', // waiting -> countdown -> playing -> finished -> countdown
    roundSeconds,
    countdownMs: AI_MATCH.countdownMs,
    resultHoldMs: AI_MATCH.resultHoldMs,
    endsAt: 0,
    finishedAt: 0,
    nextRoundAt: 0,
    readyIds: [],
    winnerIds: [],
    loserId: null,
    standings: [],
    itId: null,
    cooldownUntil: 0,
    contactKey: null,
    tagEvent: null,
  }
}

// The AI starts as "it" so it chases the player from the first tick.
export function assignAiIt(match, players, id) {
  match.itId = id
  match.cooldownUntil = 0
  match.contactKey = null
  for (const player of players) {
    player.isIt = player.id === id
    player.immuneUntil = 0
  }
  return { taggerId: null, taggedId: id, itId: id, reason: 'reassign', at: 0 }
}

// The rival holds position until a round is armed by READY. It may line up
// during the countdown like a human driver, but it must not chase while the
// player is still waiting to start (or while the results are on screen).
export function canAiDrive(match) {
  return match.phase === 'countdown' || match.phase === 'playing'
}

export function armAiCountdown(match, players, now) {
  if (players.length < AI_MATCH.minPlayers) return false
  if (match.phase === 'playing' || match.phase === 'countdown') return false
  if (match.phase === 'finished') {
    // Mirror the server: the results hold is not a green light to auto-start.
    // The human's READY (mirrored by the rival) must still be pending.
    if (now < match.finishedAt + match.resultHoldMs) return false
    if (!players.some((player) => player.ready)) return false
  }
  match.phase = 'countdown'
  match.nextRoundAt = now + match.countdownMs
  match.endsAt = 0
  return true
}

export function maybeStartAiRound(match, players, now) {
  if (match.phase !== 'countdown' || now < match.nextRoundAt) return false
  if (players.length < AI_MATCH.minPlayers) return false

  for (const player of players) {
    player.tags = 0
    player.ready = false
    player.immuneUntil = 0
  }
  match.phase = 'playing'
  match.endsAt = now + match.roundSeconds * 1000
  match.nextRoundAt = 0
  match.loserId = null
  match.winnerIds = []
  match.standings = []
  match.cooldownUntil = 0
  match.contactKey = null
  match.tagEvent = null
  return true
}

// Mirrors setPlayerReady: one driver's ready flag, evaluated against the whole
// local roster. The AI mirror calls this for both drivers on the same array.
export function setAiReady(match, players, id, ready, now) {
  const player = players.find((item) => item.id === id)
  if (!player || match.phase === 'playing') return { changed: false, started: false, cancelled: false }

  const next = Boolean(ready)
  if (player.ready === next) return { changed: false, started: false, cancelled: false }
  player.ready = next

  if (!next && match.phase === 'countdown') {
    match.phase = 'waiting'
    match.nextRoundAt = 0
    return { changed: true, started: false, cancelled: true }
  }
  if (next) armAiCountdown(match, players, now)
  return { changed: true, started: false, cancelled: false }
}

// Contact test against the current tagger, with the same global gate, immunity
// and contact latch as the server.
export function evaluateAiTag(match, players, now) {
  if (match.phase !== 'playing' || !match.itId || now < match.cooldownUntil) return null
  const tagger = players.find((player) => player.id === match.itId)
  if (!tagger) return null

  let found = null
  let touching = false
  for (const player of players) {
    if (player.id === tagger.id) continue
    const dx = player.x - tagger.x
    const dy = player.y - tagger.y
    if (dx * dx + dy * dy > AI_MATCH.tagRadius * AI_MATCH.tagRadius) continue
    touching = true
    if (contactKey(tagger.id, player.id) === match.contactKey) continue
    if (player.immuneUntil > now) continue
    found = player
    break
  }
  if (!touching) match.contactKey = null
  return found
    ? { taggerId: tagger.id, taggedId: found.id, itId: found.id, reason: 'tag', at: now }
    : null
}

export function applyAiTag(match, players, hit, now) {
  const tagger = players.find((player) => player.id === hit.taggerId)
  const tagged = players.find((player) => player.id === hit.taggedId)
  if (!tagger || !tagged) return false
  tagger.isIt = false
  tagger.tags += 1
  tagged.isIt = true
  tagged.immuneUntil = now + AI_MATCH.immunityMs
  match.itId = tagged.id
  match.cooldownUntil = now + AI_MATCH.tagCooldownMs
  match.contactKey = contactKey(tagger.id, tagged.id)
  match.tagEvent = {
    ...hit,
    immunityMs: AI_MATCH.immunityMs,
    immuneUntil: tagged.immuneUntil,
  }
  return true
}

// At zero, whoever holds "it" loses; everyone else wins.
export function maybeFinishAiRound(match, players, now, itId = null) {
  if (match.phase !== 'playing' || now < match.endsAt) return false

  const standings = players
    .map((player) => ({ id: player.id, name: player.name, tags: player.tags }))
    .sort((a, b) => b.tags - a.tags || a.id.localeCompare(b.id))
  const loserId = players.some((player) => player.id === itId) ? itId : null

  match.standings = standings
  match.loserId = loserId
  match.winnerIds = players.filter((player) => player.id !== loserId).map((player) => player.id)
  match.phase = 'finished'
  match.endsAt = now
  match.finishedAt = now
  match.nextRoundAt = 0
  match.tagEvent = null
  for (const player of players) player.ready = false
  return true
}

// Same shape as the server's game:state payload, so the HUD can read both.
export function publicAiGame(match, players, now) {
  const secondsLeft =
    match.phase === 'playing'
      ? Math.max(0, Math.ceil((match.endsAt - now) / 1000))
      : match.phase === 'countdown'
        ? Math.max(0, Math.ceil((match.nextRoundAt - now) / 1000))
        : match.phase === 'finished'
          ? 0
          : match.roundSeconds

  return {
    phase: match.phase,
    roundSeconds: match.roundSeconds,
    secondsLeft,
    endsAt: match.endsAt,
    nextRoundAt: match.nextRoundAt,
    countdownMs: match.countdownMs,
    minPlayers: AI_MATCH.minPlayers,
    readyIds: players.filter((player) => player.ready).map((player) => player.id),
    winnerIds: [...match.winnerIds],
    loserId: match.loserId,
    standings: match.standings.map((standing) => ({ ...standing })),
  }
}
