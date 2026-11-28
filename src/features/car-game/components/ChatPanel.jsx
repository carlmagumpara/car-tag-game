import { useEffect, useRef, useState } from 'react'
import { CHAT_MAX_LENGTH, normalizeChatDraft } from '../game/chat.js'

export default function ChatPanel({ messages, onSend, enabled }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(true)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, open])

  const submit = (event) => {
    event.preventDefault()
    const value = normalizeChatDraft(text)
    if (!value) return
    onSend(value)
    setText('')
  }

  return (
    <section
      aria-label="Room chat"
      className="rounded-xl border border-white/10 bg-slate-950/75 p-2.5 shadow-lg shadow-black/30 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400 transition hover:text-white"
      >
        <span>
          Chat
          {messages.length > 0 && <span className="ml-1.5 text-cyan-300">{messages.length}</span>}
        </span>
        <span aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <>
          <ul
            ref={listRef}
            aria-live="polite"
            className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1"
          >
            {messages.length === 0 && (
              <li className="font-mono text-[10px] text-slate-500">Say hello to the room…</li>
            )}
            {messages.map((message) => (
              <li key={message.id} className="font-mono text-[10px] leading-snug text-slate-300">
                <span className="font-semibold" style={{ color: message.color }}>
                  {message.name}
                </span>
                <span className="text-slate-600"> › </span>
                <span className="break-words">{message.text}</span>
              </li>
            ))}
          </ul>

          <form onSubmit={submit} className="mt-2 flex gap-1.5">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={CHAT_MAX_LENGTH}
              disabled={!enabled}
              aria-label="Chat message"
              placeholder="Message…"
              autoComplete="off"
              spellCheck="false"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!enabled || !normalizeChatDraft(text)}
              className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 font-mono text-[10px] font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </section>
  )
}
