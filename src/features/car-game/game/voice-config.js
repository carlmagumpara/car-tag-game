// Public, build-time WebRTC configuration. STUN URLs are not secrets; they are
// embedded in the client bundle. A TURN URL can be supplied when deploying
// behind restrictive NAT — see README §6.

export function getVoiceConfig() {
  const configured = import.meta.env.VITE_VOICE_STUN_URL
  const stunUrl = configured && configured.trim() ? configured.trim() : 'stun:stun.l.google.com:19302'
  return { iceServers: [{ urls: stunUrl }] }
}
