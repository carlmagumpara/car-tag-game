import assert from 'node:assert/strict'
import test from 'node:test'
import { createRateLimiter, SERVER_BOUNDS, validateMove } from '../src/validation.js'

const validMove = { x: 1600, y: 1280, angle: 0.5, speed: 120 }

test('accepts a well-formed movement update', () => {
  const result = validateMove(validMove)
  assert.equal(result.ok, true)
  assert.deepEqual(result.state, validMove)
})

test('rejects malformed payloads and non-finite values', () => {
  for (const payload of [null, undefined, [], 'move', { ...validMove, x: NaN }, { ...validMove, speed: 'fast' }]) {
    assert.equal(validateMove(payload).ok, false)
  }
})

test('clamps coordinates and speed to configured limits', () => {
  const result = validateMove({ x: -5000, y: 99999, angle: 0, speed: 99999 })
  assert.equal(result.ok, true)
  assert.equal(result.state.x, SERVER_BOUNDS.carRadius)
  assert.equal(result.state.y, SERVER_BOUNDS.height - SERVER_BOUNDS.carRadius)
  assert.equal(result.state.speed, SERVER_BOUNDS.maxForwardSpeed)

  const reverse = validateMove({ ...validMove, speed: -99999 })
  assert.equal(reverse.state.speed, -SERVER_BOUNDS.maxReverseSpeed)
})

test('normalizes oversized angles', () => {
  const result = validateMove({ ...validMove, angle: Math.PI * 3 })
  assert.ok(Math.abs(result.state.angle) <= Math.PI)
})

test('the rate limiter enforces a minimum interval and a per-second budget', () => {
  const limiter = createRateLimiter({ minIntervalMs: 50, maxPerSecond: 3 })
  assert.equal(limiter.allow(1000), true)
  assert.equal(limiter.allow(1020), false)
  assert.equal(limiter.allow(1060), true)
  assert.equal(limiter.allow(1120), true)
  assert.equal(limiter.allow(1180), false) // 3 updates in this 1s window
  limiter.reset()
  assert.equal(limiter.allow(1190), true)
})

test('validateMove reports rate limiting without consuming malformed payloads', () => {
  const limiter = createRateLimiter({ minIntervalMs: 100, maxPerSecond: 10 })
  assert.equal(validateMove(validMove, { now: 1000, limiter }).ok, true)
  const limited = validateMove(validMove, { now: 1010, limiter })
  assert.equal(limited.ok, false)
  assert.equal(limited.code, 'RATE_LIMITED')
  const malformed = validateMove({ ...validMove, x: NaN }, { now: 1100, limiter })
  assert.equal(malformed.code, 'INVALID_NUMBER')
})
