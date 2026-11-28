import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { createInterpolationBuffer, pruneBuffer, pushSnapshot } from '../game/interpolation.js'

const DEFAULT_TRANSPORTS = ['websocket', 'polling']

// Owns the socket lifecycle and UI-facing connection state. High-frequency
// movement never touches React state: snapshots go into playersRef and are
// interpolated by GameCanvas.
export function useMultiplayer({
  serverUrl,
  socketPath = '/socket.io',
  transports = DEFAULT_TRANSPORTS,
  roomId = null,
  carColor = null,
  driverName = null,
  enabled = true,
}) {
  const playersRef = useRef(new Map())
  const socketRef = useRef(null)
  const selfIdRef = useRef(null)

  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [activeRoomId, setActiveRoomId] = useState(roomId)
  const [self, setSelf] = useState(null)
  const [roster, setRoster] = useState([])
  const [playerCount, setPlayerCount] = useState(0)
  const [tagEvent, setTagEvent] = useState(null)
  const [game, setGame] = useState(null)
  const [chat, setChat] = useState([])
  const [socketEpoch, setSocketEpoch] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !serverUrl) {
      setStatus('offline')
      setActiveRoomId(roomId)
      setSelf(null)
      setTagEvent(null)
      setGame(null)
      setChat([])
      return undefined
    }

    let disposed = false
    setStatus('connecting')
    setError(null)
    setSelf(null)
    setRoster([])
    setPlayerCount(0)
    setTagEvent(null)
    setGame(null)
    setChat([])
    setSocketEpoch((value) => value + 1)
    setActiveRoomId(roomId)
    selfIdRef.current = null
    playersRef.current.clear()

    // auth is used by the browser; query also works for raw clients/health checks.
    const auth = {
      ...(roomId ? { roomId } : {}),
      ...(carColor ? { carColor } : {}),
      ...(driverName ? { name: driverName } : {}),
    }
    const query = {
      ...(roomId ? { room: roomId } : {}),
      ...(carColor ? { carColor } : {}),
      ...(driverName ? { name: driverName } : {}),
    }

    const socket = io(serverUrl, {
      path: socketPath,
      transports,
      // The server places this socket in the requested room and assigns the
      // chosen car color before it sends game:init.
      auth: Object.keys(auth).length ? auth : undefined,
      query: Object.keys(query).length ? query : undefined,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.4,
      timeout: 8000,
    })
    socketRef.current = socket

    const onConnect = () => {
      if (disposed) return
      setStatus('connected')
      setError(null)
    }

    const onInit = (data) => {
      if (disposed || !data?.player) return
      if (data.roomId) setActiveRoomId(data.roomId)
      selfIdRef.current = data.player.id
      setSelf(data.player)
      const others = Array.isArray(data.players) ? data.players : []
      const now = performance.now()
      playersRef.current.clear()
      for (const player of others) {
        const entry = { info: player, buffer: createInterpolationBuffer() }
        pushSnapshot(entry.buffer, player, now)
        playersRef.current.set(player.id, entry)
      }
      setRoster([data.player, ...others])
      setPlayerCount(others.length + 1)
    }

    const onJoined = (player) => {
      if (disposed || !player?.id || player.id === selfIdRef.current) return
      if (!playersRef.current.has(player.id)) {
        const entry = { info: player, buffer: createInterpolationBuffer() }
        pushSnapshot(entry.buffer, player, performance.now())
        playersRef.current.set(player.id, entry)
      }
      setRoster((previous) =>
        previous.some((item) => item.id === player.id) ? previous : [...previous, player],
      )
      setPlayerCount((count) => count + 1)
    }

    const onMoved = (payload) => {
      if (disposed || !Array.isArray(payload?.players)) return
      const now = performance.now()
      for (const state of payload.players) {
        if (!state || state.id === selfIdRef.current) continue
        let entry = playersRef.current.get(state.id)
        if (!entry) {
          entry = { info: state, buffer: createInterpolationBuffer() }
          playersRef.current.set(state.id, entry)
        }
        entry.info = state
        pushSnapshot(entry.buffer, state, now)
        pruneBuffer(entry.buffer, now)
      }
    }

    const onLeft = (payload) => {
      if (disposed || !payload?.id) return
      playersRef.current.delete(payload.id)
      setRoster((previous) => previous.filter((player) => player.id !== payload.id))
      setPlayerCount((count) => Math.max(0, count - 1))
    }

    const onTagHit = (payload) => {
      if (disposed || !payload?.itId) return
      setTagEvent({ ...payload, receivedAt: performance.now() })
      const updates = new Map(
        (Array.isArray(payload.players) ? payload.players : []).map((state) => [state.id, state]),
      )
      setSelf((current) => {
        const update = current && updates.get(current.id)
        return update ? { ...current, isIt: update.isIt, tags: update.tags } : current
      })
      setRoster((previous) =>
        previous.map((player) => {
          const update = updates.get(player.id)
          return update ? { ...player, isIt: update.isIt, tags: update.tags } : player
        }),
      )
      for (const [id, update] of updates) {
        const entry = playersRef.current.get(id)
        if (entry) entry.info = { ...entry.info, isIt: update.isIt, tags: update.tags }
      }
    }

    const onGameState = (payload) => {
      if (disposed || !payload?.phase) return
      setGame(payload)
      const readyIds = new Set(Array.isArray(payload.readyIds) ? payload.readyIds : [])
      setSelf((current) => {
        const ready = readyIds.has(current?.id)
        return current && current.ready !== ready ? { ...current, ready } : current
      })
      setRoster((previous) => {
        let changed = false
        const next = previous.map((player) => {
          const ready = readyIds.has(player.id)
          if (Boolean(player.ready) === ready) return player
          changed = true
          return { ...player, ready }
        })
        return changed ? next : previous
      })
    }

    const onDisconnect = (reason) => {
      if (disposed) return
      setStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting')
      setSelf(null)
      setRoster([])
      setPlayerCount(0)
      setTagEvent(null)
      setGame(null)
      setChat([])
      selfIdRef.current = null
      playersRef.current.clear()
    }

    const onConnectError = (connectionError) => {
      if (disposed) return
      setStatus('error')
      setError(connectionError?.message || 'Unable to reach the game server.')
    }

    const onReconnectAttempt = () => {
      if (disposed) return
      setStatus('reconnecting')
      setError(null)
    }

    const onGameError = (payload) => {
      if (disposed) return
      setError(payload?.message || 'The game server reported an error.')
      if (payload?.code === 'SERVER_FULL') setStatus('error')
    }

    const onChatMessage = (payload) => {
      if (disposed || !payload?.id) return
      setChat((previous) => [...previous, payload].slice(-50))
    }

    socket.on('connect', onConnect)
    socket.on('game:init', onInit)
    socket.on('player:joined', onJoined)
    socket.on('player:moved', onMoved)
    socket.on('player:left', onLeft)
    socket.on('tag:hit', onTagHit)
    socket.on('game:state', onGameState)
    socket.on('game:error', onGameError)
    socket.on('chat:message', onChatMessage)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('reconnect_attempt', onReconnectAttempt)

    return () => {
      disposed = true
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      selfIdRef.current = null
      playersRef.current.clear()
    }
  }, [serverUrl, socketPath, transports, roomId, carColor, driverName, enabled, attempt])

  const sendMove = useCallback((state) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit('player:move', {
      x: state.x,
      y: state.y,
      angle: state.angle,
      speed: state.speed,
    })
  }, [])

  const sendReady = useCallback((ready = true) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit('player:ready', { ready })
  }, [])

  const sendChat = useCallback((text) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit('chat:send', { text })
  }, [])

  const reconnect = useCallback(() => {
    const socket = socketRef.current
    if (socket) {
      socket.disconnect()
      socket.connect()
    } else {
      setAttempt((value) => value + 1)
    }
  }, [])

  useEffect(() => {
    if (!tagEvent) return undefined
    const timer = setTimeout(() => setTagEvent(null), 2500)
    return () => clearTimeout(timer)
  }, [tagEvent])

  return {
    status,
    error,
    self,
    roster,
    playerCount,
    playersRef,
    sendMove,
    reconnect,
    tagEvent,
    game,
    chat,
    sendChat,
    sendReady,
    socketRef,
    socketEpoch,
    roomId: activeRoomId,
  }
}
