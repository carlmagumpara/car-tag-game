import { useCallback, useEffect, useState } from 'react'
import GameCanvas from './GameCanvas.jsx'
import GameControls from './components/GameControls.jsx'
import GameHUD from './components/GameHUD.jsx'
import PlayerList from './components/PlayerList.jsx'
import TouchControls from './components/TouchControls.jsx'
import { getSocketConfig } from './game/socket-config.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useMultiplayer } from './hooks/useMultiplayer.js'

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

export default function CarGame({ onExit }) {
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ speed: 0, drifting: false, x: 0, y: 0 })

  const { status, error, self, roster, playerCount, playersRef, sendMove, reconnect, tagEvent } =
    useMultiplayer({ ...socketConfig, enabled: true })

  const isIt = Boolean(self?.isIt)
  const itName = roster.find((player) => player.isIt)?.name || 'Nobody'
  const tags = self?.tags || 0
  const controlsEnabled = Boolean(self) && status === 'connected' && !paused
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
      if (event.code === 'Escape') {
        setPaused((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const needsConnectionOverlay = status !== 'connected' || !self

  return (
    <main className="min-h-dvh bg-slate-950 p-2 sm:p-4">
      <div className="relative mx-auto h-[calc(100dvh-1rem)] max-w-[1600px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1120] shadow-2xl shadow-cyan-500/5 sm:h-[calc(100dvh-2rem)]">
        <GameCanvas
          inputRef={inputRef}
          playersRef={playersRef}
          self={self}
          sendMove={sendMove}
          onHudUpdate={handleHudUpdate}
          paused={paused || needsConnectionOverlay}
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
          onTogglePause={() => setPaused((value) => !value)}
          onExit={onExit}
        />

        {!needsConnectionOverlay && (
          <>
            <PlayerList players={roster} selfId={self?.id} />
            <GameControls />
            <TouchControls onPress={handleTouch} enabled={!paused} />
          </>
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

        {paused && !needsConnectionOverlay && (
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
