// Tiny synthesized soundtrack, engine and feedback cues. No audio assets, no
// dependency and no state in React: browsers only allow sound after a gesture,
// so the context is created on the first key press or tap and all hot-path
// updates go straight to WebAudio nodes.

let context = null
let master = null
let musicBus = null
let engine = null
let musicTimer = null
let musicWanted = false
let nextNoteAt = 0
let step = 0
let muted = false

const BASS = [55, 55, 65.41, 73.42] // A1, A1, C2, D2 — a slow four-bar neon loop
const ARP = [220, 261.63, 329.63, 392, 329.63, 261.63, 196, 261.63]
const STEP_SECONDS = 0.24

function getContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!context) {
    context = new AudioContextClass()
    master = context.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(context.destination)
    musicBus = context.createGain()
    musicBus.gain.value = 0
    musicBus.connect(master)
    context.onstatechange = maybeStartMusic
  }
  if (context.state === 'suspended') context.resume().catch(() => {})
  return context
}

function note(time, frequency, duration, { type = 'square', peak = 0.02, destination = master } = {}) {
  const oscillator = context.createOscillator()
  const volume = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, time)
  volume.gain.setValueAtTime(0.0001, time)
  volume.gain.exponentialRampToValueAtTime(peak, time + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, time + duration)
  oscillator.connect(volume)
  volume.connect(destination)
  oscillator.start(time)
  oscillator.stop(time + duration + 0.02)
}

function scheduleMusic() {
  if (!context || context.state !== 'running') return
  // A backgrounded tab throttles timers; skip missed beats instead of firing
  // a burst of notes at once when it becomes visible again.
  if (nextNoteAt < context.currentTime - 0.2) nextNoteAt = context.currentTime + 0.05
  while (nextNoteAt < context.currentTime + 0.12) {
    if (step % 8 === 0) {
      note(nextNoteAt, BASS[Math.floor(step / 8) % BASS.length], 0.9, {
        type: 'triangle',
        peak: 0.085,
        destination: musicBus,
      })
    }
    note(nextNoteAt, ARP[step % ARP.length], 0.14, {
      type: 'square',
      peak: 0.022,
      destination: musicBus,
    })
    step += 1
    nextNoteAt += STEP_SECONDS
  }
}

function maybeStartMusic() {
  if (!context || context.state !== 'running' || !musicWanted || musicTimer) return
  musicBus.gain.setTargetAtTime(0.7, context.currentTime, 0.15)
  nextNoteAt = context.currentTime + 0.06
  musicTimer = setInterval(scheduleMusic, 50)
  scheduleMusic()
}

export function unlockAudio() {
  const ctx = getContext()
  if (!ctx) return
  maybeStartMusic()
}

export function startBackgroundMusic() {
  musicWanted = true
  maybeStartMusic()
}

export function stopBackgroundMusic() {
  musicWanted = false
  if (musicTimer) {
    clearInterval(musicTimer)
    musicTimer = null
  }
  if (context && musicBus) {
    musicBus.gain.setTargetAtTime(0.0001, context.currentTime, 0.06)
  }
}

export function setAudioMuted(value) {
  muted = Boolean(value)
  if (context && master) {
    master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.02)
  }
}

function createEngine() {
  const low = context.createOscillator()
  const sub = context.createOscillator()
  const filter = context.createBiquadFilter()
  const subMix = context.createGain()
  const volume = context.createGain()
  low.type = 'sawtooth'
  sub.type = 'square'
  filter.type = 'lowpass'
  filter.Q.value = 5
  subMix.gain.value = 0.28
  volume.gain.value = 0
  low.connect(filter)
  sub.connect(subMix)
  subMix.connect(filter)
  filter.connect(volume)
  volume.connect(master)
  low.start()
  sub.start()
  return { low, sub, filter, volume }
}

// Called from the rAF loop: pitch and brightness track speed, and the level
// rises while a drive key is held. No React state, no per-frame allocation.
export function updateEngine(speed, accelerating, active) {
  // Never create an AudioContext here: this runs before the first gesture too.
  if (!context || context.state !== 'running') return
  if (!engine) engine = createEngine()
  const now = context.currentTime
  const load = Math.min(Math.abs(speed) / 420, 1)
  const frequency = 52 + load * 110 + (accelerating ? 14 : 0)
  engine.low.frequency.setTargetAtTime(frequency, now, 0.05)
  engine.sub.frequency.setTargetAtTime(frequency / 2, now, 0.05)
  engine.filter.frequency.setTargetAtTime(320 + load * 1500, now, 0.06)
  const level = active ? (accelerating ? 0.05 : 0.012 + load * 0.014) : 0
  engine.volume.gain.setTargetAtTime(level, now, 0.08)
}

export function stopEngine() {
  if (!engine) return
  const dying = engine
  engine = null
  if (!context) return
  dying.volume.gain.setTargetAtTime(0, context.currentTime, 0.03)
  setTimeout(() => {
    try {
      dying.low.stop()
      dying.sub.stop()
    } catch {
      // Already stopped; nothing to clean up.
    }
  }, 200)
}

export function playTagSound() {
  if (!context) return
  const start = context.currentTime
  note(start, 660, 0.1, { type: 'square', peak: 0.045 })
  note(start + 0.06, 990, 0.16, { peak: 0.04 })
}

export function playImmunitySound() {
  if (!context) return
  const start = context.currentTime
  const oscillator = context.createOscillator()
  const volume = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(520, start)
  oscillator.frequency.exponentialRampToValueAtTime(780, start + 0.22)
  volume.gain.setValueAtTime(0.0001, start)
  volume.gain.exponentialRampToValueAtTime(0.04, start + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
  oscillator.connect(volume)
  volume.connect(master)
  oscillator.start(start)
  oscillator.stop(start + 0.24)
}

export function playRoundEndSound(lost = false) {
  if (!context) return
  const start = context.currentTime
  if (lost) {
    note(start, 330, 0.22, { type: 'triangle', peak: 0.045 })
    note(start + 0.18, 220, 0.34, { type: 'triangle', peak: 0.04 })
  } else {
    note(start, 523, 0.14, { type: 'square', peak: 0.035 })
    note(start + 0.13, 659, 0.14, { type: 'square', peak: 0.035 })
    note(start + 0.26, 784, 0.26, { type: 'square', peak: 0.035 })
  }
}
