import { useEffect, useState } from 'react'

// Post-tag immunity is a UI-held countdown: the authoritative cooldown lives
// on the server (or in the local AI match), and this only formats the time left
// at 5 Hz. `tagEvent.receivedAt` is a performance.now() timestamp set by the
// event handler in both hooks.
export function useTagCooldown(tagEvent, cooldownMs) {
  const [now, setNow] = useState(() =>
    typeof performance === 'undefined' ? 0 : performance.now(),
  )

  useEffect(() => {
    setNow(performance.now())
    if (!tagEvent) return undefined
    const timer = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(timer)
  }, [tagEvent])

  if (!tagEvent || !Number.isFinite(tagEvent.receivedAt)) return 0
  return Math.max(0, Math.ceil((cooldownMs - (now - tagEvent.receivedAt)) / 1000))
}
