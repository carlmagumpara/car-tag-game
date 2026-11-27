import { PHYSICS, SPEED_DISPLAY_FACTOR } from './constants.js'
import { world as defaultWorld } from './world.js'

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeAngle(angle) {
  const twoPi = Math.PI * 2
  let result = angle % twoPi
  if (result > Math.PI) result -= twoPi
  if (result < -Math.PI) result += twoPi
  return result
}

export function createVehicle({
  x,
  y,
  angle = 0,
  color = '#38bdf8',
  name = 'Player',
  id = null,
  vx = 0,
  vy = 0,
  speed = 0,
}) {
  return {
    id,
    name,
    color,
    x,
    y,
    angle,
    vx,
    vy,
    speed,
    drifting: false,
  }
}

// Circle vs axis-aligned building resolution. Pushes the car to the nearest
// free side and kills velocity into the wall. Cheap enough for ~250 buildings.
export function resolveBuildingCollision(vehicle, buildings) {
  const radius = PHYSICS.carRadius
  for (const building of buildings) {
    const nearestX = clamp(vehicle.x, building.x, building.x + building.w)
    const nearestY = clamp(vehicle.y, building.y, building.y + building.h)
    let dx = vehicle.x - nearestX
    let dy = vehicle.y - nearestY
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared >= radius * radius) continue

    let distance = Math.sqrt(distanceSquared)
    let insideDepth = 0
    if (distance < 0.0001) {
      // Center is inside the rectangle: escape along the shallowest axis.
      const left = vehicle.x - building.x
      const right = building.x + building.w - vehicle.x
      const top = vehicle.y - building.y
      const bottom = building.y + building.h - vehicle.y
      insideDepth = Math.min(left, right, top, bottom)
      if (insideDepth === left) {
        dx = -1
        dy = 0
      } else if (insideDepth === right) {
        dx = 1
        dy = 0
      } else if (insideDepth === top) {
        dx = 0
        dy = -1
      } else {
        dx = 0
        dy = 1
      }
      distance = 0
    } else {
      dx /= distance
      dy /= distance
    }

    const push = radius + insideDepth - distance
    vehicle.x += dx * push
    vehicle.y += dy * push
    const intoWall = vehicle.vx * dx + vehicle.vy * dy
    if (intoWall < 0) {
      vehicle.vx -= intoWall * dx * 1.2
      vehicle.vy -= intoWall * dy * 1.2
    }
  }
}

export function resolveBoundaries(vehicle, world = defaultWorld) {
  const radius = PHYSICS.carRadius
  if (vehicle.x < radius) {
    vehicle.x = radius
    vehicle.vx = Math.abs(vehicle.vx) * PHYSICS.bounce
  } else if (vehicle.x > world.width - radius) {
    vehicle.x = world.width - radius
    vehicle.vx = -Math.abs(vehicle.vx) * PHYSICS.bounce
  }
  if (vehicle.y < radius) {
    vehicle.y = radius
    vehicle.vy = Math.abs(vehicle.vy) * PHYSICS.bounce
  } else if (vehicle.y > world.height - radius) {
    vehicle.y = world.height - radius
    vehicle.vy = -Math.abs(vehicle.vy) * PHYSICS.bounce
  }
}

// axis: { throttle, reverse, handbrake, steer } where steer is -1..1.
// Mutates the vehicle in place to avoid allocations in the animation loop.
export function stepVehicle(vehicle, axis, dt, world = defaultWorld) {
  if (dt <= 0) return vehicle

  const cos = Math.cos(vehicle.angle)
  const sin = Math.sin(vehicle.angle)
  let forward = vehicle.vx * cos + vehicle.vy * sin
  let lateral = -vehicle.vx * sin + vehicle.vy * cos

  if (axis.handbrake) {
    forward *= Math.exp(-PHYSICS.handbrakeDrag * dt)
  } else {
    if (axis.throttle) forward += PHYSICS.enginePower * dt
    if (axis.reverse) forward -= PHYSICS.reversePower * dt
    if (!axis.throttle && !axis.reverse) forward *= Math.exp(-PHYSICS.rollingDrag * dt)
  }

  // Quadratic air drag plus hard speed limits.
  forward -= forward * Math.abs(forward) * PHYSICS.airDrag * dt
  forward = clamp(forward, -PHYSICS.maxReverseSpeed, PHYSICS.maxForwardSpeed)

  if (axis.steer && Math.abs(forward) > PHYSICS.minSteerSpeed) {
    const steerFactor = 1 / (1 + Math.abs(forward) / PHYSICS.steerSpeedFalloff)
    vehicle.angle = normalizeAngle(
      vehicle.angle + axis.steer * PHYSICS.steerRate * steerFactor * Math.sign(forward) * dt,
    )
  }

  // The handbrake lowers lateral grip, so sideways momentum persists (drift).
  const grip = axis.handbrake ? PHYSICS.handbrakeGrip : PHYSICS.grip
  lateral *= Math.exp(-grip * dt)
  vehicle.drifting = Math.abs(lateral) > 35

  const newCos = Math.cos(vehicle.angle)
  const newSin = Math.sin(vehicle.angle)
  vehicle.vx = forward * newCos - lateral * newSin
  vehicle.vy = forward * newSin + lateral * newCos
  vehicle.x += vehicle.vx * dt
  vehicle.y += vehicle.vy * dt
  vehicle.speed = forward

  resolveBoundaries(vehicle, world)
  resolveBuildingCollision(vehicle, world.buildings)
  return vehicle
}

export function getDisplaySpeed(vehicle) {
  return Math.round(Math.abs(vehicle.speed) * SPEED_DISPLAY_FACTOR)
}
