import { PHYSICS, WORLD } from './constants.js'
import { clamp, normalizeAngle } from './physics.js'

// AI driving is deliberately pure: it reads a vehicle, the player's vehicle and
// the shared world, then returns the same action object the keyboard produces.
// Physics, collisions and rendering stay in the existing systems.

export const AI_TUNING = Object.freeze({
  lookAhead: 160, // world pixels probed for obstacles in front of the car
  probeStep: 32,
  turnPenalty: 45, // score cost per radian of deviation from the desired heading
  steerGain: 2.6,
  steerSmoothing: 9, // per second, so steering feels smooth at any frame rate
  steerDeadzone: 0.08,
  handbrakeAngle: 0.95,
  handbrakeSpeed: 150,
  leadFactor: 0.22, // seconds of player velocity to aim ahead when chasing
  fleeDistance: 320,
  stuckSpeed: 25,
  stuckAfterMs: 1400,
  reverseForMs: 550,
})

const CANDIDATE_OFFSETS = Object.freeze([
  0, -0.35, 0.35, -0.7, 0.7, -1.15, 1.15, -1.7, 1.7, Math.PI,
])

export function createAiBrain() {
  return { turn: 0, stuckFor: 0, reversingUntil: 0 }
}

// Buildings are bucketed once per world so the steering probe only inspects
// nearby rectangles. The cache is keyed by the world object, never mutated.
const indexCache = new WeakMap()

export function buildObstacleIndex(world, cellSize = WORLD.grid) {
  const cells = new Map()
  for (const building of world.buildings || []) {
    const minX = Math.floor(building.x / cellSize)
    const maxX = Math.floor((building.x + building.w) / cellSize)
    const minY = Math.floor(building.y / cellSize)
    const maxY = Math.floor((building.y + building.h) / cellSize)
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const key = `${cx},${cy}`
        if (!cells.has(key)) cells.set(key, [])
        cells.get(key).push(building)
      }
    }
  }
  return { cellSize, cells }
}

export function nearbyObstacles(index, x, y, range) {
  const { cellSize, cells } = index
  const minX = Math.floor((x - range) / cellSize)
  const maxX = Math.floor((x + range) / cellSize)
  const minY = Math.floor((y - range) / cellSize)
  const maxY = Math.floor((y + range) / cellSize)
  const found = new Set()
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (const building of cells.get(`${cx},${cy}`) || []) found.add(building)
    }
  }
  return [...found]
}

function indexForWorld(world) {
  let index = indexCache.get(world)
  if (!index) {
    index = buildObstacleIndex(world)
    indexCache.set(world, index)
  }
  return index
}

// Distance at which the first obstacle (or the world edge) blocks this heading.
function clearanceAlong(x, y, angle, range, obstacles, radius, world) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let distance = AI_TUNING.probeStep; distance <= range; distance += AI_TUNING.probeStep) {
    const px = x + cos * distance
    const py = y + sin * distance
    if (
      px < radius || py < radius ||
      px > world.width - radius || py > world.height - radius
    ) return distance
    for (const building of obstacles) {
      if (
        px >= building.x - radius && px <= building.x + building.w + radius &&
        py >= building.y - radius && py <= building.y + building.h + radius
      ) return distance
    }
  }
  return range
}

function desiredHeading(ai, player, chasing, now) {
  if (!player) return ai.angle
  if (chasing) {
    // Lead the player using its signed speed so the AI cuts off a moving car
    // instead of always driving to where the player used to be.
    const lead = clamp(player.speed || 0, -300, 420) * AI_TUNING.leadFactor
    const targetX = player.x + Math.cos(player.angle || 0) * lead
    const targetY = player.y + Math.sin(player.angle || 0) * lead
    return Math.atan2(targetY - ai.y, targetX - ai.x)
  }

  const dx = ai.x - player.x
  const dy = ai.y - player.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return ai.angle + Math.PI
  // Aim to put some distance between the cars, with a slow sway so a cornered
  // AI does not oscillate between two identical headings.
  const sway = Math.sin(now / 620) * 0.28
  return Math.atan2(dy, dx) + sway * Math.min(1, distance / AI_TUNING.fleeDistance)
}

function chooseHeading(desired, ai, obstacles, world, radius) {
  let bestAngle = desired
  let bestScore = -Infinity
  for (const offset of CANDIDATE_OFFSETS) {
    const angle = normalizeAngle(desired + offset)
    const clearance = clearanceAlong(
      ai.x, ai.y, angle, AI_TUNING.lookAhead, obstacles, radius, world,
    )
    const score = clearance - Math.abs(offset) * AI_TUNING.turnPenalty
    if (score > bestScore) {
      bestScore = score
      bestAngle = angle
    }
  }
  return bestAngle
}

// Returns { throttle, reverse, handbrake, left, right } — the same shape as
// createInput() in game/input.js, ready for getDriveAxis() and stepVehicle().
export function driveAi({ ai, player, world, brain, now, dt }) {
  const chasing = Boolean(ai.isIt)
  const radius = PHYSICS.carRadius
  const obstacles = nearbyObstacles(
    indexForWorld(world), ai.x, ai.y, AI_TUNING.lookAhead + 40,
  )
  const desired = desiredHeading(ai, player, chasing, now)
  const heading = chooseHeading(desired, ai, obstacles, world, radius)

  const error = normalizeAngle(heading - ai.angle)
  const targetTurn = clamp(error * AI_TUNING.steerGain, -1, 1)
  const smoothing = Math.min(1, Math.max(0, dt) * AI_TUNING.steerSmoothing)
  brain.turn += (targetTurn - brain.turn) * smoothing

  const speed = Math.abs(ai.speed || 0)
  if (speed < AI_TUNING.stuckSpeed) brain.stuckFor += Math.max(0, dt) * 1000
  else brain.stuckFor = 0
  if (brain.stuckFor >= AI_TUNING.stuckAfterMs) {
    brain.reversingUntil = now + AI_TUNING.reverseForMs
    brain.stuckFor = 0
  }
  const reversing = now < brain.reversingUntil
  const handbrake = !reversing && Math.abs(error) > AI_TUNING.handbrakeAngle && speed > AI_TUNING.handbrakeSpeed

  return {
    throttle: !reversing,
    reverse: reversing,
    handbrake,
    left: brain.turn < -AI_TUNING.steerDeadzone,
    right: brain.turn > AI_TUNING.steerDeadzone,
  }
}
