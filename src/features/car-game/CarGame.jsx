import { useCallback, useEffect, useRef, useState } from 'react'
import GameCanvas from './GameCanvas.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import GameControls from './components/GameControls.jsx'
import GameHUD from './components/GameHUD.jsx'
import PlayerList from './components/PlayerList.jsx'
import TouchControls from './components/TouchControls.jsx'
import VoiceControls from './components/VoiceControls.jsx'
import {
  playImmunitySound,
  playRoundEndSound,
  playTagSound,
  setAudioMuted,
  startBackgroundMusic,
  stopBackgroundMusic,
  stopEngine,
  unlockAudio,
} from './game/audio.js'
import { getSocketConfig } from './game/socket-config.js'
import { roomUrl } from './game/room-id.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useMultiplayer } from './hooks/useMultiplayer.js'
import { useTagCooldown } from './hooks/useTagCooldown.js'
import { useVoice } from './hooks/useVoice.js'

const socketConfig = getSocketConfig()

function Overlay({ icon, title, message, actionLabel, onAction, secondaryLabel, onSecondary }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl shadow-black/50">
        {icon && <div className="mb-4 text-4xl">{icon}</div>}
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {actionLabel}
          </button>
        )}
        {onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="ml-3 mt-6 rounded-lg border border-white/15 px-5 py-2.5 text-sm text-slate-300 transition hover:border-white/40 hover:text-white"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
  )
}

