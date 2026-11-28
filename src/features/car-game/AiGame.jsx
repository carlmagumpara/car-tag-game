import { useCallback, useEffect, useRef, useState } from 'react'
import GameCanvas from './GameCanvas.jsx'
import AiHUD from './components/AiHUD.jsx'
import GameControls from './components/GameControls.jsx'
import PlayerList from './components/PlayerList.jsx'
import TouchControls from './components/TouchControls.jsx'
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
import { AI_MATCH } from './game/ai-match.js'
import { useAiGame } from './hooks/useAiGame.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useTagCooldown } from './hooks/useTagCooldown.js'

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
            className="mt-6 rounded-lg bg-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-400"
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
    <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-fuchsia-400/20 border-t-fuchsia-400" />
  )
}

// Standalone single-player screen. It deliberately shares the canvas, physics,
// controls and roster components with multiplayer but never calls useMultiplayer
// or touches a socket, so the two modes cannot interfere with each other.
export default function AiGame({ onExit, carColor, driverName }) {
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [hud, setHud] = useState({ speed: 0, drifting: false, x: 0, y: 0 })

  const { self, roster, playersRef, sendMove, sendReady, tagEvent, game } = useAiGame({
    carColor,
    driverName,
  })

  const phase = game?.phase || 'waiting'
  const roundActive = phase === 'playing'
  const roundOver = phase === 'finished'
  const isIt = Boolean(self?.isIt)
  const itName = roster.find((player) => player.isIt)?.name || 'Nobody'
  const tags = self?.tags || 0
  const ready = Boolean(self?.ready)
  const immunitySeconds = useTagCooldown(tagEvent, AI_MATCH.immunityMs)
  const controlsEnabled = Boolean(self) && !paused && !roundOver
  const { inputRef, clear } = useKeyboard({ enabled: controlsEnabled })

  const handleHudUpdate = useCallback((next) => setHud(next), [])

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
      if (event.code === 'Escape') setPaused((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const aiPlayer = roster.find((player) => player.id !== self?.id)
  const loserId = game?.loserId || null
  const youLost = loserId === self?.id
  const resultTitle = youLost ? 'You lose — you were it!' : `${aiPlayer?.name || 'AI Rival'} loses!`
  const needsOverlay = !self

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
    if (previous && previous !== phase && phase === 'finished') playRoundEndSound(youLost)
  }, [phase, youLost])

  return (
    <main className="h-dvh w-screen overflow-hidden bg-slate-950">
      <div className="relative h-full w-full overflow-hidden bg-[#0b1120]">
        <GameCanvas
          inputRef={inputRef}
          playersRef={playersRef}
          self={self}
          sendMove={sendMove}
          onHudUpdate={handleHudUpdate}
          paused={paused || needsOverlay || roundOver}
          tagEvent={tagEvent}
        />

        {!needsOverlay && (
          <>
            <AiHUD
              speed={hud.speed}
              drifting={hud.drifting}
              position={{ x: hud.x, y: hud.y }}
              paused={paused}
              isIt={isIt}
              itName={itName}
              tags={tags}
              immunitySeconds={immunitySeconds}
              game={game}
              ready={ready}
              onToggleReady={() => sendReady(!ready)}
              onTogglePause={() => setPaused((value) => !value)}
              muted={muted}
              onToggleMuted={() => setMuted((value) => !value)}
              onExit={onExit}
            />
            <PlayerList players={roster} selfId={self?.id} />
            <GameControls />
            <TouchControls onPress={handleTouch} enabled={!paused && !roundOver} />

            {roundActive && (
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

            {tagEvent && (
              <div className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg border border-amber-400/40 bg-amber-950/80 px-4 py-2 text-center font-mono text-xs text-amber-100 shadow-lg backdrop-blur-md sm:top-20">
                {tagEvent.reason === 'reassign'
                  ? tagEvent.itId === self?.id
                    ? "You're it — go tag the rival."
                    : `${roster.find((player) => player.id === tagEvent.itId)?.name || 'A driver'} is now it.`
                  : tagEvent.taggedId === self?.id
                    ? 'Tagged! You are it — go catch the rival.'
                    : tagEvent.taggerId === self?.id
                      ? `Tag! You caught ${roster.find((player) => player.id === tagEvent.taggedId)?.name || 'the rival'}.`
                      : `${roster.find((player) => player.id === tagEvent.taggerId)?.name || 'The rival'} tagged someone.`}
              </div>
            )}

            {roundOver && (
              <Overlay
                icon={youLost ? '💥' : '🏁'}
                title={resultTitle}
                message={`Time ran out with ${loserId === aiPlayer?.id ? aiPlayer?.name || 'AI Rival' : 'you'} holding the tag. You ${tags} · ${aiPlayer?.name || 'AI Rival'} ${aiPlayer?.tags || 0} tags. ${
                  ready ? 'The rival is ready too.' : 'Press READY when you want the next round.'
                }`}
                actionLabel={ready ? 'Cancel ready' : 'Ready for next round'}
                onAction={() => sendReady(!ready)}
                secondaryLabel="Exit to home"
                onSecondary={onExit}
              />
            )}

            {paused && !roundOver && (
              <Overlay
                title="Paused"
                message="Your controls are released. The rival will wait here with you."
                actionLabel="Resume driving"
                onAction={() => setPaused(false)}
                secondaryLabel="Exit to home"
                onSecondary={onExit}
              />
            )}
          </>
        )}

        {needsOverlay && (
          <Overlay icon={<Spinner />} title="Starting the race…" message="Building the city and warming up the rival." />
        )}
      </div>
    </main>
  )
}
