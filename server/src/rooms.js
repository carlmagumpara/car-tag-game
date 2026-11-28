// Rooms isolate a game: every room owns its players, tag state, round state and
// rate limiters. The id is short and shareable, so a URL can point at one room.
// This module deliberately stays dependency-light so the standalone server can
// be deployed on its own (see server/Dockerfile).

import { randomInt } from 'node:crypto'
import { PlayerStore } from './players.js'
import { createRoundState } from './round.js'
import { createTagState } from './tag.js'
import { createRateLimiter } from './validation.js'

// Ambiguous characters (0/O and 1/I) are left out so codes survive being read
// aloud or copied by hand. Keep this alphabet in sync with the frontend's
// src/features/car-game/game/room-id.js.
export const ROOM_ID_LENGTH = 6
export const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_ID_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

export function createRoomId(existing = []) {
  const taken = new Set(existing)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let id = ''
    for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
      id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)]
    }
    if (!taken.has(id)) return id
  }
  // 32^6 possibilities make a collision streak practically impossible, but a
  // deterministic fallback keeps callers from ever receiving an invalid id.
  return ROOM_ID_ALPHABET.repeat(ROOM_ID_LENGTH).slice(0, ROOM_ID_LENGTH)
}

export function normalizeRoomId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim().toUpperCase()
  return ROOM_ID_PATTERN.test(id) ? id : null
}

export class Room {
  constructor(id, { maxPlayers, roundSeconds, countdownMs = 3000, resultHoldMs = 2500 }) {
    this.id = id
    this.store = new PlayerStore(maxPlayers)
    this.tagState = createTagState()
    this.round = createRoundState(roundSeconds, countdownMs, resultHoldMs)
    this.limiters = new Map()
    this.violations = new Map()
    this.chatLimiters = new Map()
    this.voiceLimiters = new Map()
    // socketId -> { muted }, present only while that driver is in voice.
    this.voicePeers = new Map()
    this.lastRoundSignature = ''
  }
}

export class RoomManager {
  constructor({
    maxPlayers = 40,
    roundSeconds = 90,
    countdownMs = 3000,
    resultHoldMs = 2500,
    maxRooms = 200,
  } = {}) {
    this.rooms = new Map()
    this.maxRooms = maxRooms
    this.options = { maxPlayers, roundSeconds, countdownMs, resultHoldMs }
  }

  get size() {
    return this.rooms.size
  }

  get(id) {
    return this.rooms.get(id) || null
  }

  // Creates a room with the requested valid id when it is free, otherwise a
  // fresh random one. Returns null at the room cap or if the id is already used.
  create(id = null) {
    const requested = normalizeRoomId(id)
    if (this.rooms.size >= this.maxRooms) return null
    if (requested && this.rooms.has(requested)) return null

    const roomId = requested || createRoomId(this.rooms.keys())
    const room = new Room(roomId, this.options)
    this.rooms.set(roomId, room)
    return room
  }

  getOrCreate(id = null) {
    return this.get(normalizeRoomId(id)) || this.create(id)
  }

  remove(id) {
    return this.rooms.delete(id)
  }

  values() {
    return this.rooms.values()
  }

  ids() {
    return Array.from(this.rooms.keys())
  }
}
