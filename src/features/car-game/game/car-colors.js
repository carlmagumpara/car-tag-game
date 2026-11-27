// The colors a driver can pick before joining a room. The server keeps its own
// copy (server/src/players.js) so it can run as a standalone service; keep the
// palette in sync.

export const CAR_COLORS = Object.freeze([
  { id: 'cyan', name: 'Cyan', hex: '#38bdf8' },
  { id: 'pink', name: 'Pink', hex: '#f472b6' },
  { id: 'lime', name: 'Lime', hex: '#a3e635' },
  { id: 'amber', name: 'Amber', hex: '#fbbf24' },
  { id: 'violet', name: 'Violet', hex: '#c084fc' },
  { id: 'rose', name: 'Rose', hex: '#fb7185' },
  { id: 'teal', name: 'Teal', hex: '#2dd4bf' },
  { id: 'white', name: 'White', hex: '#f8fafc' },
  { id: 'orange', name: 'Orange', hex: '#f97316' },
  { id: 'indigo', name: 'Indigo', hex: '#818cf8' },
])

export const DEFAULT_CAR_COLOR = CAR_COLORS[0].hex
export const CAR_COLOR_STORAGE_KEY = 'neon-drive:car-color'

export function normalizeCarColor(value, fallback = DEFAULT_CAR_COLOR) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().toLowerCase()
  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  const match = CAR_COLORS.find((color) => color.hex === candidate || color.id === trimmed)
  return match ? match.hex : fallback
}

// localStorage is unavailable in Node tests and can be disabled in browsers.
export function loadCarColor() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CAR_COLOR
    return normalizeCarColor(window.localStorage.getItem(CAR_COLOR_STORAGE_KEY))
  } catch {
    return DEFAULT_CAR_COLOR
  }
}

export function saveCarColor(value) {
  const color = normalizeCarColor(value)
  try {
    if (typeof window === 'undefined' || !window.localStorage) return color
    window.localStorage.setItem(CAR_COLOR_STORAGE_KEY, color)
  } catch {
    // Private browsing or a full storage quota: the choice still applies this session.
  }
  return color
}
