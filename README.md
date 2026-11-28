# Neon Drive — multiplayer car game

A standalone React + Vite + Tailwind CSS frontend and a separate Node.js/Express/Socket.IO
server that lets visitors drive around the same stylized top-down city in real time and play
**tag**: one driver is "it" and passes the role on by bumping into another car. Drivers ready up
for a timed round (two drivers minimum); the one with the most tags when time runs out wins.

Every game lives in its **own room** with a random six-character code. Create a room, copy its
link, and only drivers who join with that code see each other or share a scoreboard. Each room
also has **text chat** and optional **voice**: chat is ephemeral and room-scoped, and voice is a
browser-to-browser WebRTC mesh whose signaling rides on the same Socket.IO connection (audio
never passes through the server).

- **Frontend:** React 19, Vite 8, Tailwind CSS 3, HTML Canvas, Socket.IO Client. JavaScript/JSX only.
- **Backend:** Express 5, Socket.IO 4, in-memory player state.
- **Deployment:** Vercel hosts both the static frontend and the Socket.IO function; the
  GitHub Pages workflow and standalone Node server are also kept for other hosts.

---

## 1. Architecture and data flow

```
Browser A (Canvas + React UI) ─┐  room ABC234
Browser B (Canvas + React UI) ─┼── Socket.IO ──> Node game server
Browser C (Canvas + React UI) ─┘  room XYZ789     └── in-memory RoomManager
                                                       ├─ room ABC234: players/tag/round
                                                       └─ room XYZ789: players/tag/round
```

Clients pass a room code in the Socket.IO handshake; the server joins that room before sending
`game:init`. All positional, tag and round broadcasts are scoped to that room, and empty rooms
are deleted so their codes can be reused. A bare `/#/game` URL gets a freshly generated code.

- Each room is an isolated `Room` instance with its own player store, tag state, round state,
  rate limiters and Socket.IO room. A player can only ever see drivers with the same code.
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
  server calculate the same roads, houses, shops, playgrounds, hospital and spawn points
  without sending map data.
- React state is used only for UI (connection status, roster, HUD text, chat). The animation loop
  touches refs, never React state.
- **Chat** is ephemeral: `chat:send` is validated and rate-limited server-side, then broadcast as
  `chat:message` with a server-owned id, name, color and timestamp. Nothing is stored after a
  disconnect. Messages are keyed to the room, so another code never sees them.
- **Voice** is an opt-in WebRTC mesh. `useVoice.js` acquires the microphone only after the driver
  clicks **Join**, tracks participants from `voice:peers`, and creates one peer connection per
  other driver in voice. The lower socket id sends the offer, avoiding simultaneous offers. The
  server only validates and relays `voice:offer` / `voice:answer` / `voice:ice` between drivers
  who are both in voice in the same room; it does not handle audio. Microphone state stays in
  refs, and remote audio plays through hidden `<audio>` elements.

### File map

```
src/
  App.jsx                              hash routing (#/game/<CODE>), create/join landing page
  features/car-game/
    CarGame.jsx                        composition, overlays, pause/exit, copy room link
    game/room-id.js                     six-character code generation/normalization
    game/car-colors.js                  selectable car palette, normalization, localStorage
    GameCanvas.jsx                     rAF loop, camera, DPR canvas, effects
    components/GameHUD.jsx             speed, status, online count, pause/exit
    components/PlayerList.jsx          roster with color swatches
    components/GameControls.jsx        keyboard legend
    components/TouchControls.jsx       mobile pointer buttons
    components/ChatPanel.jsx           room chat panel, message list and input
    components/VoiceControls.jsx       join/mute controls and voice errors
    components/NameField.jsx           name input + Random button
    components/NameGate.jsx            name prompt for direct share links
    hooks/useKeyboard.js               key state in a ref, blur/visibility cleanup
    hooks/useMultiplayer.js            socket lifecycle, roster, reconnection, chat
    hooks/useVoice.js                  WebRTC mesh: mic, peers, signaling, cleanup
    game/chat.js                       client chat input normalization
    game/player-name.js                random name + name normalization
    game/voice-config.js               build-time STUN configuration
    game/constants.js                  physics/network/world tuning
    game/world.js                      seeded city, landmark blocks, spawn points, clamping
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
  src/create-game-server.js            shared server factory with per-room broadcasting
  src/rooms.js                         RoomManager, room state, shareable id generation
  src/config.js                        env parsing (port, CORS, player/room caps, tag, round tuning)
  src/chat.js                          pure chat validation (length, single line)
  src/voice.js                         pure voice state/signal validation
  src/round.js                         pure round rules (ready, timer, winner, scoring window)
  src/tag.js                           pure tag rules (contact, cooldown, reassignment)
  src/validation.js                    movement validation + rate limiter (pure)
  src/players.js                       car palette, generated names, spawn slots, store
  Dockerfile                           standalone container
tests/, server/test/                   node:test suites
_tmp/                                  scratch verification scripts (gitignored)
```