export default function CarGame({ onExit, roomId, carColor, driverName }) {
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ speed: 0, drifting: false, x: 0, y: 0 })
  const [copied, setCopied] = useState(false)
  const [muted, setMuted] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)

  const {
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
    immunityMs,
    chat,
    sendChat,
    sendReady,
    socketRef,
    socketEpoch,
    roomId: activeRoomId,
  } = useMultiplayer({ ...socketConfig, roomId, carColor, driverName, enabled: true })

  const voice = useVoice({
    socketRef,
    socketEpoch,
    selfId: self?.id,
    enabled: voiceEnabled,
    muted: voiceMuted,
  })

  // Usually the same as the URL code; the server's value wins if a raw client
  // connected without one, so the copied link always points to the real room.
  const shareRoomId = activeRoomId || roomId

  const isIt = Boolean(self?.isIt)
  const itName = roster.find((player) => player.isIt)?.name || 'Nobody'
  const tags = self?.tags || 0
  const phase = game?.phase || 'waiting'
  const roundActive = phase === 'playing'
  const roundOver = phase === 'finished'
  const ready = Boolean(self?.ready)
  const loserId = game?.loserId || null
  const loserName = (game?.standings || []).find((entry) => entry.id === loserId)?.name || 'Nobody'
  const loserLost = loserId === self?.id
  const standings = game?.standings || []
  const immunitySeconds = useTagCooldown(tagEvent, immunityMs)
  const controlsEnabled = Boolean(self) && status === 'connected' && !paused && !roundOver
  const { inputRef, clear } = useKeyboard({ enabled: controlsEnabled })

  const handleHudUpdate = useCallback((next) => setHud(next), [])

  const copyLink = useCallback(async () => {
    if (!shareRoomId) return
    const url = roomUrl(shareRoomId)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const input = document.createElement('textarea')
        input.value = url
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        input.remove()
      }
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [shareRoomId])

  useEffect(() => setCopied(false), [shareRoomId])

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleTouch = useCallback(
    (action, pressed) => {
      if (!controlsEnabled) return
      inputRef.current[action] = pressed
    },
    [controlsEnabled, inputRef],
  )

  useEffect(() => {
    if (paused) clear()
  }, [paused, clear])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Escape') {
        setPaused((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const needsConnectionOverlay = status !== 'connected' || !self

  const lastTagRef = useRef(null)
  const lastPhaseRef = useRef(null)

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    startBackgroundMusic()
    return () => {
      stopBackgroundMusic()
      stopEngine()
    }
  }, [])

  useEffect(() => setAudioMuted(muted), [muted])

  useEffect(() => {
    if (!tagEvent || lastTagRef.current === tagEvent) return
    lastTagRef.current = tagEvent
    if (tagEvent.reason === 'tag') playTagSound()
    if (tagEvent.taggedId === self?.id || (tagEvent.reason === 'reassign' && tagEvent.itId === self?.id)) {
      playImmunitySound()
    }
  }, [tagEvent, self?.id])

  useEffect(() => {
    const previous = lastPhaseRef.current
    lastPhaseRef.current = phase
    if (previous && previous !== phase && phase === 'finished') {
      playRoundEndSound(loserId === self?.id)
    }
  }, [phase, loserId, self?.id])

  return (
    <main className="h-dvh w-screen overflow-hidden bg-slate-950">
      <div className="relative h-full w-full overflow-hidden bg-[#0b1120]">
        <GameCanvas
          inputRef={inputRef}
          playersRef={playersRef}
          self={self}
          sendMove={sendMove}
          onHudUpdate={handleHudUpdate}
          paused={paused || needsConnectionOverlay || roundOver}
          tagEvent={tagEvent}
        />

        <GameHUD
          speed={hud.speed}
          drifting={hud.drifting}
          status={status}
          playerCount={playerCount}
          position={{ x: hud.x, y: hud.y }}
          paused={paused}
          isIt={isIt}
          itName={itName}
          tags={tags}
          immunitySeconds={immunitySeconds}
          game={game}
          ready={ready}
          roomId={shareRoomId}
          copied={copied}
          onCopyLink={copyLink}
          onToggleReady={() => sendReady(!ready)}
          onTogglePause={() => setPaused((value) => !value)}
          muted={muted}
          onToggleMuted={() => setMuted((value) => !value)}
          onExit={onExit}
        />

        {!needsConnectionOverlay && (
          <>
            <PlayerList players={roster} selfId={self?.id} />
            <GameControls />
            <TouchControls onPress={handleTouch} enabled={!paused && !roundOver} />
            <div className="absolute bottom-24 right-3 z-20 flex w-60 flex-col gap-2 sm:w-64 md:bottom-4 md:right-4 md:w-72">
              <ChatPanel messages={chat} onSend={sendChat} enabled={status === 'connected'} />
              <VoiceControls
                enabled={voiceEnabled}
                ready={voice.ready}
                muted={voiceMuted}
                participantCount={voice.participants.length}
                error={voice.error}
                onToggle={() => setVoiceEnabled((value) => !value)}
                onToggleMute={() => setVoiceMuted((value) => !value)}
                onDismissError={voice.clearError}
              />
            </div>
          </>
        )}

        {roundActive && !needsConnectionOverlay && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-xl border border-violet-400/30 bg-slate-950/80 px-4 py-2 text-center font-mono shadow-lg shadow-black/30 backdrop-blur-md">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-violet-300">
              Round in progress
            </div>
            <div className="mt-0.5 text-2xl font-bold leading-none text-white tabular-nums">
              {String(Math.floor(Math.max(0, game?.secondsLeft ?? 0) / 60)).padStart(2, '0')}:
              {String(Math.max(0, game?.secondsLeft ?? 0) % 60).padStart(2, '0')}
            </div>
          </div>
        )}

        {phase === 'countdown' && !needsConnectionOverlay && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-xl border border-amber-400/30 bg-slate-950/80 px-4 py-2 text-center font-mono shadow-lg shadow-black/30 backdrop-blur-md">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-300">
              Next round starts in
            </div>
            <div className="mt-0.5 text-2xl font-bold leading-none text-white tabular-nums">
              {Math.max(0, game?.secondsLeft ?? 0)}s
            </div>
          </div>
        )}

        {error && status === 'connected' && (
          <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg border border-rose-400/30 bg-rose-950/80 px-4 py-2 text-center font-mono text-[11px] text-rose-200 backdrop-blur-md">
            {error}
          </div>
        )}

        {tagEvent && !needsConnectionOverlay && (
          <div className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg border border-amber-400/40 bg-amber-950/80 px-4 py-2 text-center font-mono text-xs text-amber-100 shadow-lg backdrop-blur-md sm:top-20">
            {tagEvent.reason === 'reassign'
              ? tagEvent.itId === self?.id
                ? "You're it — go tag someone."
                : `${roster.find((player) => player.id === tagEvent.itId)?.name || 'A driver'} is now it.`
              : tagEvent.taggedId === self?.id
                ? 'Tagged! You are it — go catch someone.'
                : tagEvent.taggerId === self?.id
                  ? `Tag! You caught ${roster.find((player) => player.id === tagEvent.taggedId)?.name || 'a driver'}.`
                  : `${roster.find((player) => player.id === tagEvent.taggerId)?.name || 'A driver'} tagged someone.`}
          </div>
        )}

        {roundOver && !needsConnectionOverlay && (
          <Overlay
            icon={loserLost ? '💥' : '🏁'}
            title={loserLost ? 'You lose — you were it!' : `${loserName} loses!`}
            message={`Time ran out with ${loserName} holding the tag. Results: ${
              standings.map((entry) => `${entry.name} ${entry.tags}`).join(' · ') || 'no drivers'
            }. ${
              ready
                ? 'Waiting for the other drivers.'
                : 'The next round starts automatically.'
            }`}
            actionLabel={ready ? 'Cancel ready' : 'Ready now'}
            onAction={() => sendReady(!ready)}
            secondaryLabel="Exit to home"
            onSecondary={onExit}
          />
        )}

        {paused && !roundOver && !needsConnectionOverlay && (
          <Overlay
            title="Paused"
            message="Your controls are released. The city will be here when you get back."
            actionLabel="Resume driving"
            onAction={() => setPaused(false)}
            secondaryLabel="Exit to home"
            onSecondary={onExit}
          />
        )}

        {needsConnectionOverlay && (
          <>
            {status === 'connecting' && (
              <Overlay icon={<Spinner />} title="Entering the city…" message="Connecting to the multiplayer server." />
            )}
            {(status === 'reconnecting' || status === 'offline') && (
              <Overlay
                icon="📡"
                title="Connection lost"
                message="Trying to reconnect to the game server. Your car will reappear automatically."
                actionLabel="Retry now"
                onAction={reconnect}
                secondaryLabel="Exit to home"
                onSecondary={onExit}
              />
            )}
            {status === 'error' && (
              <Overlay
                icon="⚠️"
                title="Game server unavailable"
                message={error || 'The multiplayer server could not be reached. Check that it is running and try again.'}
                actionLabel="Try again"
                onAction={reconnect}
                secondaryLabel="Exit to home"
                onSecondary={onExit}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}
