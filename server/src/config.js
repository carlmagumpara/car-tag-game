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
  tickMs: 50, // 20Hz state broadcast; clients send at most 20Hz each.
  tagRadius: Math.min(Math.max(Number(process.env.TAG_RADIUS) || 38, 20), 80),
  tagCooldownMs: Math.min(Math.max(Number(process.env.TAG_COOLDOWN_MS) || 1200, 200), 10000),
})
