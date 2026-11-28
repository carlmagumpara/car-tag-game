// Chat input rules. Length mirrors server/src/chat.js — keep both in sync.

export const CHAT_MAX_LENGTH = 240

// Returns what the input may actually send. The server re-validates it, so
// this only keeps the UI consistent and prevents oversized payloads.
export function normalizeChatDraft(value) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, CHAT_MAX_LENGTH)
}
