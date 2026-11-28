# AGENTS.md — Operating Guide for AI Agents

This is the primary onboarding and operating guide for any AI agent contributing to this
repository. It describes the project as it **actually exists** today. When code and prose
disagree, **the code is the source of truth**; update the docs after changing behavior.

Quick orientation: this is a small, deliberately dependency-light real-time multiplayer game.
Most complexity lives in (a) a `requestAnimationFrame` loop that must never trigger React
renders, (b) a set of pure game/server modules, and (c) a Socket.IO protocol whose rules are
split between two independently deployable packages. Preserve those boundaries.

---

## 1. Project overview and purpose

**Neon Drive** is a browser-based, top-down multiplayer car tag game. Visitors create or join a
private room via a six-character code, drive around a shared procedurally generated neon city,
and play timed rounds of tag: one driver is "it", bumping into another driver passes the role on,
and the driver with the most tags when the timer expires wins.

- The frontend runs **local delta-time physics** for the player's own car, so input feels
  immediate with no server round trip.
- The server **validates and clamps** client-reported movement and broadcasts room-scoped
  snapshots at 20 Hz. Remote cars are rendered 100 ms in the past and interpolated.
- **Tag state and round state are server-owned.** Clients never decide who is "it", who scored,
  or who won, and cannot claim a tag themselves.
- Each room has **ephemeral text chat** and optional **open-mic voice**. Chat is validated and
  broadcast by the server; voice is a browser-to-browser WebRTC mesh where the server only
  validates and relays signaling (SDP offers/answers and ICE candidates).
- All state is **in memory**. Rooms are created on demand, isolated by code, and deleted when
  empty. A server restart clears everything.
- There are **no user accounts, logins, tokens, or persistent profiles** (see §7).

Deployment targets in this repo: Vercel (static site + Socket.IO function at `/api/game`),
GitHub Pages (frontend only, via GitHub Actions), and a standalone Node/Docker server.

### Source-of-truth map

| Question | Authoritative location |
| --- | --- |
| Product behavior, controls, deployment, troubleshooting | `README.md` |
| Runtime behavior and protocol details | `src/` and `server/src/` code |
| Configuration knobs and defaults | `.env.example`, `server/.env.example`, `server/src/config.js` |
| Build/route/deploy wiring | `vite.config.js`, `vercel.json`, `api/game.js`, `.github/workflows/deploy.yml` |
| Agent workflow and boundaries | this file |

---

## 2. Directory and module structure

