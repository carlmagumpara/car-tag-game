import assert from 'node:assert/strict'
import test from 'node:test'
import { clearInput, createInput, getDriveAxis, GAME_KEYS, KEY_MAP, setInputKey } from '../src/features/car-game/game/input.js'

test('every configured key maps to a known action', () => {
  assert.equal(KEY_MAP.KeyW, 'throttle')
  assert.equal(KEY_MAP.ArrowDown, 'reverse')
  assert.equal(KEY_MAP.ArrowLeft, 'left')
  assert.equal(KEY_MAP.Space, 'handbrake')
  assert.ok(GAME_KEYS.includes('ArrowUp'))
})

test('setInputKey updates actions and ignores unrelated keys', () => {
  const input = createInput()
  assert.equal(setInputKey(input, 'KeyW', true), true)
  assert.equal(input.throttle, true)
  assert.equal(setInputKey(input, 'KeyW', false), true)
  assert.equal(input.throttle, false)
  assert.equal(setInputKey(input, 'KeyQ', true), false)
  assert.equal(Object.values(input).some(Boolean), false)
})

test('clearInput releases every held action', () => {
  const input = createInput()
  input.left = true
  input.handbrake = true
  clearInput(input)
  assert.deepEqual(input, createInput())
})

test('getDriveAxis combines steering and drive flags', () => {
  const input = createInput()
  input.right = true
  input.throttle = true
  assert.deepEqual(getDriveAxis(input), {
    throttle: true,
    reverse: false,
    handbrake: false,
    steer: 1,
  })
  input.right = false
  input.left = true
  assert.equal(getDriveAxis(input).steer, -1)
  input.left = true
  input.right = true
  assert.equal(getDriveAxis(input).steer, 0)
})
