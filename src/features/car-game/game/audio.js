// Tiny synthesized feedback cues. No audio assets, no dependency, and no
// state: browsers only allow sound after a gesture, so the context is created
// lazily on the first key press or tap.

let context = null

function getContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!context) context = new AudioContextClass()
  if (context.state === 'suspended') context.resume().catch(() => {})
  return context
}

export function unlockAudio() {
  getContext()
}

function tone(frequency, duration, { type = 'sine', gain = 0.05, delay = 0, endFrequency } = {}) {
  const ctx = getContext()
  if (!ctx) return
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const volume = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
  volume.gain.setValueAtTime(0.0001, start)
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(volume)
  volume.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playTagSound() {
  tone(660, 0.1, { type: 'square', gain: 0.045 })
  tone(990, 0.16, { type: 'sine', gain: 0.04, delay: 0.06 })
}

export function playImmunitySound() {
  tone(520, 0.22, { type: 'sine', gain: 0.04, endFrequency: 780 })
}

export function playRoundEndSound(lost = false) {
  if (lost) {
    tone(330, 0.22, { type: 'triangle', gain: 0.045 })
    tone(220, 0.34, { type: 'triangle', gain: 0.04, delay: 0.18 })
  } else {
    tone(523, 0.14, { type: 'square', gain: 0.035 })
    tone(659, 0.14, { type: 'square', gain: 0.035, delay: 0.13 })
    tone(784, 0.26, { type: 'square', gain: 0.035, delay: 0.26 })
  }
}