```
car-game/                          git repo, branch `main`, ESM ("type": "module")
├── AGENTS.md                      this operating guide
├── README.md                      comprehensive product/deployment doc
├── index.html                     single HTML entry, `<html class="dark">`, hash-routed app
├── package.json                   frontend scripts + server deps needed by Vercel Function
├── package-lock.json
├── vite.config.js                 base: VITE_BASE_PATH || './'; dev server 0.0.0.0:5173
├── tailwind.config.js             darkMode 'class', extended font/animation theme
├── postcss.config.js              tailwindcss + autoprefixer
├── vercel.json                    Vite framework, dist output, api/game.js maxDuration 300
├── .env.example / .env.local      frontend build-time VITE_* settings (gitignored except example)
├── .gitignore                     ignores node_modules, dist, .env*, and _plans/_docs/_runbooks/_tmp
│
├── src/                           FRONTEND (browser only)
│   ├── main.jsx                   React StrictMode root
│   ├── App.jsx                    hash routing (#/game/<CODE>), landing page, car color picker
│   ├── index.css                  Tailwind directives + global resets only
│   └── features/car-game/
│       ├── CarGame.jsx            composition root: overlays, pause, HUD wiring, copy link
│       ├── GameCanvas.jsx         the single rAF loop, camera, DPR canvas, effects
│       ├── components/
│       │   ├── GameHUD.jsx        speed, connection status, room/ready/timer controls
│       │   ├── PlayerList.jsx     roster with color swatches and IT/RDY/YOU badges
│       │   ├── GameControls.jsx   desktop keyboard legend
│       │   ├── TouchControls.jsx  mobile pointer buttons
│       │   ├── ChatPanel.jsx      room chat panel, message list and input
│       │   ├── VoiceControls.jsx  join/mute controls and voice errors
│       │   ├── NameField.jsx      name input + Random button
│       │   └── NameGate.jsx       name prompt for direct share links
│       ├── hooks/
│       │   ├── useKeyboard.js     key state in a ref; blur/visibility cleanup
│       │   ├── useMultiplayer.js  socket lifecycle, roster, reconnect, chat, send helpers
│       │   └── useVoice.js        WebRTC mesh: mic, peers, signaling, cleanup
│       └── game/                  PURE, DOM-light logic (unit-tested directly by Node)
│           ├── chat.js            client chat input normalization
│           ├── player-name.js     random name + name normalization
│           ├── voice-config.js    build-time STUN configuration
│           ├── constants.js       WORLD, PHYSICS, NETWORK, speed display factor, color hexes
│           ├── world.js           seeded city generation, spawn points, clamping helpers
│           ├── physics.js         vehicle integration, collisions, speed display
│           ├── input.js           key -> action mapping, drive axis derivation
│           ├── interpolation.js   remote snapshot buffers and sampling
│           ├── renderer.js        Canvas drawing; static city pre-render; cars, lighting, HUD labels
│           ├── room-id.js         six-char room code generation/normalization + share URL
│           ├── car-colors.js      palette, normalization, localStorage persistence
│           └── socket-config.js   reads import.meta.env VITE_* into a socket config object
│
├── server/                        BACKEND (standalone deployable; separate package.json)
│   ├── package.json               Express 5, Socket.IO 4, dotenv; node >=20; own test script
│   ├── Dockerfile                 node:22-alpine; installs prod deps only; EXPOSE 3001
│   ├── .env.example / .env        server config (gitignored except example)
│   ├── src/
│   │   ├── index.js               standalone entry; listen(config.port); SIGINT/SIGTERM shutdown
│   │   ├── create-game-server.js  shared factory: Express app + Socket.IO + rooms + 20 Hz tick
│   │   ├── config.js              env parsing + clamps for all tuning values
│   │   ├── chat.js                PURE chat validation (length, single line)
│   │   ├── voice.js               PURE voice state/signal validation
│   │   ├── rooms.js               RoomManager/Room; room id rules; per-room state containers
│   │   ├── players.js             palette (duplicated), generated names, spawn slots, PlayerStore
│   │   ├── tag.js                 PURE tag rules: contact, cooldown, reassignment
│   │   ├── round.js               PURE round rules: ready, timer, standings, winner
│   │   └── validation.js          PURE movement validation + rate limiter + server bounds
│   └── test/                      node:test suites for players/rooms/round/tag/validation
│
├── api/game.js                    Vercel Function default export = httpServer from factory
│                                  socketPath '/api/game', healthPath '/api/game'
├── tests/                         node:test suites for frontend game modules + live room/chat/voice integration
│
├── .github/workflows/deploy.yml   GitHub Pages build/deploy on push to main
├── _plans/ _docs/ _runbooks/ _tmp/ scratch folders (gitignored; not deliverables)
└── dist/                          generated build output (gitignored)
```

### Deliberate duplication (keep in sync)

The server is intentionally deployable on its own, so it **must not import frontend modules**.
Four pairs of values are duplicated. Change both sides together and add/update a test:

| Frontend | Server | Rule |
| --- | --- | --- |
| `src/features/car-game/game/constants.js` (`WORLD`, `PHYSICS`) | `server/src/validation.js` (`SERVER_BOUNDS`) | world size, car radius, speed caps |
| `src/features/car-game/game/room-id.js` (`ROOM_ID_ALPHABET`, pattern) | `server/src/rooms.js` (same exports) | six chars, no `0/O`, `1/I` |
| `src/features/car-game/game/car-colors.js` (`CAR_COLORS`) | `server/src/players.js` (`CAR_COLORS`) | exact hex values and ids |
| `src/features/car-game/game/world.js` (`getSpawnPoints`) | `server/src/players.js` (`spawnFor`) | spawn positions on the central road |
| `src/features/car-game/game/chat.js` (`CHAT_MAX_LENGTH`) | `server/src/chat.js` (`CHAT_MAX_LENGTH`) | 240-character chat limit |
| `src/features/car-game/game/player-name.js` (`PLAYER_NAME_MAX_LENGTH`) | `server/src/players.js` (same export) | 24-character single-line names |

