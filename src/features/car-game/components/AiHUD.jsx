function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// A local counterpart to GameHUD: same visual language, but no room code, copy
// link or connection state — the AI match never opens a socket.
export default function AiHUD({
  speed,
  drifting,
  position,
  paused,
  isIt,
  itName,
  tags,
  immunitySeconds = 0,
  game,
  ready,
  onToggleReady,
  onTogglePause,
  onExit,
}) {
  const phase = game?.phase || 'waiting'
  const playing = phase === 'playing'
  const secondsLeft = game?.secondsLeft ?? game?.roundSeconds ?? 60

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-[220px] flex-col gap-2 sm:left-4 sm:top-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-md">
        <div className="min-w-[104px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fuchsia-300">
              Local match
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-slate-400">You vs AI rival</div>
        </div>
        <div className="h-10 w-px bg-white/10" />
        <div>
          <div className="flex items-end gap-1">
            <span className="font-mono text-2xl font-bold leading-none text-white tabular-nums">{speed}</span>
            <span className="pb-0.5 font-mono text-[10px] text-slate-400">KM/H</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-slate-500">
            {drifting ? 'DRIFTING' : `${position.x}, ${position.y}`}
          </div>
        </div>
      </div>

      <div
        className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 font-mono text-[11px] backdrop-blur-md ${
          isIt
            ? 'border-rose-400/40 bg-rose-950/70 text-rose-200'
            : 'border-cyan-400/25 bg-slate-950/70 text-cyan-200'
        }`}
      >
        <span className="font-semibold">
          {isIt ? "YOU'RE IT — tag the rival!" : `${itName || 'Nobody'} is it — stay away`}
        </span>
        <span className="text-slate-400">tags {tags}</span>
      </div>

      {immunitySeconds > 0 && (
        <div className="pointer-events-auto rounded-lg border border-emerald-400/40 bg-emerald-950/70 px-3 py-1.5 font-mono text-[11px] backdrop-blur-md">
          <span className="font-semibold text-emerald-200">
            Stay away · no tags for {immunitySeconds}s
          </span>
        </div>
      )}

      <div
        className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 font-mono text-[11px] backdrop-blur-md ${
          playing
            ? 'border-violet-400/30 bg-violet-950/60 text-violet-200'
            : 'border-white/10 bg-slate-950/75 text-slate-300'
        }`}
      >
        <span className="font-semibold">
          {playing
            ? `Round · ${formatTime(secondsLeft)} left`
            : phase === 'finished'
              ? 'Round over'
              : 'Ready to start the round'}
        </span>
        {!playing && phase !== 'finished' && (
          <button
            type="button"
            onClick={onToggleReady}
            className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold tracking-wide transition ${
              ready
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
            }`}
          >
            {ready ? 'READY ✓' : 'READY'}
          </button>
        )}
      </div>

      <div className="pointer-events-auto flex gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className="rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md transition hover:border-cyan-400/50 hover:text-white"
        >
          {paused ? 'Resume' : 'Pause'} <span className="text-slate-500">(Esc)</span>
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md transition hover:border-rose-400/50 hover:text-white"
        >
          Exit
        </button>
      </div>
    </div>
  )
}
