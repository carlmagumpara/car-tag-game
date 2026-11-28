import { useCallback, useEffect, useMemo, useState } from 'react'
import AiGame from './features/car-game/AiGame.jsx'
import CarGame from './features/car-game/CarGame.jsx'
import NameField from './features/car-game/components/NameField.jsx'
import NameGate from './features/car-game/components/NameGate.jsx'
import { CAR_COLORS, loadCarColor, saveCarColor } from './features/car-game/game/car-colors.js'
import {
  createRandomName,
  loadPlayerName,
  normalizePlayerName,
  savePlayerName,
} from './features/car-game/game/player-name.js'
import { createRoomId, normalizeRoomId } from './features/car-game/game/room-id.js'

function parseRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/'
  if (path === '/ai') return { view: 'ai', roomId: null }
  if (path === '/game') return { view: 'game', roomId: null }
  const match = path.match(/^\/game\/([^/]+)$/)
  if (match) return { view: 'game', roomId: match[1] }
  return { view: 'landing', roomId: null }
}

function ColorPicker({ color, onSelect }) {
  const selected = CAR_COLORS.find((entry) => entry.hex === color) || CAR_COLORS[0]

  return (
    <section className="mt-10 max-w-xl" aria-label="Car color">
      <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-slate-500">
        Pick your car color
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap gap-2">
          {CAR_COLORS.map((entry) => {
            const active = entry.hex === selected.hex
            return (
              <button
                key={entry.id}
                type="button"
                title={entry.name}
                aria-label={`${entry.name} car`}
                aria-pressed={active}
                onClick={() => onSelect(entry.hex)}
                className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
                  active
                    ? 'scale-110 border-white ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-slate-950'
                    : 'border-white/20 hover:border-white/60'
                }`}
                style={{ backgroundColor: entry.hex }}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="relative h-7 w-12 shrink-0 rounded-[10px] shadow-lg"
            style={{ backgroundColor: selected.hex, boxShadow: `0 0 18px ${selected.hex}55` }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 h-4 w-5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-slate-950/70" />
          </div>
          <span className="font-mono text-xs text-slate-400">
            <span className="font-semibold text-white">{selected.name}</span> · saved for next time
          </span>
        </div>
      </div>
    </section>
  )
}

const MODES = Object.freeze([
  {
    id: 'multiplayer',
    icon: '👥',
    title: 'Multiplayer',
    body: 'Create a private room and play tag with your friends in real time.',
  },
  {
    id: 'ai',
    icon: '🤖',
    title: 'You vs AI',
    body: 'Drive against a computer rival right here — no room code or server needed.',
  },
])

function ModePicker({ mode, onChange }) {
  return (
    <section className="mt-10 max-w-2xl" aria-label="Game mode">
      <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-slate-500">Choose a mode</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {MODES.map((option) => {
          const active = option.id === mode
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? 'border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">{option.icon}</span>
                <span className="font-semibold text-white">{option.title}</span>
                {active && (
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{option.body}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Landing({ onPlay, onPlayAi, onJoin, carColor, onSelectColor, initialName }) {
  const [code, setCode] = useState('')
  const [nameDraft, setNameDraft] = useState(initialName || '')
  const [invalid, setInvalid] = useState(false)
  const [mode, setMode] = useState('multiplayer')
  const name = normalizePlayerName(nameDraft)

  const submit = (event) => {
    event.preventDefault()
    if (!name) return
    const roomId = normalizeRoomId(code)
    if (!roomId) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onJoin(roomId, name)
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-cyan-300">
          <span className="inline-block h-3 w-3 rotate-45 rounded-sm bg-cyan-400" />
          NEON DRIVE
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
          Multiplayer + AI
        </span>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.35em] text-cyan-400">
          A tiny city, one tagger, your own private room
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Drive together in a city that{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 bg-clip-text text-transparent">
            never sleeps.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
          Start a room, share its six-character code, and drift through a shared top-down city with
          your friends in real time. One car is "it" — bump into someone to pass it on. No account,
          no download — just open the link and go.
        </p>

        <div className="mt-8">
          <NameField
            value={nameDraft}
            onChange={setNameDraft}
            onRandom={() => setNameDraft(createRandomName())}
          />
          {!name && (
            <p className="mt-2 font-mono text-[11px] text-amber-300">
              Type a name or click Random before you play.
            </p>
          )}
        </div>

        <ModePicker mode={mode} onChange={setMode} />

        {mode === 'multiplayer' ? (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onPlay(name)}
                disabled={!name}
                className="rounded-xl bg-cyan-400 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create a room →
              </button>
              <span className="font-mono text-xs text-slate-500">WASD / arrows to drive · Space to drift</span>
            </div>

            <form onSubmit={submit} className="mt-6 flex flex-wrap items-center gap-3">
              <label htmlFor="room-code" className="font-mono text-xs uppercase tracking-widest text-slate-500">
                Have a code?
              </label>
              <input
                id="room-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))
                  setInvalid(false)
                }}
                placeholder="ABC234"
                autoComplete="off"
                spellCheck="false"
                aria-invalid={invalid}
                className="w-32 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm uppercase tracking-[0.2em] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60"
              />
              <button
                type="submit"
                disabled={!name}
                className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 font-mono text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Join room
              </button>
              {invalid && (
                <span className="font-mono text-[11px] text-rose-300">Enter the 6-character room code.</span>
              )}
            </form>
          </>
        ) : (
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onPlayAi(name)}
              disabled={!name}
              className="rounded-xl bg-fuchsia-500 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-fuchsia-500/20 transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Play vs AI →
            </button>
            <span className="font-mono text-xs text-slate-500">
              Local match · no room code or second player needed
            </span>
          </div>
        )}

        <ColorPicker color={carColor} onSelect={onSelectColor} />

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'Live tag',
              body: 'One driver is "it". Tag someone by bumping into them, then run before they tag you back.',
            },
            {
              title: 'Arcade handling',
              body: 'Accelerate, reverse, handbrake-drift and slide around corners with delta-time physics.',
            },
            {
              title: 'Your own room',
              body: 'Create a game, copy the link and race with just your friends. Codes are six characters.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-cyan-400/30"
            >
              <h2 className="font-semibold text-white">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl border-t border-white/10 px-6 py-8 font-mono text-xs text-slate-600">
        Built with React, Canvas and Socket.IO. The multiplayer server runs separately from this site.
        <span className="mt-1 block text-slate-500">Made by carlmagumpara.</span>
      </footer>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  const [carColor, setCarColor] = useState(loadCarColor)
  const [driverName, setDriverName] = useState(loadPlayerName)

  const selectCarColor = useCallback((value) => setCarColor(saveCarColor(value)), [])

  // Committing a name (create, join or entering a share link) saves it for next time.
  const chooseName = useCallback((value) => setDriverName(savePlayerName(value)), [])

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // A bare /#/game (or a malformed code) gets a fresh shareable code rather
  // than silently joining the wrong room.
  const roomId = useMemo(
    () => (route.view === 'game' ? normalizeRoomId(route.roomId) || createRoomId() : null),
    [route.view, route.roomId],
  )

  useEffect(() => {
    if (route.view === 'game' && roomId !== route.roomId) {
      window.location.hash = `/game/${roomId}`
    }
  }, [route.view, route.roomId, roomId])

  if (route.view === 'ai') {
    if (!driverName) {
      return (
        <NameGate
          eyebrow="You vs AI"
          title="One last thing — your name."
          description="Type a driver name or use a random one. Your AI rival will see it on the scoreboard."
          actionLabel="Start the race →"
          initialName={driverName}
          onChoose={chooseName}
          onExit={() => {
            window.location.hash = '/'
          }}
        />
      )
    }
    return (
      <AiGame
        key="ai"
        carColor={carColor}
        driverName={driverName}
        onExit={() => {
          window.location.hash = '/'
        }}
      />
    )
  }

  if (route.view === 'game') {
    if (!driverName) {
      return (
        <NameGate
          roomId={roomId}
          initialName={driverName}
          onChoose={chooseName}
          onExit={() => {
            window.location.hash = '/'
          }}
        />
      )
    }
    return (
      <CarGame
        key={roomId}
        roomId={roomId}
        carColor={carColor}
        driverName={driverName}
        onExit={() => {
          window.location.hash = '/'
        }}
      />
    )
  }

  return (
    <Landing
      carColor={carColor}
      onSelectColor={selectCarColor}
      initialName={driverName}
      onPlay={(name) => {
        chooseName(name)
        window.location.hash = `/game/${createRoomId()}`
      }}
      onPlayAi={(name) => {
        chooseName(name)
        window.location.hash = '/ai'
      }}
      onJoin={(code, name) => {
        chooseName(name)
        window.location.hash = `/game/${code}`
      }}
    />
  )
}