Network timing is mirrored too: `NETWORK.sendIntervalMs = 50`, `NETWORK.serverTickMs = 50`,
`config.tickMs = 50`. The city seed (`createWorld(seed = 20261127)`) is client-only; the server
never sends map data.

---

## 3. Technology stack and key dependencies

| Layer | Stack |
| --- | --- |
| Language | JavaScript + JSX only. **No TypeScript**, no `tsconfig`, no type-check step. |
| Frontend | React 19.2 (`react`, `react-dom`), Vite 8, `@vitejs/plugin-react` 6 |
| Styling | Tailwind CSS 3.4 + PostCSS + Autoprefixer; dark theme via `class="dark"` |
| Rendering | Native HTML Canvas 2D, inside a single `requestAnimationFrame` loop |
| Realtime | `socket.io` 4.8 server + `socket.io-client` 4.8 client |
| Backend | Express 5.1, Node `http`, `dotenv` 16; in-memory `Map` state |
| Tests | Node built-in `node:test` + `node:assert/strict` — **no Jest/Vitest/chai** |
| Node | `"type": "module"` everywhere; server `engines.node >= 20`; CI uses Node 22; local dev verified on Node 24 |

Root `package.json` also declares `express`, `socket.io`, and `dotenv` because Vercel installs
root dependencies for Functions; `server/package.json` keeps an independent copy for standalone
deploys. Do not remove either set without checking both deployment paths.

Useful scripts (from root unless noted):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run server` | Standalone game server at `http://localhost:3001` (`GET /health`) |
| `npm run build` / `npm run preview` | Production build into `dist/` / preview at `:4173` |
| `npm test` | 43 frontend/node:test suites (`tests/*.test.js`) |
| `npm run test:server` | 43 server suites (`server/test/*.test.js`) |
| `npm run test:all` | both suites (86 tests total at time of writing) |
| `cd server && npm run dev` | server with `--watch` auto-restart |

---

## 4. Coding standards and best practices

### Style (inferred from the existing code)

- **Single quotes**, **no semicolons**, **two-space indentation**, trailing commas in multiline
  literals/imports. Match the surrounding file when in doubt.
- Prefer `const`; use `let` only for values that are reassigned (counters, positions, timers).
- Prefer arrow functions for callbacks and default-exported React components; server pure
  modules use named `export function` declarations.
- Named exports for pure/utility modules; one default export per React component file.
- Small helpers that are used only inside one component stay in that same file
  (`Overlay`, `Spinner`, `Key`, `TouchButton`, `ColorPicker`, `Landing`).
- Constant tables are wrapped in `Object.freeze`.
- Comments explain **why**, not what — especially performance invariants, duplicated values,
  and protocol quirks. Existing comments often say "keep X in sync with Y"; preserve them.

### React conventions

- Function components and hooks only; no class components.
- Props are destructured in the signature. Derived values (`isIt`, `phase`, `winnerNames`,
  `controlsEnabled`) are computed inline, not stored in state.
- `App.jsx` owns hash routing and car color; `CarGame.jsx` is remounted per room via
  `key={roomId}` so a new room fully resets UI state.
- Effects clean up after themselves: remove listeners, clear timers, `disconnect()` sockets,
  `disconnect()` the ResizeObserver. The `useMultiplayer` effect uses a `disposed` flag to
  ignore late events.
- Callbacks passed into hot paths are wrapped in `useCallback`; refs are updated in tiny
  effects (`pausedRef`, `sendMoveRef`, `hudRef`, `tagFlashRef`) so the rAF effect does not
  re-subscribe on every parent render.

### Styling conventions

