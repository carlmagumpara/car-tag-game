const BUTTONS = [
  { action: 'left', label: '◀', className: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' },
  { action: 'right', label: '▶', className: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' },
  { action: 'reverse', label: 'REV', className: 'border-amber-400/30 bg-amber-500/10 text-amber-200' },
  { action: 'throttle', label: 'GAS', className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' },
  { action: 'handbrake', label: 'DRIFT', className: 'border-rose-400/30 bg-rose-500/10 text-rose-200' },
]

function TouchButton({ action, label, className, onPress }) {
  const start = (event) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onPress(action, true)
  }
  const stop = (event) => {
    event.preventDefault()
    onPress(action, false)
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={() => onPress(action, false)}
      onContextMenu={(event) => event.preventDefault()}
      className={`flex h-16 min-w-[68px] touch-none select-none items-center justify-center rounded-xl border font-mono text-xs font-bold shadow-lg shadow-black/30 active:scale-95 ${className}`}
    >
      {label}
    </button>
  )
}

// Rendered only on small/touch screens; desktop uses the keyboard hook.
export default function TouchControls({ onPress, enabled }) {
  return (
    <div
      className={`absolute inset-x-3 bottom-3 z-20 flex items-end justify-between md:hidden ${enabled ? '' : 'pointer-events-none opacity-40'}`}
    >
      <div className="flex gap-3">
        {BUTTONS.slice(0, 2).map((button) => (
          <TouchButton key={button.action} {...button} onPress={onPress} />
        ))}
      </div>
      <div className="flex gap-3">
        {BUTTONS.slice(2).map((button) => (
          <TouchButton key={button.action} {...button} onPress={onPress} />
        ))}
      </div>
    </div>
  )
}