### Small implementation decisions

- `base: './'` in `vite.config.js` plus hash routing keeps one build working at a GitHub
  Pages project URL (`/<repo>/`), at a custom-domain root and at `localhost`, with no SPA
  404 rewrite needed. Override with `VITE_BASE_PATH=/` for a root deployment.
- Room codes are six uppercase characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O`
  or `1/I`). The client and server each generate the same format; keep `game/room-id.js` and
  `server/src/rooms.js` in sync.
- The server duplicates its world-limit constants instead of importing browser code, so it
  can be deployed as an isolated service. Keep `server/src/validation.js` in sync with
  `src/features/car-game/game/constants.js`.
- Car colors follow the same rule: `src/features/car-game/game/car-colors.js` and
  `server/src/players.js` each hold the palette. The chosen color travels in the Socket.IO
  handshake (`carColor` in `auth`/`query`) and the server validates it before assigning it;
  anything invalid falls back to the room's distinct default color.
- Chat length is duplicated: `src/features/car-game/game/chat.js` and `server/src/chat.js` both
  use 240 characters. Driver-name rules are duplicated in `game/player-name.js` and
  `server/src/players.js` (24 characters, single line) for the same reason. Voice signaling limits
  live in `server/src/voice.js`; the server relays only to drivers who opted in and are in the
  same room.
- Voice uses a public STUN server by default. Override it with `VITE_VOICE_STUN_URL` (a public
  value, not a secret). Without TURN, drivers behind symmetric NAT may not connect.
- The dusk city is drawn once into an offscreen canvas at startup (textured asphalt,
  crosswalks, sidewalks, lit windows, roof equipment, parks, houses, a 7/11 store,
  playgrounds, a hospital, streetlights and parked cars) and blitted each frame; only cars,
  lights, skids and particles redraw dynamically. Wider roads leave room for two cars to
  pass, and landmark blocks keep the same recognizable places on every client.
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

Open `http://localhost:5173/` and click **Create a room**; copy the code or **Copy link** from
the HUD and open that link in a second window to see both cars. A bare `/#/game` URL also works
— it generates a fresh room code. Local defaults are `http://localhost:3001`, path `/socket.io`
and both transports; the Vercel variables below only affect deployed builds. Root dependencies
now also include the server packages (needed by the Vercel Function), though `server/` still has
its own package.

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
| `VITE_VOICE_STUN_URL` | `stun:stun.l.google.com:19302` | Optional public STUN server for WebRTC voice. Not a secret. |

Backend (`server/.env`):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Hosting platforms inject their assigned port; honored automatically. |
| `CLIENT_ORIGINS` | `http://localhost:5173` | Comma-separated explicit origins for Socket.IO CORS. No wildcards. |
| `MAX_PLAYERS` | `40` | Concurrent player cap per room (clamped to 2–200). |
| `MAX_ROOMS` | `200` | Simultaneous room cap (clamped to 1–1000); existing rooms can always be joined. |
| `TAG_RADIUS` | `38` | Contact distance in world pixels for a valid tag (clamped to 20–80). |
| `TAG_COOLDOWN_MS` | `1200` | Grace period after a tag before another tag can occur. |
| `ROUND_SECONDS` | `60` | Length of a scoring round in seconds (clamped to 5–3600). |

`.env.example` files in both folders list every variable with placeholders. `.env*` files
are gitignored except the examples.

---

## 4. Socket.IO event protocol