- All UI is Tailwind utility classes inline in JSX; there are no CSS modules or styled
  components. `src/index.css` contains only Tailwind directives and global resets
  (`canvas { touch-action: none }`, dark color scheme, selection color).
- Visual language: `slate-950`/`#0b1120` dark base, cyan/emerald/violet/fuchsia/amber/rose
  neon accents, `font-mono` for HUD/technical labels, `backdrop-blur-md` translucent panels.
- Dynamic colors (car swatches, glow shadows) use inline `style` with values from the palette;
  do not hardcode new colors in JSX when a palette value exists.
- Accessibility: buttons have `aria-label`/`aria-pressed`, canvas has an `aria-label`, form
  inputs use labels and `aria-invalid`, touch buttons call `preventDefault()` and use pointer
  capture. Preserve these when refactoring UI.

### Performance invariants (do not regress)

- **High-frequency data lives in refs, never React state.** `playersRef` (Map of interpolation
  buffers), `inputRef`, `socketRef`, camera/skids/particles and the canvas context are refs.
  Network state is 20 Hz; HUD React updates are throttled to 5 Hz (`NETWORK.hudIntervalMs`).
- Avoid allocations in the render loop: `sampleState(..., out)` writes into a scratch object;
  skids/particles use in-place compaction (`compactLifetimes`) and hard caps (220/120).
- `dt` is clamped to 50 ms and the frame clock resets on `visibilitychange` so a backgrounded
  tab cannot simulate a huge step.
- Static city is pre-rendered once to an offscreen canvas (`createCityCanvas`) and blitted per
  frame. Do not move city drawing into the per-frame path.
- DPR is capped at 2. Off-screen cars/effects are culled before drawing.
- The server broadcasts one snapshot per room per tick, not one per incoming move.
- If you change a physics constant, verify `tests/physics.test.js` still passes and update
  `server/src/validation.js` bounds.

---

## 5. State management patterns

### Client (browser)

| State kind | Mechanism | Examples |
| --- | --- | --- |
| UI state only | React `useState` | `status`, `error`, `self`, `roster`, `playerCount`, `game`, `tagEvent`, `paused`, `hud`, `copied`, `route`, `carColor` |
| Hot-path mutable data | `useRef` | `playersRef`, `inputRef`, `socketRef`, `selfIdRef`, `ctxRef`, `cameraRef`, `skidsRef`, `particlesRef` |
| Latest callback without re-subscribing | refs updated in effects | `pausedRef`, `sendMoveRef`, `hudRef`, `tagFlashRef` |
| URL / navigation | `window.location.hash` + `hashchange` listener | `#/game`, `#/game/<CODE>` |
| Name choice | local draft in `Landing`/`NameGate`, committed in `App` | not persisted; cleared on returning home |
| Persistent preference | `localStorage` via `loadCarColor`/`saveCarColor` | key `neon-drive:car-color` |
| Chat history | React `useState` in `useMultiplayer`, capped at 50 | `chat`, `sendChat`; low-frequency, safe for React |
| WebRTC voice | refs in `useVoice`, no React state per frame | `localStreamRef`, `peersRef`, hidden `<audio>` elements |

Rules:

- Do not add a global store (Redux/Zustand/Context) for game data — it would put per-frame
  data into the React render cycle. Follow the existing ref + throttle pattern.
- `localStorage` access is wrapped in `try/catch` and guarded for non-browser environments so
  `node:test` can import these modules; keep that property.
- The URL code is the client's intent; the server's `game:init` `roomId` wins for the share link
  (`shareRoomId = activeRoomId || roomId`). Malformed codes get a fresh generated one.
- `self` is replaced only on init/disconnect; tag and ready updates are merged into it without
  recreating the local vehicle (`GameCanvas` resets local state only when `self.id` changes).

### Server (in memory)

- `RoomManager` holds a `Map<code, Room>`. Each `Room` owns a `PlayerStore`, `tagState`,
  `round`, `limiters`, `violations`, and `lastRoundSignature`.
