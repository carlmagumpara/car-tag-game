const ADJECTIVES = ['Neon', 'Swift', 'Midnight', 'Turbo', 'Cloudy', 'Electric', 'Golden', 'Quiet', 'Cosmic']
const NOUNS = ['Driver', 'Comet', 'Falcon', 'Voyager', 'Racer', 'Panda', 'Nova', 'Cruise', 'Kite']

// Duplicated from src/features/car-game/game/player-name.js so this server can
// run on its own. Keep the limit and normalization rules in sync.
export const PLAYER_NAME_MAX_LENGTH = 24

export function normalizePlayerName(value) {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  const name = value.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX_LENGTH)
  return name || null
}

// A driver may bring their own name, but names stay unique within the room.
function uniqueName(base, taken) {
  if (!taken.includes(base)) return base
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base} ${index}`.slice(0, PLAYER_NAME_MAX_LENGTH)
    if (!taken.includes(candidate)) return candidate
  }
  return generatePlayerName(taken)
}

// Duplicated from src/features/car-game/game/car-colors.js so this server can be
// deployed on its own. Keep the palette in sync.
export const CAR_COLORS = Object.freeze([
  { id: 'cyan', hex: '#38bdf8' },
  { id: 'pink', hex: '#f472b6' },
  { id: 'lime', hex: '#a3e635' },
  { id: 'amber', hex: '#fbbf24' },
  { id: 'violet', hex: '#c084fc' },
  { id: 'rose', hex: '#fb7185' },
  { id: 'teal', hex: '#2dd4bf' },
  { id: 'white', hex: '#f8fafc' },
  { id: 'orange', hex: '#f97316' },
  { id: 'indigo', hex: '#818cf8' },
])

export function normalizeCarColor(value, fallback = CAR_COLORS[0].hex) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().toLowerCase()
  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  const match = CAR_COLORS.find((color) => color.hex === candidate || color.id === trimmed)
  return match ? match.hex : fallback
}

export function generatePlayerName(taken = []) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const name = `${adjective} ${noun} ${Math.floor(10 + Math.random() * 90)}`
    if (!taken.includes(name)) return name
  }
  return `Driver ${Math.floor(Math.random() * 100000)}`
}

export function spawnFor(index) {
  const centerY = Math.round(2560 / (2 * 320)) * 320
  const slot = index % 12
  return {
    x: 3200 / 2 + (slot - 5.5) * 72,
    y: centerY,
    angle: slot % 2 === 0 ? 0 : Math.PI,
  }
}

export function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    angle: player.angle,
    speed: player.speed,
    isIt: player.isIt,
    tags: player.tags,
    ready: Boolean(player.ready),
    // Server epoch ms while the shield is active. Clients convert it to their
    // own clock once so the countdown stays synced despite clock skew.
    immuneUntil: player.immuneUntil || 0,
  }
}

// In-memory player state. Replaced by a shared store if the game later needs
// multiple server instances; the protocol does not depend on that choice.
export class PlayerStore {
  constructor(maxPlayers = 40) {
    this.players = new Map()
    this.maxPlayers = maxPlayers
  }

  get size() {
    return this.players.size
  }

  add(id, requestedColor = null, requestedName = null) {
    const taken = Array.from(this.players.values(), (player) => player.name)
    const index = this.players.size
    const spawn = spawnFor(index)
    const chosen = normalizePlayerName(requestedName)
    const name = chosen ? uniqueName(chosen, taken) : generatePlayerName(taken)
    const player = {
      id,
      name,
      color: normalizeCarColor(requestedColor, CAR_COLORS[index % CAR_COLORS.length].hex),
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      speed: 0,
      isIt: false,
      tags: 0,
      ready: false,
      immuneUntil: 0,
    }
    this.players.set(id, player)
    return player
  }

  get(id) {
    return this.players.get(id) || null
  }

  update(id, state) {
    const player = this.players.get(id)
    if (!player) return null
    Object.assign(player, state)
    return player
  }

  remove(id) {
    return this.players.delete(id)
  }

  snapshot() {
    return Array.from(this.players.values())
  }
}
