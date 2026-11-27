// Short, shareable room codes. Keep the alphabet/format in sync with the
// server's server/src/rooms.js — both sides accept the same six characters.

export const ROOM_ID_LENGTH = 6
export const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

function randomIndex(max) {
  const webCrypto = globalThis.crypto
  if (webCrypto?.getRandomValues) {
    return webCrypto.getRandomValues(new Uint32Array(1))[0] % max
  }
  return Math.floor(Math.random() * max)
}

export function createRoomId() {
  let id = ''
  for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
    id += ROOM_ID_ALPHABET[randomIndex(ROOM_ID_ALPHABET.length)]
  }
  return id
}

export function normalizeRoomId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim().toUpperCase()
  return ROOM_ID_PATTERN.test(id) ? id : null
}

export function isValidRoomId(value) {
  return ROOM_ID_PATTERN.test(value)
}

// Absolute URL for the "Copy link" button. Keeping the query string preserves
// nothing important today, but it avoids dropping deployment parameters.
export function roomUrl(roomId) {
  return `${window.location.origin}${window.location.pathname}${window.location.search}#/game/${roomId}`
}
