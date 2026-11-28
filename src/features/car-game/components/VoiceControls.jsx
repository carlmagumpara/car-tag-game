export default function VoiceControls({
  enabled,
  ready,
  muted,
  participantCount,
  error,
  onToggle,
  onToggleMute,
  onDismissError,
}) {
  return (
    <section
      aria-label="Voice chat"
      className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 shadow-lg shadow-black/30 backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Voice
            {enabled && <span className="ml-1.5 text-emerald-300">{participantCount}</span>}
          </div>
          {enabled && (
            <div className="mt-0.5 font-mono text-[9px] text-slate-500">
              {ready ? (muted ? 'Muted' : 'Mic open') : 'Connecting…'} ·{' '}
              {participantCount < 2 ? 'only you' : `${participantCount} drivers`}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {enabled && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold transition ${
                muted
                  ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/40'
              }`}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold transition ${
              enabled
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
            }`}
          >
            {enabled ? 'Leave' : 'Join'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 font-mono text-[9px] leading-snug text-rose-200">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss voice error"
            className="text-rose-300/70 transition hover:text-white"
          >
            ×
          </button>
        </p>
      )}
    </section>
  )
}
