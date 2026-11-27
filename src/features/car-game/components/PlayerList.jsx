export default function PlayerList({ players, selfId }) {
  const visible = players.slice(0, 6)
  const hidden = Math.max(0, players.length - visible.length)

  return (
    <div className="absolute right-3 top-3 z-20 w-40 rounded-xl border border-white/10 bg-slate-950/75 p-3 shadow-lg shadow-black/30 backdrop-blur-md sm:right-4 sm:top-4 sm:w-48">
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Drivers
      </div>
      <ul className="space-y-1.5">
        {visible.map((player) => (
          <li key={player.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-[0_0_8px_currentColor]"
              style={{ backgroundColor: player.color, color: player.color }}
            />
            <span className="truncate font-mono text-[11px] text-slate-300">{player.name}</span>
            {player.isIt && <span className="font-mono text-[9px] font-bold text-orange-300">IT</span>}
            {player.ready && (
              <span className="font-mono text-[9px] font-bold text-emerald-300" title="Ready to start">
                RDY
              </span>
            )}
            {player.id === selfId && (
              <span className="ml-auto font-mono text-[9px] text-cyan-300">YOU</span>
            )}
            {player.id !== selfId && player.tags > 0 && (
              <span className="ml-auto font-mono text-[9px] text-slate-500">{player.tags}</span>
            )}
          </li>
        ))}
        {players.length === 0 && (
          <li className="font-mono text-[11px] text-slate-500">Waiting for players…</li>
        )}
        {hidden > 0 && (
          <li className="font-mono text-[10px] text-slate-500">+{hidden} more</li>
        )}
      </ul>
    </div>
  )
}
