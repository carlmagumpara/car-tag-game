import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeVoiceSignal,
  normalizeVoiceState,
  VOICE_CANDIDATE_MAX_LENGTH,
  VOICE_SDP_MAX_LENGTH,
} from '../src/voice.js'

test('voice state normalizes explicit booleans', () => {
  assert.deepEqual(normalizeVoiceState({ enabled: true, muted: false }), { enabled: true, muted: false })
  assert.deepEqual(normalizeVoiceState({ enabled: true, muted: true }), { enabled: true, muted: true })
  assert.deepEqual(normalizeVoiceState({ enabled: false }), { enabled: false, muted: false })
  assert.deepEqual(normalizeVoiceState({ enabled: 'yes', muted: 1 }), { enabled: false, muted: false })
})

test('voice state rejects non-object payloads', () => {
  for (const value of [null, undefined, 'voice', 42, []]) {
    assert.equal(normalizeVoiceState(value), null)
  }
})

test('SDP signals require a destination and a bounded description', () => {
  assert.deepEqual(normalizeVoiceSignal({ to: 'peer-one', sdp: 'v=0\r\n' }, 'sdp'), {
    to: 'peer-one',
    sdp: 'v=0\r\n',
  })
  for (const value of [
    null,
    { sdp: 'v=0' },
    { to: '', sdp: 'v=0' },
    { to: 5, sdp: 'v=0' },
    { to: 'peer-one', sdp: '' },
    { to: 'peer-one', sdp: 'x'.repeat(VOICE_SDP_MAX_LENGTH + 1) },
  ]) {
    assert.equal(normalizeVoiceSignal(value, 'sdp'), null)
  }
})

test('ICE candidates keep only known fields and enforce a size cap', () => {
  const candidate = {
    candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'abc',
    extra: 'ignored',
  }
  assert.deepEqual(normalizeVoiceSignal({ to: 'peer-one', candidate }, 'candidate'), {
    to: 'peer-one',
    candidate: {
      candidate: candidate.candidate,
      sdpMid: '0',
      sdpMLineIndex: 0,
      usernameFragment: 'abc',
    },
  })
  assert.equal(
    normalizeVoiceSignal(
      { to: 'peer-one', candidate: { candidate: 'x'.repeat(VOICE_CANDIDATE_MAX_LENGTH + 1) } },
      'candidate',
    ),
    null,
  )
  assert.equal(normalizeVoiceSignal({ to: 'peer-one', candidate: {} }, 'candidate'), null)
})
