import { useCallback, useEffect, useRef, useState } from 'react'
import { getVoiceConfig } from '../game/voice-config.js'

const ICE_SERVERS = getVoiceConfig().iceServers

function describeError(error) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone permission was denied. Allow it in your browser to use voice.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.'
  }
  return error?.message || 'Voice chat could not be started.'
}

// WebRTC mesh voice. Signaling rides on the existing room-scoped Socket.IO
// connection; audio never touches the server. Peers are created only while the
// local mic is on, and the lower socket id always sends the offer so both
// drivers cannot offer at the same time.
export function useVoice({ socketRef, socketEpoch = 0, selfId, enabled = false, muted = false, onError }) {
  const [participants, setParticipants] = useState([])
  const [localReady, setLocalReady] = useState(false)
  const [error, setError] = useState(null)

  const localStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const mutedRef = useRef(muted)
  const onErrorRef = useRef(onError)
  const voiceIntentRef = useRef({ enabled: false, muted: false })

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const reportError = useCallback((value) => {
    setError(value)
    onErrorRef.current?.(value)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const emit = useCallback((type, payload) => {
    const socket = socketRef.current
    if (socket?.connected) socket.emit(type, payload)
  }, [socketRef])

  const closePeer = useCallback((id) => {
    const entry = peersRef.current.get(id)
    if (!entry) return
    peersRef.current.delete(id)
    try {
      entry.pc.close()
    } catch {
      // Already closed by the browser.
    }
    if (entry.audio) {
      entry.audio.pause()
      entry.audio.srcObject = null
      entry.audio.remove()
    }
  }, [])

  const ensurePeer = useCallback(async (id, initiate) => {
    if (peersRef.current.has(id)) return peersRef.current.get(id)

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    // One hidden audio element per remote driver; playing starts once the
    // connection carries a track. The mic button is a user gesture, so
    // autoplay policies normally allow this.
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.playsInline = true
    audio.setAttribute('aria-hidden', 'true')
    document.body.appendChild(audio)
    const entry = { pc, audio }
    peersRef.current.set(id, entry)

    const stream = localStreamRef.current
    if (stream) {
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream)
    }

    pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return
      const candidate = event.candidate.toJSON
        ? event.candidate.toJSON()
        : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          }
      emit('voice:ice', { to: id, candidate })
    })

    pc.addEventListener('track', (event) => {
      audio.srcObject = event.streams[0] || new MediaStream([event.track])
      const play = audio.play()
      if (play?.catch) play.catch(() => { /* may need another user gesture */ })
    })

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState !== 'failed') return
      reportError('Voice connection failed for one driver. They may need to rejoin voice.')
      closePeer(id)
    })

    if (initiate) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      emit('voice:offer', { to: id, sdp: pc.localDescription.sdp })
    }
    return entry
  }, [closePeer, emit, reportError])

  // Acquire/release the microphone with the user's "join voice" toggle.
  useEffect(() => {
    if (!enabled || !selfId || !navigator.mediaDevices?.getUserMedia) {
      for (const track of localStreamRef.current?.getTracks() || []) track.stop()
      localStreamRef.current = null
      setLocalReady(false)
      if (enabled && selfId && !navigator.mediaDevices?.getUserMedia) {
        reportError('This browser does not support microphone access.')
      }
      return undefined
    }

    let cancelled = false
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    }).then((stream) => {
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      localStreamRef.current = stream
      for (const track of stream.getAudioTracks()) track.enabled = !mutedRef.current
      setLocalReady(true)
    }).catch((error) => {
      if (!cancelled) reportError(describeError(error))
    })

    return () => {
      cancelled = true
      for (const track of localStreamRef.current?.getTracks() || []) track.stop()
      localStreamRef.current = null
      setLocalReady(false)
    }
  }, [enabled, selfId, reportError])

  // Build/tear down peer connections to match the room's voice participants.
  useEffect(() => {
    if (!enabled || !localReady || !selfId) {
      for (const id of Array.from(peersRef.current.keys())) closePeer(id)
      return
    }
    const wanted = new Set(participants.map((peer) => peer.id).filter((id) => id !== selfId))
    for (const id of Array.from(peersRef.current.keys())) {
      if (!wanted.has(id)) closePeer(id)
    }
    for (const id of wanted) {
      if (peersRef.current.has(id)) continue
      const initiate = selfId < id
      ensurePeer(id, initiate).catch((error) => reportError(describeError(error)))
    }
  }, [participants, enabled, localReady, selfId, closePeer, ensurePeer, reportError])

  useEffect(() => {
    for (const track of localStreamRef.current?.getAudioTracks() || []) {
      track.enabled = !muted
    }
  }, [muted, localReady])

  // Announce only once the mic is actually live, otherwise another driver
  // could send an offer before this client has a local track to share.
  useEffect(() => {
    const state = { enabled: Boolean(enabled && localReady), muted: Boolean(muted) }
    voiceIntentRef.current = state
    emit('voice:state', state)
  }, [enabled, muted, localReady, socketEpoch, emit])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !selfId) return undefined

    const onPeers = (payload) => {
      const peers = Array.isArray(payload?.peers) ? payload.peers : []
      setParticipants(peers.filter((peer) => peer && typeof peer.id === 'string'))
    }

    const onOffer = async ({ from, sdp } = {}) => {
      if (!from || typeof sdp !== 'string') return
      try {
        const entry = await ensurePeer(from, false)
        await entry.pc.setRemoteDescription({ type: 'offer', sdp })
        const answer = await entry.pc.createAnswer()
        await entry.pc.setLocalDescription(answer)
        emit('voice:answer', { to: from, sdp: entry.pc.localDescription.sdp })
      } catch (error) {
        reportError(describeError(error))
      }
    }

    const onAnswer = async ({ from, sdp } = {}) => {
      if (!from || typeof sdp !== 'string') return
      try {
        const entry = await ensurePeer(from, false)
        await entry.pc.setRemoteDescription({ type: 'answer', sdp })
      } catch (error) {
        reportError(describeError(error))
      }
    }

    const onIce = async ({ from, candidate } = {}) => {
      if (!from || !candidate) return
      try {
        const entry = await ensurePeer(from, false)
        await entry.pc.addIceCandidate(candidate)
      } catch {
        // A candidate can arrive after its peer was closed; not fatal.
      }
    }

    // A fresh socket may connect after the toggle changed, so restate intent.
    const onConnect = () => {
      emit('voice:state', voiceIntentRef.current)
    }

    socket.on('voice:peers', onPeers)
    socket.on('voice:offer', onOffer)
    socket.on('voice:answer', onAnswer)
    socket.on('voice:ice', onIce)
    socket.on('connect', onConnect)
    onConnect()

    return () => {
      socket.off('voice:peers', onPeers)
      socket.off('voice:offer', onOffer)
      socket.off('voice:answer', onAnswer)
      socket.off('voice:ice', onIce)
      socket.off('connect', onConnect)
    }
  }, [socketRef, socketEpoch, selfId, ensurePeer, emit, reportError])

  useEffect(() => {
    if (!selfId) setParticipants([])
  }, [selfId])

  useEffect(() => () => {
    for (const id of Array.from(peersRef.current.keys())) closePeer(id)
    for (const track of localStreamRef.current?.getTracks() || []) track.stop()
    localStreamRef.current = null
  }, [closePeer])

  return { participants, error, ready: localReady, clearError }
}
