import assert from 'node:assert/strict'
import test from 'node:test'
import { AI_TUNING, buildObstacleIndex, createAiBrain, driveAi, nearbyObstacles } from '../src/features/car-game/game/ai.js'
import { createVehicle } from '../src/features/car-game/game/physics.js'

const openWorld = (buildings = []) => ({
  width: 1200,
  height: 1200,
  buildings,
})

const aiAt = (x, y, options = {}) => {
  const vehicle = createVehicle({ id: 'ai', name: 'AI', color: '#fff', x, y, angle: 0, ...options })
  vehicle.isIt = options.isIt === true
  return vehicle
}

const drive = (ai, player, world, brain, now = 1000, dt = 0.1) =>
  driveAi({ ai, player, world, brain, now, dt })

test('AI brain starts centered and not stuck', () => {
  const brain = createAiBrain()
  assert.equal(brain.turn, 0)
  assert.equal(brain.stuckFor, 0)
  assert.equal(brain.reversingUntil, 0)
})

test('obstacle index finds only buildings near the query point', () => {
  const near = { x: 100, y: 100, w: 40, h: 40 }
  const far = { x: 900, y: 900, w: 40, h: 40 }
  const index = buildObstacleIndex(openWorld([near, far]))
  const found = nearbyObstacles(index, 120, 120, 100)
  assert.ok(found.includes(near))
  assert.ok(!found.includes(far))
})

test('the AI steers toward the player when it is it', () => {
  const ai = aiAt(200, 200, { isIt: true })
  const player = { x: 200, y: 500, angle: 0, speed: 0 }
  const input = drive(ai, player, openWorld(), createAiBrain())
  assert.equal(input.throttle, true)
  assert.equal(input.reverse, false)
  assert.equal(input.right, true)
  assert.equal(input.left, false)
})

test('the AI steers away from the player when it is not it', () => {
  const ai = aiAt(200, 200, { isIt: false })
  const player = { x: 200, y: 500, angle: 0, speed: 0 }
  const input = drive(ai, player, openWorld(), createAiBrain())
  assert.equal(input.left, true)
  assert.equal(input.right, false)
})

test('steering is smoothed instead of snapping to the target angle', () => {
  const ai = aiAt(200, 200, { isIt: true })
  const player = { x: 500, y: 500, angle: 0, speed: 0 }
  const brain = createAiBrain()
  const smallStep = drive(ai, player, openWorld(), brain, 1000, 0.005)
  assert.equal(smallStep.left, false)
  assert.equal(smallStep.right, false)

  const bigStep = drive(ai, player, openWorld(), createAiBrain(), 1000, 0.2)
  assert.equal(bigStep.right, true)
})

test('the AI detours around a building directly in front of it', () => {
  const building = { x: 220, y: 40, w: 120, h: 120 }
  const world = openWorld([building])
  const ai = aiAt(150, 100, { isIt: true })
  const player = { x: 600, y: 100, angle: 0, speed: 0 }
  const brain = createAiBrain()
  for (let i = 0; i < 5; i += 1) drive(ai, player, world, brain, 1000 + i * 100, 0.1)
  assert.ok(Math.abs(brain.turn) > 0.5)
})

test('the AI handbrake-drifts through sharp high-speed turns', () => {
  const ai = aiAt(200, 200, { isIt: true, speed: 300 })
  const player = { x: 200, y: 600, angle: 0, speed: 0 }
  const input = drive(ai, player, openWorld(), createAiBrain())
  assert.equal(input.handbrake, true)
})

test('a stalled AI reverses briefly to get unstuck', () => {
  const ai = aiAt(200, 200, { isIt: true, speed: 0 })
  const player = { x: 700, y: 200, angle: 0, speed: 0 }
  const brain = createAiBrain()
  let reversingInput = null
  for (let i = 0; i < 20 && !reversingInput; i += 1) {
    const input = drive(ai, player, openWorld(), brain, 1000 + i * 100, 0.1)
    if (input.reverse) reversingInput = input
  }
  assert.ok(reversingInput)
  assert.equal(reversingInput.throttle, false)
  assert.ok(brain.stuckFor < AI_TUNING.stuckAfterMs)
})

test('the AI avoids driving outside the world', () => {
  const ai = aiAt(30, 300, { isIt: true, angle: Math.PI })
  const player = { x: -400, y: 300, angle: 0, speed: 0 }
  const input = drive(ai, player, openWorld(), createAiBrain())
  assert.equal(input.right !== input.left, true)
})