- `config.js` parses and clamps all environment values once at startup into a frozen object.
- `publicPlayer`, `publicRoundState`, and `publicTagState` are the **only** shapes sent over the
  wire; never emit internal objects directly.
- `game:state` broadcasts are deduplicated by `roundSignature` and sent on transitions plus
  once per countdown second — not on every 20 Hz tick.
- Do not introduce a database or shared store without explicit approval; the documented design
  is single-instance in-memory state (and the Vercel multi-instance limitation is acknowledged).

---

## 6. API integration guidelines

There is **no REST API** except two health endpoints. Application integration is Socket.IO.

### Event protocol (must stay in sync across client, server, and README)

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `game:init` | server → client | `{ id, roomId, player, players, config: { maxPlayers, tickMs, world, tag, roundSeconds, minPlayers } }` | Emitted after the socket joins its room; `players` excludes self |
| `player:joined` | server → others | `Player` | Room-scoped |
| `player:move` | client → server | `{ x, y, angle, speed }` | ≤ 20 Hz (`NETWORK.sendIntervalMs = 50`); validated + clamped |
| `player:moved` | server → room | `{ players: Player[] }` | One 20 Hz tick broadcast per room |
| `player:left` | server → room | `{ id }` | On disconnect |
| `player:ready` | client → server | `{ ready?: boolean }` | Defaults to `true`; ignored while `phase === 'playing'` |
| `game:state` | server → room | `{ phase, roundSeconds, secondsLeft, endsAt, minPlayers, readyIds, winnerIds, standings }` | Transitions, joins, readiness, leaves, once per countdown second |
| `tag:hit` | server → room | `{ taggerId, taggedId, itId, reason, at, players: [{ id, isIt, tags }] }` | `reason` = `tag` or `reassign`; drives toasts and flashes |
| `game:error` | server → client | `{ code, message }` | `INVALID_PAYLOAD`, `INVALID_NUMBER`, `RATE_LIMITED` (silent drop), `INVALID_CHAT`, `SERVER_FULL`, `ROOM_UNAVAILABLE`, `GAME_IN_PROGRESS` |
| `chat:send` | client → server | `{ text }` | 1–240 chars, single line; 400 ms gap, max 3/s |
| `chat:message` | server → room | `{ id, playerId, name, color, text, at }` | Identity/timestamp server-owned; no history retained |
| `voice:state` | client → server | `{ enabled, muted }` | Opt in/out; only enabled drivers are participants |
| `voice:peers` | server → room | `{ peers: [{ id, muted }] }` | On join, state change and disconnect |
| `voice:offer` / `voice:answer` | client → server → target | `{ to, sdp }` | Relayed as `{ from, sdp }` only within a room to opted-in peers |
| `voice:ice` | client → server → target | `{ to, candidate }` | Relayed as `{ from, candidate }` under the same rules |

`Player` shape: `{ id, name, color, x, y, angle, speed, isIt, tags, ready }`. `angle` is
normalized to `[-π, π]`; `speed` is signed px/s. IDs and names are server-generated.

### Handshake

- Browser sockets pass `auth: { roomId, carColor, name }`; raw clients/health checks use
  `query: { room, carColor, name }`. The server reads `auth.roomId ?? query.room` and
  `auth.name ?? query.name`, then normalizes the name and makes duplicates unique per room.
- A name is chosen before connecting: on the landing page via `NameField` (type or **Random**),
  or on direct share links via `NameGate`. Create/Join stay disabled until a valid name exists.
  The name is deliberately not persisted.
- Missing/invalid room code creates a fresh room whose id is returned in `game:init`.
- A socket is refused with `GAME_IN_PROGRESS` and disconnected when `canJoinRound(room.round)` is
  false (phase `playing`). Joining a waiting or finished room remains allowed. The client keeps the
  error overlay visible, disables auto-retry for that rejection, and re-enables it on manual retry.
- `getSocketConfig()` in `src/features/car-game/game/socket-config.js` reads
  `VITE_GAME_SERVER_URL` (fallback: same origin in PROD, `http://localhost:3001` in dev),
  `VITE_GAME_SOCKET_PATH` (default `/socket.io`), and `VITE_GAME_TRANSPORTS` (default
  `websocket,polling`). On Vercel these must be `/api/game` and `websocket` because Vercel
  Functions only upgrade WebSockets.