All events use JSON payloads. The server assigns the player ID; clients never choose one.
A client requests a room through `auth: { roomId, carColor, name }` (or
`query: { room, carColor, name }`). The server validates the six-character code, creates the room
if needed, joins the socket and only then sends `game:init`. A missing/invalid code creates a
fresh room whose id is returned in `game:init`. `name` is normalized (24 characters, one line),
and duplicate names in a room get a numeric suffix; an absent or invalid name falls back to a
generated one so raw clients still work. A socket arriving while the room's round is `playing`
is refused with `GAME_IN_PROGRESS` and disconnected; waiting rooms and finished rooms can still
be joined.

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `game:init` | server → client | `{ id, roomId, player: Player, players: Player[], config: { maxPlayers, tickMs, world, tag, roundSeconds, minPlayers } }` | Sent immediately after joining the room. `players` are the other drivers **in that room**; `tag` is `{ radius, cooldownMs }`. |
| `player:joined` | server → others | `Player` | A new car entered the city. |
| `player:ready` | client → server | `{ ready?: boolean }` | Defaults to `true`; `false` cancels readiness. Ignored while the timer is running. |
| `game:state` | server → room | `{ phase, roundSeconds, secondsLeft, endsAt, minPlayers, readyIds, winnerIds, standings }` | Sent on phase transitions/joins/readiness/leaves and once per countdown second. |
| `player:move` | client → server | `{ x: number, y: number, angle: number, speed: number }` | At most 20 Hz; validated, clamped and rate limited. |
| `player:moved` | server → room | `{ players: Player[] }` | One 20 Hz broadcast per room, not one per client message. |
| `player:left` | server → room | `{ id: string }` | Sent on disconnect to the room the driver was in. |
| `tag:hit` | server → room | `{ taggerId, taggedId, itId, reason, at, players: [{ id, isIt, tags }] }` | `reason` is `tag` for contact, `reassign` for the first/leaving tagger. Drives HUD toasts and flash effects. |
| `game:error` | server → client | `{ code: string, message: string }` | `INVALID_PAYLOAD`, `INVALID_NUMBER`, `RATE_LIMITED` (dropped silently), `INVALID_CHAT` (bad message), `SERVER_FULL` (room full), `ROOM_UNAVAILABLE` (room cap reached), `GAME_IN_PROGRESS` (round running). |
| `chat:send` | client → server | `{ text: string }` | 1–240 chars, single line; rate-limited to 3/s with a 400 ms gap. |
| `chat:message` | server → room | `{ id, playerId, name, color, text, at }` | Identity and timestamp are server-owned; no history is kept. |
| `voice:state` | client → server | `{ enabled: boolean, muted: boolean }` | Opt in/out of voice. Only enabled drivers appear in `voice:peers`. |
| `voice:peers` | server → room | `{ peers: [{ id, muted }] }` | Sent on join, state change and disconnect. |
| `voice:offer` / `voice:answer` | client → server → target | `{ to, sdp }` | Relayed as `{ from, sdp }` only if both drivers are in voice in the same room. |
| `voice:ice` | client → server → target | `{ to, candidate }` | ICE candidate relayed as `{ from, candidate }` under the same rules. |

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
- A full room emits `game:error` with `SERVER_FULL` and closes the connection. If the room cap is
  reached, a client asking for a new code gets `ROOM_UNAVAILABLE`. Rooms with no players are
  deleted, so their codes become available again.

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

**Your name:** type a driver name or click **Random** before you can create or join a room — both
buttons stay disabled until a name is chosen. Opening a shared link goes straight to a short name
prompt for the same choice, then connects you to that room. Names are unique within a room
(a suffix is added if someone else already has it) and are not saved between visits.

**Rooms:** click **Create a room** on the landing page to get a random six-character code. Share
the code or use **Copy link** in the HUD; anyone opening that link joins the same game. Enter a
code in the landing page's "Have a code?" field to join an existing room. Drivers in other rooms
are invisible and have separate tags and rounds.

**Car color:** pick a swatch under **Pick your car color** on the landing page before creating or
joining a room. The choice is sent with the connection, so everyone in the room sees your car in
that color, and it is saved in the browser for next time. Without a valid choice the server gives
each driver a different default color.

