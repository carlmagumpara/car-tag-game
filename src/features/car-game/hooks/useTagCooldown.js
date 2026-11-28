import { useEffect, useState } from 'react'

// Post-tag immunity is a UI-held countdown: the authoritative expiry lives on
// the server (or in the local AI match). Events carry `immuneUntilLocal`, an
// expiry converted to performance.now() on receipt, so every client counts
// down the same remaining time despite clock skew. `cooldownMs` is only a
// fallback for older/raw payloads.
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

  if (!tagEvent) return 0
  const expiry = Number.isFinite(tagEvent.immuneUntilLocal)
    ? tagEvent.immuneUntilLocal
    : Number.isFinite(tagEvent.receivedAt)
      ? tagEvent.receivedAt + cooldownMs
      : null
  if (expiry === null) return 0
  return Math.max(0, Math.ceil((expiry - now) / 1000))
}
