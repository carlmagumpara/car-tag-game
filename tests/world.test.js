import assert from 'node:assert/strict'
import test from 'node:test'
import { WORLD } from '../src/features/car-game/game/constants.js'
import {
  createWorld,
  getSpawnPoints,
  isOnRoad,
  world,
} from '../src/features/car-game/game/world.js'
import { spawnFor } from '../server/src/players.js'

test('city generation is deterministic for a given seed', () => {
  assert.deepEqual(createWorld(12345), createWorld(12345))
  assert.notDeepEqual(createWorld(12345).buildings, createWorld(999).buildings)
})

test('wider roads leave buildable blocks with the expected geometry', () => {
  assert.ok(WORLD.roadWidth >= 120)
  const blockSize = WORLD.grid - WORLD.roadWidth - WORLD.sidewalk * 2
  assert.ok(blockSize > 100)
  for (const block of world.blocks) {
    assert.equal(block.size, blockSize)
    assert.equal(isOnRoad(block.x, block.y), false)
  }
})

test('the city contains houses, a 7/11 store, a hospital and playgrounds', () => {
  const kinds = new Set(world.buildings.map((building) => building.kind))
  assert.ok(kinds.has('house'))
  assert.ok(kinds.has('store'))
  assert.ok(kinds.has('hospital'))
  assert.ok(kinds.has('built'))
  assert.ok(world.buildings.filter((building) => building.kind === 'house').length > 40)
  assert.ok(world.playgrounds.length >= 2)
})

test('landmarks stay inside their blocks and off the roadways', () => {
  for (const building of world.buildings) {
    assert.ok(building.x >= 0 && building.y >= 0)
    assert.ok(building.x + building.w <= world.width)
    assert.ok(building.y + building.h <= world.height)
    assert.equal(isOnRoad(building.x + building.w / 2, building.y + building.h / 2), false)
  }
  for (const area of world.playgrounds) {
    assert.equal(isOnRoad(area.x + area.size / 2, area.y + area.size / 2), false)
  }
})

test('spawn points stay on the central road and match the server slots', () => {
  const points = getSpawnPoints(12)
  assert.equal(points.length, 12)
  for (const point of points) {
    assert.equal(isOnRoad(point.x, point.y), true)
    assert.equal(point.y, 1280)
  }
  for (let index = 0; index < 12; index += 1) {
    assert.deepEqual(points[index], spawnFor(index))
  }
})
