import assert from 'node:assert/strict'
import test from 'node:test'
import { CHAT_MAX_LENGTH, normalizeChatText } from '../src/chat.js'

test('accepts a trimmed single-line message', () => {
  assert.equal(normalizeChatText('  hello drivers  '), 'hello drivers')
  assert.equal(normalizeChatText('a'.repeat(CHAT_MAX_LENGTH)).length, CHAT_MAX_LENGTH)
})

test('rejects empty, oversized and non-string messages', () => {
  for (const value of [null, undefined, 123, {}, '', '   ', 'a'.repeat(CHAT_MAX_LENGTH + 1)]) {
    assert.equal(normalizeChatText(value), null)
  }
})

test('rejects control characters so chat stays one line', () => {
  assert.equal(normalizeChatText('hello\nworld'), null)
  assert.equal(normalizeChatText('hello\tworld'), null)
  assert.equal(normalizeChatText('hello\u0000world'), null)
})

test('leaves ordinary punctuation and unicode alone', () => {
  assert.equal(normalizeChatText('Let’s go! 🎮'), 'Let’s go! 🎮')
})
