const ADJECTIVES = ['Neon', 'Swift', 'Midnight', 'Turbo', 'Cloudy', 'Electric', 'Golden', 'Quiet', 'Cosmic']
const NOUNS = ['Driver', 'Comet', 'Falcon', 'Voyager', 'Racer', 'Panda', 'Nova', 'Cruise', 'Kite']
const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#2dd4bf', '#f8fafc', '#f97316', '#818cf8']

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

  add(id) {
    const taken = Array.from(this.players.values(), (player) => player.name)
    const index = this.players.size
    const spawn = spawnFor(index)
    const player = {
      id,
      name: generatePlayerName(taken),
      color: COLORS[index % COLORS.length],
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      speed: 0,
      isIt: false,
      tags: 0,
    }
    this.players.set(id, player)
    return player
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
