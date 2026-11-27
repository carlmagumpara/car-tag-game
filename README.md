# Neon Drive — multiplayer car game

A standalone React + Vite + Tailwind CSS frontend and a separate Node.js/Express/Socket.IO
server that lets visitors drive around the same stylized top-down city in real time and play
**tag**: one driver is "it" and passes the role on by bumping into another car. Drivers ready up
for a 30-second round (two drivers minimum); the one with the most tags when time runs out wins.

- **Frontend:** React 19, Vite 8, Tailwind CSS 3, HTML Canvas, Socket.IO Client. JavaScript/JSX only.
- **Backend:** Express 5, Socket.IO 4, in-memory player state.
- **Deployment:** Vercel hosts both the static frontend and the Socket.IO function; the
  GitHub Pages workflow and standalone Node server are also kept for other hosts.

---

## 1. Architecture and data flow

```
Browser A (Canvas + React UI) ─┐
Browser B (Canvas + React UI) ─┼── Socket.IO ──> Node game server (in-memory players)
Browser C (Canvas + React UI) ─┘                └── 20 Hz broadcast to the whole room
```

- Each browser runs its own **delta-time physics simulation** locally (see `src/features/car-game/game/physics.js`).
  Input never waits for a server round trip.
- `GameCanvas.jsx` owns the single `requestAnimationFrame` loop. It reads input from a ref,
  steps physics, updates the camera, interpolates remote players, renders the canvas, and
  throttles network sends (20 Hz) and HUD React updates (5 Hz).
- The server **validates and clamps** incoming kinematics and broadcasts a compact snapshot
  for every player at 20 Hz. Remote cars are drawn 100 ms in the past and interpolated
  between snapshots to hide jitter.
- Tag state is **server-owned**: during the same 20 Hz tick the server checks whether the
  current tagger is within contact range of another car, transfers "it", tracks tag counts and
  emits `tag:hit`. Clients cannot claim a tag themselves.
- Round state is **server-owned** too: `player:ready` flags start the countdown only when at
  least two drivers are connected and every driver is ready. Scores reset at the start of each
  round and tags only count while the timer is running; `game:state` broadcasts the phase,
  seconds left, ready drivers and the final standings.
- The city is generated from a **fixed seed** (`game/world.js`), so every client and the
  server calculate the same roads, buildings and spawn points without sending map data.
- React state is used only for UI (connection status, roster, HUD text). The animation loop
  touches refs, never React state.

### File map

```
src/
  App.jsx                              hash-based view switch (#/game), landing page
  features/car-game/
    CarGame.jsx                        composition, overlays, pause/exit
    GameCanvas.jsx                     rAF loop, camera, DPR canvas, effects
    components/GameHUD.jsx             speed, status, online count, pause/exit
    components/PlayerList.jsx          roster with color swatches
    components/GameControls.jsx        keyboard legend
    components/TouchControls.jsx       mobile pointer buttons
    hooks/useKeyboard.js               key state in a ref, blur/visibility cleanup
    hooks/useMultiplayer.js            socket lifecycle, roster, reconnection
    game/constants.js                  physics/network/world tuning
    game/world.js                      seeded city, spawn points, clamping
    game/physics.js                    pure vehicle physics and collisions
    game/input.js                      key mapping, axis derivation (pure)
    game/interpolation.js              remote snapshot buffering (pure)
    game/renderer.js                   Canvas drawing, static city pre-render, cars, lighting, nameplates
    game/socket-config.js              build-time Socket.IO URL/path/transport settings
api/
  game.js                              Vercel Function exporting the game server
vercel.json                            Vercel Vite build + Function duration config
server/
  src/index.js                         standalone entry (calls listen())
  src/create-game-server.js            shared server factory, no listen() — used by both entries
  src/config.js                        env parsing (port, CORS, player cap, tag, round tuning)
  src/round.js                         pure round rules (ready, timer, winner, scoring window)
  src/tag.js                           pure tag rules (contact, cooldown, reassignment)
  src/validation.js                    movement validation + rate limiter (pure)
  src/players.js                       generated names/colors, spawn slots, store
  Dockerfile                           standalone container
tests/, server/test/                   node:test suites
_tmp/                                  scratch verification scripts (gitignored)
```

