// Server-side validation of client-reported movement.
// Deliberately duplicated (not imported from the frontend) so the server can be
// deployed as a standalone service. Keep these values in sync with
// src/features/car-game/game/constants.js.

export const SERVER_BOUNDS = Object.freeze({
  width: 3200,
  height: 2560,
  carRadius: 15,
  maxForwardSpeed: 420,
  maxReverseSpeed: 150,
})

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2
  let result = angle % twoPi
  if (result > Math.PI) result -= twoPi
  if (result < -Math.PI) result += twoPi
  return result
}

// Sliding one-second window + minimum gap between updates.
export function createRateLimiter({ minIntervalMs = 40, maxPerSecond = 25 } = {}) {
  let lastAt = -Infinity
  let windowStart = 0
  let count = 0

  return {
    allow(now = Date.now()) {
      if (now - lastAt < minIntervalMs) return false
      if (now - windowStart >= 1000) {
        windowStart = now
        count = 0
      }
      if (count >= maxPerSecond) return false
      lastAt = now
      count += 1
      return true
    },
    reset() {
      lastAt = -Infinity
      windowStart = 0
      count = 0
    },
  }
}

export function validateMove(payload, { now = Date.now(), limiter = null, bounds = SERVER_BOUNDS } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Movement update must be an object.' }
  }

  const { x, y, angle, speed } = payload
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(angle) || !isFiniteNumber(speed)) {
    return { ok: false, code: 'INVALID_NUMBER', message: 'Movement values must be finite numbers.' }
  }

  if (limiter && !limiter.allow(now)) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many movement updates.' }
  }

  const radius = bounds.carRadius
  return {
    ok: true,
    state: {
      x: Math.min(Math.max(x, radius), bounds.width - radius),
      y: Math.min(Math.max(y, radius), bounds.height - radius),
      angle: normalizeAngle(angle),
      speed: Math.min(Math.max(speed, -bounds.maxReverseSpeed), bounds.maxForwardSpeed),
    },
  }
}
