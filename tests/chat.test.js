import assert from 'node:assert/strict'
import test from 'node:test'
import { CHAT_MAX_LENGTH, normalizeChatDraft } from '../src/features/car-game/game/chat.js'

test('the draft limit matches the server message limit', () => {
  assert.equal(CHAT_MAX_LENGTH, 240)
})

test('drafts are trimmed and capped for the input', () => {
  assert.equal(normalizeChatDraft('  hello  '), 'hello')
  assert.equal(normalizeChatDraft('a'.repeat(300)).length, CHAT_MAX_LENGTH)
})

test('empty and non-string drafts send nothing', () => {
  assert.equal(normalizeChatDraft('   '), '')
  assert.equal(normalizeChatDraft(null), '')
  assert.equal(normalizeChatDraft(undefined), '')
  assert.equal(normalizeChatDraft(42), '')
})
