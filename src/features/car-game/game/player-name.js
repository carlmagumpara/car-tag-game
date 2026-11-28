// Driver name rules. Mirrors server/src/players.js so the server can validate
// a name sent in the handshake without importing browser code. Keep in sync.

export const PLAYER_NAME_MAX_LENGTH = 24

const ADJECTIVES = ['Neon', 'Swift', 'Midnight', 'Turbo', 'Cloudy', 'Electric', 'Golden', 'Quiet', 'Cosmic']
const NOUNS = ['Driver', 'Comet', 'Falcon', 'Voyager', 'Racer', 'Panda', 'Nova', 'Cruise', 'Kite']

function pick(list) {
  const webCrypto = globalThis.crypto
  if (webCrypto?.getRandomValues) {
    return list[webCrypto.getRandomValues(new Uint32Array(1))[0] % list.length]
  }
  return list[Math.floor(Math.random() * list.length)]
}

export function createRandomName() {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${Math.floor(10 + Math.random() * 90)}`
}

export function normalizePlayerName(value) {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  const name = value.trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_MAX_LENGTH)
  return name || null
}
