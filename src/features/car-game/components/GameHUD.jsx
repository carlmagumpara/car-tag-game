const STATUS_STYLES = {
  connecting: { label: 'Connecting', dot: 'bg-amber-400', text: 'text-amber-300', pulse: true },
  connected: { label: 'Online', dot: 'bg-emerald-400', text: 'text-emerald-300', pulse: false },
  reconnecting: { label: 'Reconnecting', dot: 'bg-amber-400', text: 'text-amber-300', pulse: true },
  error: { label: 'Server error', dot: 'bg-rose-400', text: 'text-rose-300', pulse: false },
  offline: { label: 'Offline', dot: 'bg-slate-400', text: 'text-slate-300', pulse: false },
}

export default function GameHUD({
  speed,
  drifting,
  status,
  playerCount,
  position,
  paused,
  isIt,
  itName,
  tags,
  onTogglePause,
  onExit,
}) {
  const connection = STATUS_STYLES[status] || STATUS_STYLES.offline

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2 sm:left-4 sm:top-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-md">
        <div className="min-w-[112px]">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connection.dot} ${connection.pulse ? 'animate-pulse-slow' : ''}`}
            />
            <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest ${connection.text}`}>
              {connection.label}
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-slate-400">
            {playerCount} {playerCount === 1 ? 'driver' : 'drivers'} online
          </div>
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
          {isIt ? "YOU'RE IT — tag someone!" : `${itName || 'Nobody'} is it — stay away`}
        </span>
        <span className="text-slate-400">tags {tags}</span>
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