**Chat:** the panel in the lower right shows the last messages in your room. Type a message and
press Enter or **Send**; it disappears when you leave or reload the page. Messages are capped at
240 characters and rate-limited, and other rooms never see them.

**Voice:** press **Join** in the voice panel to open your mic (browsers only expose microphone
access on HTTPS or localhost, and will ask for permission). Everyone else in voice in the same room appears as a participant; **Mute** toggles
your microphone without leaving the call, and **Leave** releases it. Audio goes directly between
browsers over WebRTC; the game server only passes connection offers, answers and ICE candidates.
If you cannot hear another driver, you may be behind a network that needs a TURN server.

**Tag rules:** the driver with the flaming orange outline is "it". Drive into another car to
tag them — the role and a "Tagged!" flash transfer to them. The HUD shows who is "it" and how
many tags you have; the driver list marks the tagger with `IT`. Contact is resolved on the
server, so bumping is enough — there is no separate tag button.

**Round rules:** press `READY` in the HUD (or `Ready for next round` on the winner screen) to
indicate you want to play. The timer starts only when there are at least two drivers
and **every** connected driver is ready. Tags scored before the timer starts do not count. When
time runs out the driver with the most tags wins; ties share the win, and a scoreless round has
no winner. Press ready again to start another round. If the room drops below two drivers while a
round is running, the round is aborted and scores are cleared. New drivers cannot join a room
while its round is running; they must wait for the round to finish (or use a different code).

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
   | `MAX_PLAYERS`, `MAX_ROOMS`, `TAG_RADIUS`, `TAG_COOLDOWN_MS`, `ROUND_SECONDS` | *(optional)* | Same tuning as standalone |

   `VITE_*` values are public build-time settings; `CLIENT_ORIGINS` is server-only.
4. Deploy. Open `https://<project>.vercel.app/#/game` in two windows to test.
   Health check: `GET https://<project>.vercel.app/api/game` (the function is served at that
   exact path; `/api/game/*` subpaths are not routed to it, so the Socket.IO path is `/api/game`
   itself).

Important Vercel-specific behavior:

- A WebSocket connection is pinned to the function instance that accepted it and closes when
  that function reaches `maxDuration` (300 s here). The client already auto-reconnects; after
  a reconnect the player respawns with a fresh id.
- New connections can land on **different instances**. Room state is in memory, so a room only
  lives on the instance that created it: two drivers with the same code can still end up on
  different instances and not see each other. This is acceptable for a small portfolio demo but
  does not scale; use Vercel Marketplace Redis (or another shared store / pub-sub) to share room
  state and presence across instances.
- The root `package.json` includes `express`, `socket.io` and `dotenv` because Vercel installs
  root dependencies for Functions; `server/package.json` keeps the standalone copy.
- Chat and voice signaling use the same room-scoped function, so they are per-instance too.
  WebRTC audio flows directly between browsers and can continue after the signaling socket
  closes at `maxDuration`, but reconnecting rebuilds the peer connections.

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
| Players with the same code cannot see each other | They may be on different function instances; add Redis/pub-sub for shared room state. |
| "Copy link" gives the wrong room | The code comes from the server's `game:init`; check the HUD shows the same code as the URL. |
| Room cap reached | Raise `MAX_ROOMS` or wait for empty rooms to expire; existing codes still work. |
| "A round is already in progress" | The room's timer is running. Wait for it to finish, then press **Try again**; joining mid-round is blocked. |
| Server restarts / players drop | Expected: state is in memory; clients reconnect automatically into a fresh room with the same code. |

---

## 7. Testing and verification

Automated (all executed during implementation):

```bash
npm run test:all           # 43 frontend + 43 server tests (rooms, tag, round, chat, voice, names, join gate) — all passed
npm run build              # production build — passed
npm run server             # then: curl http://localhost:3001/health
node _tmp/integration-check.mjs    # two Socket.IO clients: init/join/move/leave/error/reconnect
node _tmp/tag-check.mjs            # two clients: contact transfers it, score updates, cooldown
node _tmp/vercel-function-check.mjs  # api/game.js behind emulated /api/game route, websocket-only
node _tmp/reconnect-check.mjs      # stop/restart server -> client auto-reconnect
```