- Every listener registered in `useMultiplayer` is removed in the effect cleanup; keep the
  `disposed` guard when adding events. Movement uses `socket.connected` checks in
  `sendMove`/`sendReady`.

### Validation and abuse limits (server-side)

- `validateMove` requires a plain object with four finite numbers, clamps coordinates to
  `SERVER_BOUNDS` and speed to ± caps, and normalizes angle.
- Per-socket `createRateLimiter`: minimum 40 ms between packets and at most 25/s. Rate-limited
  packets are dropped silently; five malformed packets disconnect the socket.
- Full room → `SERVER_FULL` + disconnect; room cap reached → `ROOM_UNAVAILABLE` + disconnect.
- Room isolation comes from `socket.join(room.id)` and `io.to(room.id)`; never broadcast to
  `io` globally for game events.

### When adding or changing an event

1. Update `server/src/create-game-server.js` (and the relevant pure module if it is game logic).
2. Update `src/features/car-game/hooks/useMultiplayer.js` and any consuming component.
3. Update the protocol table in `README.md` and add/adjust tests on both sides.
4. Re-check `api/game.js` path assumptions if the socket path or health path changes.

Health endpoints: standalone `GET /health` returns `{ status, players, rooms, roomIds,
uptimeSeconds }`; on Vercel the same handler is served at `GET /api/game` (the exact function
route — `/api/game/health` is **not** routed).

---

## 7. Authentication and authorization flow

**There is no authentication system.** Do not invent one without a design discussion.

- No accounts, passwords, tokens, JWTs, sessions, cookies, or OAuth. No user identity persists
  across page reloads. A driver name is chosen per visit and sent in the handshake; it is never
  stored and duplicates are suffixed by the server.
- A "player" is created per socket connection in `PlayerStore.add`: id = `socket.id`, name from
  the handshake (normalized, duplicates suffixed) or generated from adjective/noun/number lists,
  color from the handshake or a distinct default.
- A room code functions as a shareable capability link, not a secret. Anyone with the code can
  join; there is no password, host role, or kick control.
- Authorization is limited to structural rules enforced by the server:
  - A socket can only update/ready **its own** player (handlers use `socket.id`).
  - Tag and round state are server-authoritative; client-supplied `isIt`, `tags`, `readyIds`,
    `winnerIds`, or `id` are never accepted from payloads.
  - CORS is restricted to the comma-separated `CLIENT_ORIGINS` allowlist (explicit origins,
    no wildcards) with methods `GET`/`POST`.
  - Rate limiting and malformed-packet disconnects are the only abuse controls.
- Configuration hygiene: `VITE_*` values are public and embedded in the client bundle — never
  put secrets there. Backend-only values belong in `server/.env` / Vercel server env vars.
  `.env` files are gitignored; only `.env.example` files are committed.
- Chat and voice inherit the same openness: anyone with the code can read/send messages and join
  voice. There is no moderation, blocking, or recording. Chat text is escaped by React on display;
  voice media is encrypted by WebRTC and never relayed as audio by the server.
- `VITE_VOICE_STUN_URL` is public build-time config. TURN credentials must never go in `VITE_*`.
- If a task asks for "login", "users", or "protected rooms", treat it as a new feature with
  protocol, persistence, and deployment implications — ask the user for scope first.

---

## 8. Testing conventions

- Framework: built-in `node:test` with `node:assert/strict`. No test runner config, no
  snapshots, no mocking library.
- Frontend tests (`tests/`) import pure modules from `src/.../game/` directly under Node.
  They never mount React components; `GameCanvas`, hooks, and JSX are **not** unit-tested.
- Server tests (`server/test/`) import pure server modules directly. The one integration test,
  `tests/rooms-integration.test.js`, starts the real server on an ephemeral port (`listen(0)`),
  connects real `socket.io-client` sockets, and tears everything down in `after()`.
