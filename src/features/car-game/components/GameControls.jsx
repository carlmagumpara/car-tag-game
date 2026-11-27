function Key({ children, wide = false }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded border border-white/20 bg-white/5 font-mono text-[10px] text-slate-300 shadow-sm ${wide ? 'min-w-[42px] px-1.5' : 'h-6 w-6'}`}
    >
      {children}
    </kbd>
  )
}

export default function GameControls() {
  return (
    <div className="absolute bottom-3 left-3 z-20 hidden rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-[10px] text-slate-400 backdrop-blur-md sm:block sm:left-4 sm:bottom-4">
      <div className="mb-1 font-semibold uppercase tracking-widest text-slate-500">Controls</div>
      <div className="mb-2 text-cyan-300">Bump another driver to tag them. Avoid being caught!</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5">
          <Key>W</Key>
          <Key>A</Key>
          <Key>S</Key>
          <Key>D</Key>
          <span>or arrow keys · drive</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Key wide>Space</Key>
          <span>handbrake drift</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Key wide>Esc</Key>
          <span>pause</span>
        </span>
      </div>
    </div>
  )
}