### Small implementation decisions

- `base: './'` in `vite.config.js` plus hash routing keeps one build working at a GitHub
  Pages project URL (`/<repo>/`), at a custom-domain root and at `localhost`, with no SPA
  404 rewrite needed. Override with `VITE_BASE_PATH=/` for a root deployment.
- The server duplicates its world-limit constants instead of importing browser code, so it
  can be deployed as an isolated service. Keep `server/src/validation.js` in sync with
  `src/features/car-game/game/constants.js`.
- The dusk city is drawn once into an offscreen canvas at startup (textured asphalt,
  crosswalks, sidewalks, lit windows, roof equipment, parks, streetlights and parked cars)
  and blitted each frame; only cars, lights, skids and particles redraw dynamically.
- Device pixel ratio is capped at 2 to avoid rendering 3x/4x pixel buffers on phones.
- Skid marks and dust particles use capped buffers and in-place compaction; no array
  filtering happens in the render loop.
- `dt` is clamped to 50 ms and the frame clock is reset on tab focus so a suspended tab
  never simulates a huge time step.
- Pausing releases all held keys/touch state and stops physics and network sends, but the
  canvas keeps rendering a static frame.
- The "km/h" value is a display scale of internal pixels/second (`SPEED_DISPLAY_FACTOR`),
  not a physically calibrated speed.

---

## 2. Installation and local development

Requirements: Node.js 20+ (22 recommended) and npm.

```bash
# frontend (workspace root)
npm install
cp .env.example .env.local        # already created for local use

# backend (separate package, separate dependencies)
cd server
npm install
cp .env.example .env              # already created for local use
cd ..
```

Run two terminals:

```bash
npm run server     # http://localhost:3001  (health: /health)
npm run dev        # http://localhost:5173  -> open /#/game
```

Open `http://localhost:5173/#/game` in two browser windows to see both cars.
Local defaults are `http://localhost:3001`, path `/socket.io` and both transports; the Vercel
variables below only affect deployed builds. Root dependencies now also include the server
packages (needed by the Vercel Function), though `server/` still has its own package.

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm test` | physics, input mapping and interpolation tests (node:test) |
| `npm run test:server` | server movement validation and rate limiter tests |
| `npm run test:all` | both suites |
| `npm run build` | production static build into `dist/` |
| `npm run preview` | serve the built site on `http://localhost:4173` |
| `cd server && npm run dev` | server with auto-restart on file changes |

---

## 3. Environment variables

Frontend (root `.env.local`; all `VITE_*` values are public and embedded in the bundle —
never put secrets here):

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_GAME_SERVER_URL` | `http://localhost:3001` | Socket.IO server URL. Use `https://…`/`wss://…` in production. |
| `VITE_BASE_PATH` | `./` | Vite base path. Set `/` for a custom-domain root deployment. |