- Test style: `test('descriptive behavior', () => { ... })`, deterministic fixtures, helper
  builders (`drive`, `simulate`, `driver`, `once`, `sleep`), explicit assertions. Global shims
  (e.g. `globalThis.window` in `room-id.test.js`) must be cleaned up in `finally`.
- Add or update tests whenever you change pure logic, protocol payloads, or duplicated
  constants. Prefer extending the relevant existing suite over creating a new framework.
- Verify with:
  ```bash
  npm run test:all        # 43 frontend + 43 server tests
  npm run build           # production build must succeed
  ```
- Manual verification lives in `_tmp/*.mjs` scratch Playwright scripts (two isolated browser
  contexts, tag checks, reconnect checks, Vercel-function emulation). They are gitignored,
  require local browser paths, and are **not** part of automated CI — run them only on request.
- The manual checklist in `README.md` §7 is the reference for full end-to-end verification.

---

## 9. Development workflow

1. **Setup (first run):** `npm install`; `cd server && npm install`; copy `.env.example →
   .env.local` and `server/.env.example → server/.env` (both already exist locally; never
   commit them).
2. **Run locally in two terminals:** `npm run server` and `npm run dev`. Open
   `http://localhost:5173/#/game`, click **Create a room**, then **Copy link** and open it in a
   second window to test multiplayer.
3. **Make changes inside the existing module boundaries.** Keep frontend modules free of
   server imports and keep `server/src` free of browser APIs (`document`, `window`,
   `import.meta.env`) so it stays deployable standalone and importable by Node tests.
4. **Verify before reporting done:** `npm run test:all` and `npm run build`. For server changes
   also hit `curl http://localhost:3001/health`; for protocol/UI changes do a two-window smoke
   test.
5. **Scratch vs deliverable:** agent-created plans go in `_plans/`, documentation drafts in
   `_docs/`, investigation notes in `_runbooks/`, probes/dumps/scripts/screenshots in `_tmp/`.
   All four are gitignored. Promote a scratch file to a real location only with explicit user
   approval. Do not commit anything under an underscored folder.
6. **Git:** work on `main` unless asked to branch; existing commit subjects are short lowercase
   summaries (e.g. `rooms added`, `timer added`). Keep diffs focused and avoid unrelated churn.
7. **Deployment:**
   - Vercel: `vercel.json` drives the Vite build; set `VITE_GAME_SOCKET_PATH=/api/game`,
     `VITE_GAME_TRANSPORTS=websocket`, `CLIENT_ORIGINS`, and optionally `VITE_GAME_SERVER_URL`
     (empty = same origin). Fluid Compute must be enabled. Rooms are per-instance in memory;
     two players on different instances will not see each other (documented limitation).
   - GitHub Pages: push to `main`; `.github/workflows/deploy.yml` requires the repository
     variable `VITE_GAME_SERVER_URL` and builds with relative base `./` + hash routing.
   - Standalone: `npm start` from `server/` or build `server/Dockerfile`; set `CLIENT_ORIGINS`
     and let the platform inject `PORT`.
   - Never deploy or change production configuration without explicit user confirmation.

---

## 10. Agent responsibilities and boundaries

### You are expected to

- Infer conventions from nearby code before writing; keep style and structure consistent.
- Keep game logic pure and testable; keep React state minimal and the render loop allocation-free.
- Preserve the deliberate frontend/server duplication and update both sides in the same change.
- Preserve hash routing, relative Vite base, and the exact `/api/game` path assumptions.
- Update `README.md` when behavior, protocol, env vars, or deployment steps change.
- Run the full test suite and build before declaring a task complete; report what you verified.
- Ask when a requested change could break protocol compatibility with existing clients.

### Do not do without explicit approval

- Introduce TypeScript, a state-management library, a component test framework, or new runtime
  dependencies.
- Change the Socket.IO event names/payloads, socket path, room-code format, or world dimensions
  unilaterally — these are cross-cutting and deployment-sensitive.
- Add authentication, persistence, databases, or shared cross-instance state.
- Add TURN credentials, an SFU, or a managed voice provider — voice is deliberately a public-STUN
  WebRTC mesh in this project; changing that needs a new service and approval.
