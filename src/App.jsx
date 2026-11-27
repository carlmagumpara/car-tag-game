import { useEffect, useMemo, useState } from 'react'
import CarGame from './features/car-game/CarGame.jsx'
import { createRoomId, normalizeRoomId } from './features/car-game/game/room-id.js'

function parseRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/'
  if (path === '/game') return { view: 'game', roomId: null }
  const match = path.match(/^\/game\/([^/]+)$/)
  if (match) return { view: 'game', roomId: match[1] }
  return { view: 'landing', roomId: null }
}

function Landing({ onPlay, onJoin }) {
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)

  const submit = (event) => {
    event.preventDefault()
    const roomId = normalizeRoomId(code)
    if (!roomId) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onJoin(roomId)
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
          Live multiplayer
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

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onPlay}
            className="rounded-xl bg-cyan-400 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
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
            className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 font-mono text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
          >
            Join room
          </button>
          {invalid && (
            <span className="font-mono text-[11px] text-rose-300">Enter the 6-character room code.</span>
          )}
        </form>

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
      </footer>
    </main>
  )
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)

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

  if (route.view === 'game') {
    return (
      <CarGame
        key={roomId}
        roomId={roomId}
        onExit={() => {
          window.location.hash = '/'
        }}
      />
    )
  }

  return (
    <Landing
      onPlay={() => {
        window.location.hash = `/game/${createRoomId()}`
      }}
      onJoin={(code) => {
        window.location.hash = `/game/${code}`
      }}
    />
  )
}
