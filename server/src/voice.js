// Pure WebRTC signaling rules. The server only relays signaling between two
// drivers in the same room; it never touches audio itself. Keeping validation
// here makes it testable without a Socket.IO instance.

export const VOICE_SDP_MAX_LENGTH = 20000
export const VOICE_CANDIDATE_MAX_LENGTH = 2000

// Absent/empty state means "not in voice". Only explicitly enabled drivers are
// tracked as participants, so a muted driver still appears in the peer list.
export function normalizeVoiceState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return {
    enabled: payload.enabled === true,
    muted: payload.muted === true,
  }
}

// kind is 'sdp' for offers/answers and 'candidate' for ICE candidates.
export function normalizeVoiceSignal(payload, kind = 'sdp') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const to = payload.to
  if (typeof to !== 'string' || !to) return null

  if (kind === 'sdp') {
    const sdp = payload.sdp
    if (typeof sdp !== 'string' || !sdp || sdp.length > VOICE_SDP_MAX_LENGTH) return null
    return { to, sdp }
  }

  const raw = payload.candidate
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.candidate !== 'string' || !raw.candidate) return null
  if (raw.candidate.length > VOICE_CANDIDATE_MAX_LENGTH) return null

  const candidate = { candidate: raw.candidate }
  if (raw.sdpMid === null || typeof raw.sdpMid === 'string') candidate.sdpMid = raw.sdpMid
  if (raw.sdpMLineIndex === null || Number.isInteger(raw.sdpMLineIndex)) {
    candidate.sdpMLineIndex = raw.sdpMLineIndex
  }
  if (raw.usernameFragment === null || typeof raw.usernameFragment === 'string') {
    candidate.usernameFragment = raw.usernameFragment
  }
  return { to, candidate }
}
