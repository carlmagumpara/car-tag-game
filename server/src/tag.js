// Pure tag rules. The server owns all tag state; clients only receive results.

export function createTagState() {
  return { itId: null, cooldownUntil: 0, lastTaggerId: null, contactKey: null }
}

// A contact is only valid once per pair while the cars stay overlapped. The
// latch is cleared as soon as the tagger is touching nobody, so driving away
// and bumping again produces a fresh tag.
function contactKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function chooseIt(players) {
  return players[Math.floor(Math.random() * players.length)]
}

// Picks a random connected driver as "it" when a round starts, when the room
// was empty, or when the previous tagger left.
function assignFirst(players, state, now, cooldownMs, immunityMs) {
  if (players.length === 0) {
    state.itId = null
    state.contactKey = null
    return null
  }
  if (players.some((player) => player.id === state.itId)) return null

  const chosen = chooseIt(players)
  for (const player of players) {
    player.isIt = player.id === chosen.id
    player.immuneUntil = player.id === chosen.id ? now + immunityMs : 0
  }
  state.itId = chosen.id
  state.lastTaggerId = null
  state.cooldownUntil = now + cooldownMs
  state.contactKey = null
  return { taggerId: null, taggedId: chosen.id, itId: chosen.id, reason: 'reassign', at: now }
}

// Resets every tag-related timer for a fresh round before assigning the new
// tagger, so no shield or stale contact latch survives into the next round.
export function resetTag(players, state, now, cooldownMs, immunityMs) {
  state.itId = null
  state.cooldownUntil = 0
  state.lastTaggerId = null
  state.contactKey = null
  for (const player of players) player.immuneUntil = 0
  return assignFirst(players, state, now, cooldownMs, immunityMs)
}

// Called after a join. Falls back to assigning a new "it" when the room was empty.
export function ensureIt(players, state, now, cooldownMs, immunityMs = cooldownMs) {
  return assignFirst(players, state, now, cooldownMs, immunityMs)
}

// Called after a disconnect. If "it" left, hand the role to a random driver.
export function removePlayer(players, state, id, now, cooldownMs, immunityMs = cooldownMs) {
  const index = players.findIndex((player) => player.id === id)
  if (index >= 0) players.splice(index, 1)
  if (state.itId !== id) return null
  return assignFirst(players, state, now, cooldownMs, immunityMs)
}

// Contact test against the current tagger. Server-owned positions only; clients
// never send a tag claim. The global cooldown, per-player immunity and contact
// latch together guarantee a single transfer per collision.
export function evaluateTag(players, state, now, radius) {
  if (!state.itId || now < state.cooldownUntil) return null
  const tagger = players.find((player) => player.id === state.itId)
  if (!tagger) return null

  let found = null
  let touching = false
  for (const player of players) {
    if (player.id === tagger.id) continue
    const dx = player.x - tagger.x
    const dy = player.y - tagger.y
    if (dx * dx + dy * dy > radius * radius) continue
    touching = true
    if (contactKey(tagger.id, player.id) === state.contactKey) continue
    if (player.immuneUntil > now) continue
    found = player
    break
  }

  // Only actual separation clears the latch. A latched (or shielded) car that
  // is still touching must keep blocking repeat tags.
  if (!touching) state.contactKey = null
  return found
    ? { taggerId: tagger.id, taggedId: found.id, itId: found.id, reason: 'tag', at: now }
    : null
}

// Applies a hit produced by evaluateTag/ensureIt/removePlayer.
export function applyTag(hit, players, state, now, cooldownMs, immunityMs = cooldownMs) {
  if (hit.reason === 'tag') {
    const tagger = players.find((player) => player.id === hit.taggerId)
    const tagged = players.find((player) => player.id === hit.taggedId)
    if (!tagger || !tagged) return false
    tagger.isIt = false
    tagger.tags += 1
    tagged.isIt = true
    tagged.immuneUntil = now + immunityMs
    state.contactKey = contactKey(tagger.id, tagged.id)
  } else {
    for (const player of players) {
      player.isIt = player.id === hit.itId
      player.immuneUntil = player.isIt ? now + immunityMs : 0
    }
    state.contactKey = null
  }
  state.itId = hit.itId
  state.cooldownUntil = now + cooldownMs
  state.lastTaggerId = hit.taggerId
  return true
}

export function publicTagState(players) {
  return players.map((player) => ({
    id: player.id,
    isIt: player.isIt,
    tags: player.tags,
    immuneUntil: player.immuneUntil || 0,
  }))
}
