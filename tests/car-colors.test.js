import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CAR_COLORS,
  CAR_COLOR_STORAGE_KEY,
  DEFAULT_CAR_COLOR,
  loadCarColor,
  normalizeCarColor,
  saveCarColor,
} from '../src/features/car-game/game/car-colors.js'

test('the palette has unique hex values and a valid default', () => {
  assert.equal(new Set(CAR_COLORS.map((entry) => entry.hex)).size, CAR_COLORS.length)
  for (const entry of CAR_COLORS) assert.match(entry.hex, /^#[0-9a-f]{6}$/)
  assert.ok(CAR_COLORS.some((entry) => entry.hex === DEFAULT_CAR_COLOR))
})

test('normalizing accepts hex, ids and casing but rejects unknown colors', () => {
  assert.equal(normalizeCarColor('#F97316'), '#f97316')
  assert.equal(normalizeCarColor('  teal  '), '#2dd4bf')
  assert.equal(normalizeCarColor('indigo'), '#818cf8')
  assert.equal(normalizeCarColor('#123456'), DEFAULT_CAR_COLOR)
  assert.equal(normalizeCarColor(null), DEFAULT_CAR_COLOR)
  assert.equal(normalizeCarColor('#f97316', '#ffffff'), '#f97316')
  assert.equal(normalizeCarColor('nope', '#ffffff'), '#ffffff')
})

test('storage helpers fall back safely without a browser', () => {
  assert.equal(loadCarColor(), DEFAULT_CAR_COLOR)
  assert.equal(saveCarColor('#f97316'), '#f97316')
  assert.equal(saveCarColor('nope'), DEFAULT_CAR_COLOR)
  assert.equal(CAR_COLOR_STORAGE_KEY, 'neon-drive:car-color')
})