- Add persistent chat history or moderation features without agreement on storage and policy.
- Import server code into the browser bundle or browser APIs into `server/src`.
- Move per-frame data into React state or add React renders inside the rAF loop.
- Change the world seed or physics constants without checking tests, server bounds, and spawns.
- Write secrets to `VITE_*` variables or commit `.env` files.
- Promote scratch files from `_plans/`/`_docs/`/`_runbooks/`/`_tmp/` to tracked paths, or deploy.
- Rewrite large unrelated sections, delete user files, or change `dist/`/`node_modules/` by hand.

### Known limitations to respect (not bugs to silently "fix")

- Physics is client-side; the server clamps kinematics but is not authoritative for movement,
  so a modified client can teleport within bounds or clip through buildings. Tag state *is*
  authoritative.
- Cars do not collide with each other (tag uses proximity); remote cars have no drift flag.
- In-memory state means restarts clear rooms; on Vercel rooms are isolated per function
  instance and sockets close at the 300 s function duration (the client reconnects).
- Rooms are open to anyone with the code; spawn slots repeat after 12 players.
- A driver who disconnects mid-round cannot rejoin until that round ends, because reconnecting is
  a new join and the server refuses newcomers while `phase === 'playing'`.
- Chat is in-memory only (50-message client cap, nothing retained server-side), and voice is a
  full mesh that does not scale to large rooms. Public STUN alone cannot connect some NAT setups;
  the mic button is required before audio starts and browsers require HTTPS/localhost for it.

---

## 11. Recommended prompts and instructions for AI agents

### Start-of-task checklist (use this verbatim as needed)

> Read `AGENTS.md`, `README.md` §1 and §4, and the relevant files in `src/features/car-game/`
> and/or `server/src/` before changing code. Identify which of the deliberate duplicated values
> (world bounds, room-code rules, car palette, spawn points) this task touches. State your plan,
> then implement the smallest change that fits the existing module boundaries. Finish by running
> `npm run test:all` and `npm run build` and report the results. Update `README.md` if behavior,
> protocol, or configuration changed.

### Good task prompts

- **Add a game feature:** "Add [feature] to Neon Drive. Keep physics/input/interpolation pure and
  unit-testable, keep hot-path data in refs, and do not add React state in the render loop.
  Update `README.md` controls/protocol if needed and add tests."
- **Fix a bug:** "Diagnose [symptom] starting from [component/module]. Preserve the existing
  protocol and room isolation. Add a regression test in the matching suite and verify with
  `npm run test:all` and a two-window local smoke test."
- **Change the protocol:** "We need to add/change a Socket.IO event. List every affected location
  (`create-game-server.js`, `useMultiplayer.js`, consumers, README §4, both test suites,
  `api/game.js` path assumptions) before editing, then implement them together."
- **Chat/voice changes:** "Update room chat or WebRTC voice while keeping chat ephemeral, the
  server as signaling-only for voice, and all media/mic state in refs. Mirror the 240-character
  limit across both `chat.js` files, keep signaling relay room-scoped to opted-in peers, and add
  tests to `server/test/{chat,voice}.test.js` and `tests/rooms-integration.test.js`."
- **Touch duplicated constants:** "This change affects [bounds/codes/colors/spawns]. Update both
  the frontend and server copies, run the cross-side test (`tests/room-id.test.js` or the color
  tests), and confirm no other sync points were missed."
- **Documentation only:** "Update documentation to match current code. Do not change runtime
  behavior. If the file belongs to planning/drafting, write it to the matching `_` scratch folder
  unless I explicitly ask you to promote it."

### Definition of done

- Code matches existing style and module boundaries; no new dependencies or frameworks.
- All duplicated constants remain in sync and their cross-side tests pass.
- Socket.IO payloads match on both sides and are documented if changed.
- `npm run test:all` passes and `npm run build` succeeds.
- No secrets, no generated artifacts, and no scratch folders are staged for commit.
- Report of what changed, what was verified, and any known limitation introduced.
