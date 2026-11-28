import assert from 'node:assert/strict'
import test from 'node:test'
import { CAR_COLORS, PlayerStore, normalizeCarColor, publicPlayer } from '../src/players.js'

test('requested colors are normalized against the shared palette', () => {
  assert.equal(normalizeCarColor('#F97316'), '#f97316')
  assert.equal(normalizeCarColor('teal'), '#2dd4bf')
  assert.equal(normalizeCarColor('not-a-color', null), null)
  assert.equal(normalizeCarColor('#123456', '#ffffff'), '#ffffff')
})

test('a chosen color is kept for the player and shared by publicPlayer', () => {
  const store = new PlayerStore()
  const player = store.add('socket-one', '#f97316')

  assert.equal(player.color, '#f97316')
  assert.equal(publicPlayer(player).color, '#f97316')
})

test('a stored player can be looked up by socket id for chat attribution', () => {
  const store = new PlayerStore()
  const player = store.add('socket-one', '#f97316')
  assert.equal(store.get('socket-one'), player)
  assert.equal(store.get('missing'), null)
})

test('players without a valid choice get distinct default colors', () => {
  const store = new PlayerStore()
  const first = store.add('one')
  const second = store.add('two', '#bad-color')
  const third = store.add('three', 'violet')

  assert.equal(first.color, CAR_COLORS[0].hex)
  assert.equal(second.color, CAR_COLORS[1].hex)
  assert.equal(third.color, '#c084fc')
})
