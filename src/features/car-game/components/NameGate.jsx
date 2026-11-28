import { useState } from 'react'
import NameField from './NameField.jsx'
import { createRandomName, normalizePlayerName } from '../game/player-name.js'

// Share links land straight in a room. Ask for a name before connecting so
// every driver makes the same choice as visitors who use the landing page.
export default function NameGate({
  roomId,
  initialName,
  onChoose,
  onExit,
  eyebrow,
  title,
  description,
  actionLabel,
}) {
  const [draft, setDraft] = useState(initialName || '')
  const name = normalizePlayerName(draft)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_60%)]" />
      <section className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-cyan-300">
          <span className="inline-block h-3 w-3 rotate-45 rounded-sm bg-cyan-400" />
          NEON DRIVE
        </div>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.25em] text-cyan-400">
          {eyebrow || `Room ${roomId}`}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          {title || 'One last thing — your name.'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {description || 'Type a driver name or use a random one. Everyone in the room will see it.'}
        </p>

        <div className="mt-7">
          <NameField
            id="gate-driver-name"
            value={draft}
            onChange={setDraft}
            onRandom={() => setDraft(createRandomName())}
          />
          {!name && (
            <p className="mt-2 font-mono text-[11px] text-amber-300">
              Type a name or click Random to continue.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onChoose(name)}
            disabled={!name}
            className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionLabel || 'Enter the city →'}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl border border-white/15 px-5 py-3 text-sm text-slate-300 transition hover:border-white/40 hover:text-white"
          >
            Back to home
          </button>
        </div>
      </section>
    </main>
  )
}
