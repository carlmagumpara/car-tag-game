import assert from 'node:assert/strict'
import test from 'node:test'
import { createInterpolationBuffer, pruneBuffer, pushSnapshot, sampleState } from '../src/features/car-game/game/interpolation.js'

test('an empty buffer returns null', () => {
  assert.equal(sampleState(createInterpolationBuffer(), 100), null)
})

test('snapshots interpolate linearly between timestamps', () => {
  const buffer = createInterpolationBuffer()
  pushSnapshot(buffer, { x: 0, y: 10, angle: 0, speed: 0 }, 0)
  pushSnapshot(buffer, { x: 40, y: 50, angle: 1, speed: 20 }, 100)
  const output = {}
  const result = sampleState(buffer, 50, 0, output)
  assert.equal(result, output)
  assert.equal(output.x, 20)
  assert.equal(output.y, 30)
  assert.ok(Math.abs(output.angle - 0.5) < 0.0001)
  assert.equal(output.speed, 10)
})

test('angles interpolate along the shortest arc', () => {
  const buffer = createInterpolationBuffer()
  pushSnapshot(buffer, { x: 0, y: 0, angle: 3, speed: 0 }, 0)
  pushSnapshot(buffer, { x: 0, y: 0, angle: -3, speed: 0 }, 100)
  const sample = sampleState(buffer, 50, 0)
  assert.ok(Math.abs(sample.angle) > 3)
})

test('samples outside the buffer clamp to the nearest snapshot', () => {
  const buffer = createInterpolationBuffer()
  pushSnapshot(buffer, { x: 5, y: 5, angle: 0, speed: 0 }, 100)
  assert.equal(sampleState(buffer, 0, 0).x, 5)
  assert.equal(sampleState(buffer, 1000, 0).x, 5)
})

test('pruning removes stale snapshots but keeps the newest', () => {
  const buffer = createInterpolationBuffer()
  pushSnapshot(buffer, { x: 0, y: 0, angle: 0, speed: 0 }, 0)
  pushSnapshot(buffer, { x: 1, y: 0, angle: 0, speed: 0 }, 50)
  pushSnapshot(buffer, { x: 2, y: 0, angle: 0, speed: 0 }, 2000)
  pruneBuffer(buffer, 2100, 500)
  assert.equal(buffer.length, 1)
  assert.equal(buffer[0].x, 2)
})

test('the buffer is capped to 32 snapshots', () => {
  const buffer = createInterpolationBuffer()
  for (let i = 0; i < 50; i += 1) pushSnapshot(buffer, { x: i, y: 0, angle: 0, speed: 0 }, i)
  assert.equal(buffer.length, 32)
  assert.equal(buffer[31].x, 49)
})
