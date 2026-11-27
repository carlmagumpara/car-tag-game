// Shared tuning values. Distances are world pixels; time is seconds.
// These numbers are deliberately centralized so the server validator and the
// client simulation agree on the same limits.

export const WORLD = Object.freeze({
  width: 3200,
  height: 2560,
  grid: 320,
  roadWidth: 88,
  sidewalk: 14,
})

export const PHYSICS = Object.freeze({
  enginePower: 460,
  reversePower: 250,
  brakePower: 700, // handbrake deceleration, applied exponentially
  maxForwardSpeed: 420,
  maxReverseSpeed: 150,
  rollingDrag: 1.1,
  airDrag: 0.0012,
  steerRate: 3.0,
  minSteerSpeed: 8,
  steerSpeedFalloff: 260,
  grip: 8,
  handbrakeGrip: 1.3,
  handbrakeDrag: 2.2,
  bounce: 0.25,
  carRadius: 15,
})

export const NETWORK = Object.freeze({
  sendIntervalMs: 50, // 20 updates/sec client -> server
  serverTickMs: 50, // 20 updates/sec server -> clients
  interpolationDelayMs: 100,
  hudIntervalMs: 200,
})

// Interior px/s maps to a readable "km/h" display value.
export const SPEED_DISPLAY_FACTOR = 0.32

export const CAR_COLORS = Object.freeze([
  '#38bdf8',
  '#f472b6',
  '#a3e635',
  '#fbbf24',
  '#c084fc',
  '#fb7185',
  '#2dd4bf',
  '#f8fafc',
  '#f97316',
  '#818cf8',
])
