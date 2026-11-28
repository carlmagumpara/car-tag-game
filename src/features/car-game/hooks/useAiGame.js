import { useCallback, useEffect, useRef, useState } from 'react'
import { createAiBrain, driveAi } from '../game/ai.js'
import {
  AI_MATCH,
  applyAiTag,
  assignAiIt,
  createAiMatch,
  evaluateAiTag,
  maybeFinishAiRound,
  publicAiGame,
  setAiReady,
} from '../game/ai-match.js'
import { CAR_COLORS } from '../game/car-colors.js'
import { NETWORK } from '../game/constants.js'
import { createInterpolationBuffer, pruneBuffer, pushSnapshot } from '../game/interpolation.js'
import { getDriveAxis } from '../game/input.js'
import { createVehicle, stepVehicle } from '../game/physics.js'
import { getSpawnPoints, world } from '../game/world.js'

const AI_ID = 'ai-rival'
const AI_NAME = 'AI Rival'
const AI_FALLBACK_COLOR = '#fb7185'

// Keep the rival visually distinct from the player's chosen color.
function pickAiColor(playerColor) {
  return CAR_COLORS.map((entry) => entry.hex).find((hex) => hex !== playerColor) || AI_FALLBACK_COLOR
}

// Owns the whole local match. No socket is created here: the AI is stepped from
// the existing GameCanvas rAF loop through the sendMove callback, so it shares
// physics, collisions, camera and rendering with multiplayer without touching
// any Socket.IO state. High-frequency data stays in refs; React only sees UI.
export function useAiGame({ carColor, driverName }) {
  const playersRef = useRef(new Map())
  const playerRef = useRef(null)
  const aiRef = useRef(null)
  const brainRef = useRef(createAiBrain())
  const matchRef = useRef(null)
  const lastTickRef = useRef(0)

  const [round, setRound] = useState(0)
  const [self, setSelf] = useState(null)
  const [roster, setRoster] = useState([])
  const [game, setGame] = useState(null)
  const [tagEvent, setTagEvent] = useState(null)

  const syncUi = useCallback(() => {
    const player = playerRef.current
    const ai = aiRef.current
    if (!player || !ai) return
    const view = (entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      x: entry.x,
      y: entry.y,
      angle: entry.angle,
      speed: entry.speed || 0,
      isIt: Boolean(entry.isIt),
      tags: entry.tags || 0,
      ready: Boolean(entry.ready),
    })
    setSelf(view(player))
    setRoster([view(player), view(ai)])
    const remote = playersRef.current.get(AI_ID)
    if (remote) {
      remote.info = {
        id: ai.id,
        name: ai.name,
        color: ai.color,
        isIt: Boolean(ai.isIt),
        tags: ai.tags || 0,
      }
    }
  }, [])

  // A new round (or a fresh mount) rebuilds both cars from the shared spawn
  // points. A new player id makes GameCanvas reset its local vehicle too.
  useEffect(() => {
    const now = performance.now()
    const spawns = getSpawnPoints(2)
    const color = pickAiColor(carColor)
    const player = {
      id: `ai-player-${round}`,
      name: driverName || 'You',
      color: carColor,
      x: spawns[0].x,
      y: spawns[0].y,
      angle: spawns[0].angle,
      speed: 0,
      isIt: false,
      tags: 0,
      ready: false,
    }
    const ai = createVehicle({
      id: AI_ID,
      name: AI_NAME,
      color,
      x: spawns[1].x,
      y: spawns[1].y,
      angle: spawns[1].angle,
    })
    ai.isIt = true
    ai.tags = 0
    ai.ready = false

    const match = createAiMatch(now, AI_MATCH.roundSeconds)
    assignAiIt(match, [player, ai], AI_ID)
    matchRef.current = match
    playerRef.current = player
    aiRef.current = ai
    brainRef.current = createAiBrain()
    lastTickRef.current = now

    playersRef.current.clear()
    const entry = {
      info: { id: ai.id, name: ai.name, color: ai.color, isIt: true, tags: 0 },
      buffer: createInterpolationBuffer(),
    }
    pushSnapshot(entry.buffer, ai, now)
    playersRef.current.set(AI_ID, entry)

    setTagEvent(null)
    syncUi()
    setGame(publicAiGame(match, [player, ai], now))
  }, [round, carColor, driverName, syncUi])

  // GameCanvas calls this at 20 Hz with the freshly simulated player state.
  // Reusing that hook point keeps the AI in the same clock as the player and
  // means pausing or hiding the tab freezes both cars together.
  const sendMove = useCallback((state) => {
    const player = playerRef.current
    const ai = aiRef.current
    const match = matchRef.current
    if (!player || !ai || !match) return

    player.x = state.x
    player.y = state.y
    player.angle = state.angle
    player.speed = state.speed

    const now = performance.now()
    const dt = Math.min(Math.max((now - lastTickRef.current) / 1000, 0), 0.05)
    lastTickRef.current = now
    if (dt <= 0) return

    const input = driveAi({ ai, player, world, brain: brainRef.current, now, dt })
    stepVehicle(ai, getDriveAxis(input), dt, world)

    const players = [player, ai]
    const hit = evaluateAiTag(match, players, now)
    if (hit && applyAiTag(match, players, hit, now)) {
      syncUi()
      setTagEvent({ ...hit, receivedAt: now })
    }

    const remote = playersRef.current.get(AI_ID)
    if (remote) {
      pushSnapshot(remote.buffer, ai, now)
      pruneBuffer(remote.buffer, now)
    }
  }, [syncUi])

  // The round timer is server-owned in multiplayer; here it is a low-frequency
  // local tick so it keeps counting even while the cars are paused.
  useEffect(() => {
    const tick = () => {
      const player = playerRef.current
      const ai = aiRef.current
      const match = matchRef.current
      if (!player || !ai || !match) return
      const now = performance.now()
      const players = [player, ai]
      const finished = maybeFinishAiRound(match, players, now)
      const next = publicAiGame(match, players, now)
      setGame((previous) =>
        previous &&
        previous.phase === next.phase &&
        previous.secondsLeft === next.secondsLeft &&
        previous.readyIds.length === next.readyIds.length &&
        previous.winnerIds.length === next.winnerIds.length
          ? previous
          : next,
      )
      if (finished) {
        syncUi()
        setTagEvent(null)
      }
    }
    const timer = setInterval(tick, NETWORK.hudIntervalMs)
    return () => clearInterval(timer)
  }, [syncUi])

  const sendReady = useCallback((ready = true) => {
    const player = playerRef.current
    const ai = aiRef.current
    const match = matchRef.current
    if (!player || !ai || !match) return

    const now = performance.now()
    const players = [player, ai]
    const human = setAiReady(match, players, player.id, ready, now)
    // The rival mirrors the player's ready choice; no server is involved.
    const bot = setAiReady(match, players, ai.id, ready, now)
    if (!human.changed && !bot.changed && !human.started && !bot.started) return

    if (human.started || bot.started) {
      lastTickRef.current = now
      brainRef.current = createAiBrain()
    }
    syncUi()
    setGame(publicAiGame(match, players, now))
  }, [syncUi])

  const restart = useCallback(() => setRound((value) => value + 1), [])

  useEffect(() => {
    if (!tagEvent) return undefined
    const timer = setTimeout(() => setTagEvent(null), 2500)
    return () => clearTimeout(timer)
  }, [tagEvent])

  return {
    self,
    roster,
    playersRef,
    sendMove,
    sendReady,
    tagEvent,
    game,
    restart,
  }
}
