import { PLAYER_NAME_MAX_LENGTH } from '../game/player-name.js'

export default function NameField({ value, onChange, onRandom, id = 'driver-name' }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="font-mono text-xs uppercase tracking-widest text-slate-500">
        Your name
      </label>
      <input
        id={id}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        maxLength={PLAYER_NAME_MAX_LENGTH}
        placeholder="e.g. Neon Falcon"
        autoComplete="off"
        spellCheck="false"
        className="w-48 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60"
      />
      <button
        type="button"
        onClick={onRandom}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
      >
        Random
      </button>
    </div>
  )
}