The room tests cover code generation/normalization, per-room state isolation, the room cap,
and two live Socket.IO clients that join different codes and receive only their own players.

Browser verification used two isolated Chromium contexts against both `npm run dev` and
the production preview (`npm run preview`): both drivers appeared, driving changed the HUD
speed, closing one session removed its car, pause/resume worked, and there were no console
or page errors. `_tmp/` scripts are scratch tooling, gitignored and not required to run the game.

Manual test checklist:

1. `npm run server`, `npm run dev`, open the landing page. Confirm **Create a room** and **Join
   room** are disabled until you type a name or click **Random**. Click **Create a room**, note the
   code, then **Copy link** and open it in a second window: both cars should appear.
2. Open a third window with a different code; it should not see either of the first two cars.
3. Drive with WASD/arrows; hold Space while turning to drift; confirm skid marks.
4. Drive to a world edge and into a building; confirm the car is blocked.
5. Drive the tagged car into the other one; confirm "it", the flash and the tag count transfer.
6. Close one window; the other should show the player leaving (and "it" reassigned if needed).
7. Click `READY` on one client: the timer stays paused. Click `READY` on the other: the countdown
   begins and scores reset. Check the winner screen when time runs out.
8. Stop and restart the server; both clients should show "Connection lost", then reconnect into
   the same room with fresh state.
9. Resize the window and test on a phone-sized viewport for touch controls.
10. Send a chat message in one window: it appears in the other window with the sender's name and
    color, and a window in a different room sees nothing.
11. Click **Join** in both windows (allow microphone access): both show two voice participants and
    hear each other. Use **Mute** in one window, then **Leave**; the participant count updates.
12. Open a share link in a fresh browser profile: the name prompt appears before the game connects.
    Choose a name and confirm the car joins the room in the link.
13. Start a round, then open the same link in a third window: it is refused with "A round is already
    in progress". When the round ends, the same link connects normally.

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
- Voice state and chat live in React state only when they change (chat is capped at 50 messages);
  microphone tracks and peer connections stay in refs, so WebRTC never triggers a render per frame.

---

## 9. Security limitations

- **The server is not authoritative for physics.** It validates types, bounds and speed, but
  a modified client can still teleport within the world or clip through buildings. Tag state,
  however, **is** server-authoritative: clients only receive `tag:hit` results and cannot
  claim tags or edit "it"/score fields.
- There is **no authentication or persistent identity**: IDs are generated per connection, and a
  driver name is chosen per visit (typed or generated by **Random**) but never stored. A page
  reload asks for a name again and produces a new driver. Room codes are shareable links, not
  secrets — anyone with a code can join that room.
- **Chat and voice are unmoderated and open to anyone in the room.** Chat text is validated for
  length and control characters and React escapes it on display; there are no channels, mentions
  or deleted messages. Voice signaling is validated and rate-limited, but the audio stream itself
  is encrypted by WebRTC (DTLS-SRTP) and never passes through the server.
- `VITE_VOICE_STUN_URL` is public build-time configuration, not a credential. Do not put TURN
  credentials in `VITE_*` variables; a private TURN URL belongs on the server side.
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
- In-memory state means a server restart clears every room, its tags and all players. On a
  multi-instance host (e.g. Vercel), rooms are also isolated per function instance. Because a
  reconnect is a new join, a driver who drops mid-round cannot re-enter until that round ends.
- Rooms are open to anyone with the code: there is no password or host control. Chat is ephemeral
  (no history, no delete or moderation) and there is no persistent scoreboard — tag counts reset
  each round and on disconnect.
- Voice is a full mesh, so bandwidth grows with the square of the driver count; it is intended for
  a handful of friends, not a large room. With only public STUN, drivers behind symmetric NAT or
  strict firewalls may not connect; adding TURN would require server-side credentials.
- Empty rooms are removed, so a code can be reused later by a different group.
- Spawn slots repeat after 12 concurrent players in a room.
- Future work: server-authoritative physics with input messages, proper collision-based tags,
  shared room state across instances, persistent profiles and scoreboards, an authoritative
  drift flag, voice moderation or an SFU for larger rooms, and optional chat history.
