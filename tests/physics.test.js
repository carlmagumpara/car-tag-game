import assert from 'node:assert/strict'
import test from 'node:test'
import { PHYSICS } from '../src/features/car-game/game/constants.js'
import {
  clamp,
  createVehicle,
  getDisplaySpeed,
  normalizeAngle,
  resolveBuildingCollision,
  resolveBoundaries,
  stepVehicle,
} from '../src/features/car-game/game/physics.js'
import { world } from '../src/features/car-game/game/world.js'

const drive = (axis) => ({ throttle: false, reverse: false, handbrake: false, steer: 0, ...axis })
const simulate = (vehicle, axis, seconds, dt = 0.01, map = world) => {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i += 1) stepVehicle(vehicle, axis, dt, map)
  return vehicle
}

test('acceleration moves the car forward and respects the speed cap', () => {
  const car = createVehicle({ x: 1600, y: 1280 })
  simulate(car, drive({ throttle: true }), 10)
  assert.ok(car.x > 1600)
  assert.ok(car.speed > 0)
  assert.ok(car.speed <= PHYSICS.maxForwardSpeed + 0.001)
})

test('reverse moves the car backward and respects the reverse cap', () => {
  const car = createVehicle({ x: 1600, y: 1280 })
  simulate(car, drive({ reverse: true }), 10)
  assert.ok(car.x < 1600)
  assert.ok(car.speed >= -PHYSICS.maxReverseSpeed - 0.001)
  assert.ok(getDisplaySpeed(car) > 0)
})

test('coasting slows the car and the handbrake slows it faster', () => {
  const coasting = simulate(createVehicle({ x: 1000, y: 1000 }), drive({ throttle: true }), 2)
  const braking = { ...coasting }
  simulate(coasting, drive(), 1)
  simulate(braking, drive({ handbrake: true }), 1)
  assert.ok(braking.speed < coasting.speed)
})

test('steering changes heading only while moving, and direction flips in reverse', () => {
  const parked = createVehicle({ x: 1000, y: 1000 })
  simulate(parked, drive({ steer: 1 }), 1)
  assert.equal(parked.angle, 0)

  const forward = simulate(createVehicle({ x: 1000, y: 1000 }), drive({ throttle: true, steer: 1 }), 1)
  assert.ok(forward.angle > 0)

  const reverse = simulate(createVehicle({ x: 1000, y: 1000 }), drive({ reverse: true, steer: 1 }), 1)
  assert.ok(reverse.angle < 0)
})

test('the handbrake preserves lateral velocity for drifting', () => {
  const gripped = createVehicle({ x: 1000, y: 1000, vx: 0, vy: 100 })
  const drifting = createVehicle({ x: 1000, y: 1000, vx: 0, vy: 100 })
  stepVehicle(gripped, drive(), 0.3)
  stepVehicle(drifting, drive({ handbrake: true }), 0.3)
  assert.ok(drifting.vy > gripped.vy)
  assert.equal(drifting.drifting, true)
})

test('world boundaries clamp position and bounce velocity', () => {
  const car = createVehicle({ x: 5, y: 5, vx: -200, vy: -200 })
  resolveBoundaries(car, world)
  assert.equal(car.x, PHYSICS.carRadius)
  assert.equal(car.y, PHYSICS.carRadius)
  assert.ok(car.vx >= 0)
  assert.ok(car.vy >= 0)
})

test('collision resolution keeps a car out of buildings', () => {
  const building = { x: 100, y: 0, w: 50, h: 50 }
  const map = { width: 1000, height: 1000, buildings: [building] }
  const car = createVehicle({ x: 90, y: 25, vx: 200 })
  stepVehicle(car, drive(), 0.1, map)
  const nearestX = Math.min(Math.max(car.x, building.x), building.x + building.w)
  const nearestY = Math.min(Math.max(car.y, building.y), building.y + building.h)
  const distance = Math.hypot(car.x - nearestX, car.y - nearestY)
  assert.ok(distance >= PHYSICS.carRadius - 0.001)
  assert.ok(!Number.isNaN(car.x))
})

test('large dt does not tunnel through the world edge', () => {
  const car = createVehicle({ x: 100, y: 100, vx: -100000 })
  resolveBoundaries(car, world)
  assert.ok(car.x >= PHYSICS.carRadius)
})

test('helper math behaves at wrap boundaries', () => {
  assert.equal(clamp(5, 0, 3), 3)
  assert.equal(clamp(-5, 0, 3), 0)
  assert.ok(Math.abs(normalizeAngle(Math.PI * 3)) - Math.PI < 0.001)
})

test('delta time produces consistent movement across frame rates', () => {
  const fine = simulate(createVehicle({ x: 1600, y: 1280 }), drive({ throttle: true }), 1, 0.01)
  const coarse = simulate(createVehicle({ x: 1600, y: 1280 }), drive({ throttle: true }), 1, 0.05)
  assert.ok(Math.abs(fine.x - coarse.x) < 15)
})