Backend (`server/.env`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Hosting platforms inject their assigned port; honored automatically. |
| `CLIENT_ORIGINS` | `http://localhost:5173` | Comma-separated explicit origins for Socket.IO CORS. No wildcards. |
| `MAX_PLAYERS` | `40` | Concurrent player cap (clamped to 2–200). |
| `TAG_RADIUS` | `38` | Contact distance in world pixels for a valid tag (clamped to 20–80). |
| `TAG_COOLDOWN_MS` | `1200` | Grace period after a tag before another tag can occur. |
| `ROUND_SECONDS` | `30` | Length of a scoring round in seconds (clamped to 5–3600). |

`.env.example` files in both folders list every variable with placeholders. `.env*` files
are gitignored except the examples.

---

## 4. Socket.IO event protocol

All events use JSON payloads. The server assigns the player ID; clients never choose one.

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `game:init` | server → client | `{ id, player: Player, players: Player[], config: { maxPlayers, tickMs, world, tag, roundSeconds, minPlayers } }` | Sent immediately after connect. `players` excludes the new player; `tag` is `{ radius, cooldownMs }`. |
| `player:joined` | server → others | `Player` | A new car entered the city. |
| `player:ready` | client → server | `{ ready?: boolean }` | Defaults to `true`; `false` cancels readiness. Ignored while the timer is running. |
| `game:state` | server → room | `{ phase, roundSeconds, secondsLeft, endsAt, minPlayers, readyIds, winnerIds, standings }` | Sent on phase transitions/joins/readiness/leaves and once per countdown second. |
| `player:move` | client → server | `{ x: number, y: number, angle: number, speed: number }` | At most 20 Hz; validated, clamped and rate limited. |
| `player:moved` | server → room | `{ players: Player[] }` | One 20 Hz broadcast per room, not one per client message. |
| `player:left` | server → all | `{ id: string }` | Sent on disconnect. |
| `tag:hit` | server → room | `{ taggerId, taggedId, itId, reason, at, players: [{ id, isIt, tags }] }` | `reason` is `tag` for contact, `reassign` for the first/leaving tagger. Drives HUD toasts and flash effects. |
| `game:error` | server → client | `{ code: string, message: string }` | `INVALID_PAYLOAD`, `INVALID_NUMBER`, `RATE_LIMITED` (dropped silently), `SERVER_FULL`. |

`Player` shape:

```json
{
  "id": "socket-id",
  "name": "Neon Falcon 42",
  "color": "#38bdf8",
  "x": 1600,
  "y": 1280,
  "angle": 0,
  "speed": 0,
  "isIt": false,
  "tags": 2,
  "ready": false
}
```

- `angle` is normalized to `[-π, π]`; `speed` is signed forward velocity in px/s.
- `isIt` marks the current tagger; `tags` counts successful tags; `ready` is the driver's
  readiness for the next round. All three are server-owned.
- `phase` is `waiting`, `playing` or `finished`; `secondsLeft` is a whole number of seconds and
  `standings` is `[{ id, name, tags }]` sorted best-first. Ties are listed in `winnerIds`; a
  round with zero tags has no winners.
- The first driver becomes "it" automatically. If the tagger leaves, "it" passes to another
  driver; a 1.2 s cooldown (configurable) prevents instant tag-backs. Each new round resets
  scores and reassigns "it".
- Movement packets over ~25/s or faster than 40 ms apart are dropped per socket.
- Five malformed packets (not rate-limited drops) disconnect that socket.
- A full city emits `game:error` with `SERVER_FULL` and closes the connection.

---

## 5. Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Accelerate | `W` / `↑` | GAS |
| Reverse | `S` / `↓` | REV |
| Steer left / right | `A` / `D` or `←` / `→` | ◀ / ▶ |
| Handbrake drift | `Space` | DRIFT |
| Pause / resume | `Esc` or Pause button | Pause button |
| Leave game | Exit button | Exit button |

**Tag rules:** the driver with the flaming orange outline is "it". Drive into another car to
tag them — the role and a "Tagged!" flash transfer to them. The HUD shows who is "it" and how
many tags you have; the driver list marks the tagger with `IT`. Contact is resolved on the
server, so bumping is enough — there is no separate tag button.

**Round rules:** press `READY` in the HUD (or `Ready for next round` on the winner screen) to
indicate you want to play. The 30-second timer starts only when there are at least two drivers
and **every** connected driver is ready. Tags scored before the timer starts do not count. When
time runs out the driver with the most tags wins; ties share the win, and a scoreless round has
no winner. Press ready again to start another round. If the room drops below two drivers while a
round is running, the round is aborted and scores are cleared.

Game keys are only intercepted while the game is active; the landing page and normal
portfolio navigation are unaffected. Touch buttons use pointer capture and release on
`pointerup`, `pointercancel`, `lostpointercapture` and window blur.

---

## 6. Deployment

### Vercel (frontend + game server together)

Vercel Functions support WebSockets on Fluid Compute, so the Socket.IO server can run as a
function in the same project as the static site. `vercel.json` selects the Vite build
(`dist/`) and sets `api/game.js` to a 300 s maximum duration.

1. Import the repository into Vercel. Framework preset **Vite**; build command and output
   directory come from `vercel.json` (`npm run build`, `dist`).
2. Confirm **Fluid Compute** is enabled (Project Settings → Functions). It is the default for
   projects created after 2025-04-23 and is required for WebSockets.
3. Add these **Vercel environment variables** (Production and Preview):

   | Variable | Example | Purpose |
   | --- | --- | --- |
   | `VITE_GAME_SOCKET_PATH` | `/api/game` | Socket.IO path of the exact function route |
   | `VITE_GAME_TRANSPORTS` | `websocket` | Vercel only upgrades WebSockets, not long-polling |
   | `VITE_GAME_SERVER_URL` | *(empty)* | Empty = same deployment origin; or set `https://<project>.vercel.app` |
   | `CLIENT_ORIGINS` | `https://<project>.vercel.app` | Server-side CORS allowlist; add custom domains too |
   | `MAX_PLAYERS`, `TAG_RADIUS`, `TAG_COOLDOWN_MS`, `ROUND_SECONDS` | *(optional)* | Same tuning as standalone |

   `VITE_*` values are public build-time settings; `CLIENT_ORIGINS` is server-only.
4. Deploy. Open `https://<project>.vercel.app/#/game` in two windows to test.
   Health check: `GET https://<project>.vercel.app/api/game` (the function is served at that
   exact path; `/api/game/*` subpaths are not routed to it, so the Socket.IO path is `/api/game`
   itself).

Important Vercel-specific behavior:

- A WebSocket connection is pinned to the function instance that accepted it and closes when
  that function reaches `maxDuration` (300 s here). The client already auto-reconnects; after
  a reconnect the player respawns with a fresh id.
- New connections can land on **different instances**. Player/tag state is in memory, so
  players on different instances will not see each other. This is acceptable for a small
  portfolio demo but does not scale; use Vercel Marketplace Redis (or another shared store /
  pub-sub) to share rooms and presence across instances.
- The root `package.json` includes `express`, `socket.io` and `dotenv` because Vercel installs
  root dependencies for Functions; `server/package.json` keeps the standalone copy.

### Frontend → GitHub Pages

1. Enable Pages with **GitHub Actions** as the source.
2. Add a repository variable `VITE_GAME_SERVER_URL` with the public game server URL, e.g.
   `https://neon-drive.onrender.com`. Optionally add `VITE_BASE_PATH` (defaults to `./`).
3. Push to `main` (or run the workflow manually). `.github/workflows/deploy.yml` installs,
   validates the variable, builds with the URL injected, uploads `dist/` and deploys.
4. The game lives at `https://<user>.github.io/<repo>/#/game`.

The workflow fails early if `VITE_GAME_SERVER_URL` is unset so a build can never silently
fall back to `localhost` in production. The Node server is **not** hosted on GitHub Pages.

### Backend → Node hosting service

- Start command: `npm start` from `server/` (or use `server/Dockerfile`).
- The platform's `PORT` is read automatically; bind to `0.0.0.0` (default Node behavior).
- Set `CLIENT_ORIGINS` to the exact Pages URL, e.g.
  `https://<user>.github.io,http://localhost:5173` (comma-separated, no trailing slash).
- Use the platform's HTTPS termination; Socket.IO clients will negotiate WSS automatically
  when the page is served over HTTPS. Set `VITE_GAME_SERVER_URL` to the `https://` origin.
- Health check path: `GET /health` → `{ "status": "ok", "players": N, "uptimeSeconds": N }`.
  Point the platform's health probe at it.
- Example (Docker-based host): build `server/Dockerfile`, expose `PORT`, set `CLIENT_ORIGINS`.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| "Game server unavailable" overlay | Server process running? `VITE_GAME_SERVER_URL` correct? WSS URL on HTTPS page? |
| Connection succeeds but CORS error | `CLIENT_ORIGINS` must exactly match the page origin (scheme + host + port). |
| Players never see each other | Both clients must use the same server URL; check `/health` and browser console. |
| Assets 404 on Pages | `VITE_BASE_PATH` should be `./` for a project site, `/` for a custom-domain root. |
| Build fails in Actions | Repository variable `VITE_GAME_SERVER_URL` must be set. |
| Vercel game won't connect | `VITE_GAME_SOCKET_PATH=/api/game` (exact path), `VITE_GAME_TRANSPORTS=websocket`, and Fluid Compute enabled. |
| Vercel health 404 | Use `GET /api/game`; `/api/game/health` is not routed to the function. Check the Functions tab if `/api/game` 404s. |
| Players split into separate lobbies | Different function instances hold separate in-memory state; add Redis/pub-sub for scale. |
| Server restarts / players drop | Expected: state is in memory; clients reconnect automatically and respawn. |

---

## 7. Testing and verification

Automated (all executed during implementation):

```bash
npm run test:all           # 20 frontend + 21 server tests (incl. tag and round rules) — all passed
npm run build              # production build — passed
npm run server             # then: curl http://localhost:3001/health
node _tmp/integration-check.mjs    # two Socket.IO clients: init/join/move/leave/error/reconnect
node _tmp/tag-check.mjs            # two clients: contact transfers it, score updates, cooldown
node _tmp/vercel-function-check.mjs  # api/game.js behind emulated /api/game route, websocket-only
node _tmp/reconnect-check.mjs      # stop/restart server -> client auto-reconnect
```

Browser verification used two isolated Chromium contexts against both `npm run dev` and
the production preview (`npm run preview`): both drivers appeared, driving changed the HUD
speed, closing one session removed its car, pause/resume worked, and there were no console
or page errors. `_tmp/` scripts are scratch tooling, gitignored and not required to run the game.

Manual test checklist:

1. `npm run server`, `npm run dev`, open two windows at `/#/game`.
2. Drive with WASD/arrows; hold Space while turning to drift; confirm skid marks.
3. Drive to a world edge and into a building; confirm the car is blocked.
4. Drive the tagged car into the other one; confirm "it", the flash and the tag count transfer.
5. Close one window; the other should show the player leaving (and "it" reassigned if needed).
6. Click `READY` on one client: the timer stays paused. Click `READY` on the other: the 30-second
   countdown begins and scores reset. Check the winner screen when time runs out.
7. Stop and restart the server; both clients should show "Connection lost", then reconnect.
8. Resize the window and test on a phone-sized viewport for touch controls.

---

## 8. Performance considerations

- One Canvas, one `requestAnimationFrame` loop, no React renders per frame; HUD is throttled
  to 5 Hz and network sends to 20 Hz. The static city layer is a single `drawImage` call per
  frame instead of thousands of shape draws.
- The camera uses exponential smoothing and is clamped to the world; off-canvas buildings,
  trees and cars are culled before drawing.
- Remote snapshots are pruned (1 s max, 32 per car) and sampled into a reusable object.
- Physics/collision work is O(buildings) per frame (~250 buildings) with simple AABB checks.
- DPR is capped at 2; the tab-hidden case resets the frame clock; effects arrays have hard caps.
- Server broadcasts one snapshot per 20 Hz tick instead of one message per incoming move.

---

## 9. Security limitations

- **The server is not authoritative for physics.** It validates types, bounds and speed, but
  a modified client can still teleport within the world or clip through buildings. Tag state,
  however, **is** server-authoritative: clients only receive `tag:hit` results and cannot
  claim tags or edit "it"/score fields.
- There is **no authentication or persistent identity**: names, colors and IDs are generated
  per connection. A page reload produces a new driver.
- CORS is restricted to explicitly configured origins, but the public game is deliberately
  open to anyone who can load the frontend; abuse at scale needs a proxy/rate limits at the
  hosting layer.
- Per-socket rate limiting and malformed-packet disconnects reduce accidental and casual
  abuse; they are not a substitute for DDoS protection.
- No secrets belong in `VITE_*` variables. Backend-only settings stay in `server/.env`.

---

## 10. Known issues and future improvements

- Remote cars do not yet render the local drift effect (the protocol carries no drift flag).
- Car-to-car collisions are not simulated; tag uses proximity checks instead, so cars can
  overlap visually.
- Because physics is client-side, a modified client can still get close enough to tag
  unfairly; authoritative physics would close that gap.
- In-memory state means a server restart clears the city, tags and all players.
- Single room only; no private games, chat or persistent scoreboards (tag counts reset each
  round and on disconnect).
- Spawn slots repeat after 12 concurrent players.
- Future work: server-authoritative physics with input messages, proper collision-based tags,
  multiple rooms, persistent profiles and scoreboards, and an authoritative drift flag.
