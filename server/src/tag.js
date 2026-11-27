// Pure tag rules. The server owns all tag state; clients only receive results.

export function createTagState() {
  return { itId: null, cooldownUntil: 0, lastTaggerId: null }
}

function assignFirst(players, state, now, cooldownMs) {
  if (players.length === 0) {
    state.itId = null
    return null
  }
  if (players.some((player) => player.id === state.itId)) return null

  const chosen = players[0]
  for (const player of players) player.isIt = player.id === chosen.id
  state.itId = chosen.id
  state.lastTaggerId = null
  state.cooldownUntil = now + cooldownMs
  return { taggerId: null, taggedId: chosen.id, itId: chosen.id, reason: 'reassign', at: now }
}

// Called after a join. Falls back to assigning a new "it" when the room was empty.
export function ensureIt(players, state, now, cooldownMs) {
  return assignFirst(players, state, now, cooldownMs)
}

// Called after a disconnect. If "it" left, hand the role to the next driver.
export function removePlayer(players, state, id, now, cooldownMs) {
  const index = players.findIndex((player) => player.id === id)
  if (index >= 0) players.splice(index, 1)
  if (state.itId !== id) return null
  return assignFirst(players, state, now, cooldownMs)
}

// Contact test against the current tagger, with a cooldown to avoid ping-pong tags.
export function evaluateTag(players, state, now, radius, cooldownMs) {
  if (!state.itId || now < state.cooldownUntil) return null
  const tagger = players.find((player) => player.id === state.itId)
  if (!tagger) return null

  for (const player of players) {
    if (player.id === tagger.id) continue
    const dx = player.x - tagger.x
    const dy = player.y - tagger.y
    if (dx * dx + dy * dy <= radius * radius) {
      return { taggerId: tagger.id, taggedId: player.id, itId: player.id, reason: 'tag', at: now }
    }
  }
  return null
}

// Applies a hit produced by evaluateTag/ensureIt/removePlayer.
export function applyTag(hit, players, state, now, cooldownMs) {
  if (hit.reason === 'tag') {
    const tagger = players.find((player) => player.id === hit.taggerId)
    const tagged = players.find((player) => player.id === hit.taggedId)
    if (!tagger || !tagged) return false
    tagger.isIt = false
    tagger.tags += 1
    tagged.isIt = true
  } else {
    for (const player of players) player.isIt = player.id === hit.itId
  }
  state.itId = hit.itId
  state.cooldownUntil = now + cooldownMs
  state.lastTaggerId = hit.taggerId
  return true
}

export function publicTagState(players) {
  return players.map((player) => ({ id: player.id, isIt: player.isIt, tags: player.tags }))
}
