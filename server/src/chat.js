// Pure chat rules. Kept dependency-free so the standalone server can be
// deployed on its own and the rules can be unit-tested directly.
// The client trims to the same length (src/features/car-game/game/chat.js).

export const CHAT_MAX_LENGTH = 240

// Returns a safe single-line message, or null when the payload is not a
// message we should broadcast. React escapes text on the client, so no HTML
// sanitization happens here — we only enforce shape, length and control chars.
export function normalizeChatText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > CHAT_MAX_LENGTH) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return null
  return text
}
