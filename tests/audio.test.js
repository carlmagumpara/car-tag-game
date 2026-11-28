import assert from 'node:assert/strict'
import test from 'node:test'
import {
  playImmunitySound,
  playRoundEndSound,
  playTagSound,
  setAudioMuted,
  startBackgroundMusic,
  stopBackgroundMusic,
  stopEngine,
  unlockAudio,
  updateEngine,
} from '../src/features/car-game/game/audio.js'

test('audio helpers are safe no-ops outside a browser', () => {
  assert.doesNotThrow(() => {
    unlockAudio()
    startBackgroundMusic()
    updateEngine(240, true, true)
    setAudioMuted(true)
    playTagSound()
    playImmunitySound()
    playRoundEndSound(true)
    stopBackgroundMusic()
    stopEngine()
  })
})
