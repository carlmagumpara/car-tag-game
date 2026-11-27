import { normalizeAngle } from './physics.js'

// Remote vehicles are rendered slightly in the past and interpolated between
// snapshots, which hides jitter from the 20 Hz network tick.

export function createInterpolationBuffer() {
  return []
}

export function pushSnapshot(buffer, state, now) {
  buffer.push({ x: state.x, y: state.y, angle: state.angle, speed: state.speed, t: now })
  if (buffer.length > 32) buffer.splice(0, buffer.length - 32)
}

export function pruneBuffer(buffer, now, maxAge = 1000) {
  while (buffer.length > 1 && now - buffer[0].t > maxAge) buffer.shift()
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha
}

// Writes into `out` so the render loop does not allocate a new object per car.
export function sampleState(buffer, now, delay = 100, out = {}) {
  if (buffer.length === 0) return null
  const target = now - delay
  if (buffer.length === 1 || target <= buffer[0].t) {
    const first = buffer[0]
    out.x = first.x
    out.y = first.y
    out.angle = first.angle
    out.speed = first.speed
    return out
  }

  const last = buffer[buffer.length - 1]
  if (target >= last.t) {
    out.x = last.x
    out.y = last.y
    out.angle = last.angle
    out.speed = last.speed
    return out
  }

  let index = 0
  while (index < buffer.length - 2 && buffer[index + 1].t < target) index += 1
  const from = buffer[index]
  const to = buffer[index + 1]
  const span = to.t - from.t
  const alpha = span > 0 ? Math.min(Math.max((target - from.t) / span, 0), 1) : 1

  out.x = lerp(from.x, to.x, alpha)
  out.y = lerp(from.y, to.y, alpha)
  // Shortest-arc interpolation prevents a full spin when wrapping at +/- PI.
  let delta = to.angle - from.angle
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  out.angle = normalizeAngle(from.angle + delta * alpha)
  out.speed = lerp(from.speed, to.speed, alpha)
  return out
}
