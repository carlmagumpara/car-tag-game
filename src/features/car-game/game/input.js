// Pure input mapping, shared by the keyboard hook and touch controls.
export const KEY_MAP = Object.freeze({
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'reverse',
  ArrowDown: 'reverse',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
})

export const GAME_KEYS = Object.keys(KEY_MAP)

export function createInput() {
  return {
    throttle: false,
    reverse: false,
    left: false,
    right: false,
    handbrake: false,
  }
}

// Returns true when the key is a mapped game key (useful for preventDefault).
export function setInputKey(input, code, pressed) {
  const action = KEY_MAP[code]
  if (!action) return false
  input[action] = pressed
  return true
}

export function clearInput(input) {
  for (const action of Object.keys(input)) input[action] = false
}

export function getDriveAxis(input) {
  return {
    throttle: input.throttle,
    reverse: input.reverse,
    handbrake: input.handbrake,
    steer: Number(input.right) - Number(input.left),
  }
}
