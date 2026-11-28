import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Load server/.env regardless of the directory the process was started from.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const origins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3001,
  clientOrigins: origins,
  maxPlayers: Math.min(Math.max(Number(process.env.MAX_PLAYERS) || 40, 2), 200),
  // Cap on simultaneous rooms so a public server cannot be filled with empty
  // lobbies. Existing rooms can always be joined, even at the cap.
  maxRooms: Math.min(Math.max(Number(process.env.MAX_ROOMS) || 200, 1), 1000),
  tickMs: 50, // 20Hz state broadcast; clients send at most 20Hz each.
  // Vercel Functions receive the full /api/game path, so the function entry
  // overrides this with '/api/game'. Standalone servers use the default.
  socketPath: process.env.SOCKET_IO_PATH || '/socket.io',
  tagRadius: Math.min(Math.max(Number(process.env.TAG_RADIUS) || 38, 20), 80),
  // Global gate between transfers: one collision can only pass "it" once, and
  // a second car cannot be tagged again until this window closes.
  tagCooldownMs: Math.min(Math.max(Number(process.env.TAG_COOLDOWN_MS) || 1000, 200), 10000),
  // Per-player immunity given to the newly tagged driver. They cannot be
  // tagged again during this window, but can still tag others after the
  // global gate above closes.
  immunityMs: Math.min(Math.max(Number(process.env.IMMUNITY_MS) || 2000, 200), 10000),
  // How long the round-end results screen stays up before the next countdown.
  resultHoldMs: Math.min(Math.max(Number(process.env.RESULT_HOLD_MS) || 2500, 500), 10000),
  // Countdown shown before a fresh round, after the previous one ends.
  countdownMs: Math.min(Math.max(Number(process.env.COUNTDOWN_MS) || 3000, 500), 10000),
  // Duration of a scoring round in seconds. The timer only runs while the
  // round is active; it starts automatically once two drivers are connected.
  roundSeconds: Math.min(Math.max(Number(process.env.ROUND_SECONDS) || 90, 5), 3600),
})
