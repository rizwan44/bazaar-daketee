# 52 Card Games Platform

A production-grade, real-time, mobile-first online card game platform built around a
standard 52-card deck. This repo is being built in phases — see [Roadmap](#roadmap).

## Architecture

npm workspaces monorepo:

- **`/shared`** — pure TypeScript, no framework dependencies. The card engine
  (`DeckEngine`, `Card` types), the common `GameEngine` interface every per-game rule
  module will implement, and the single-source-of-truth catalog of all 52 games.
- **`/server`** — Node.js + Express (REST) + Socket.IO (WebSocket) + Prisma/MySQL.
  Server-authoritative: the client never shuffles, deals, or decides a winner — it only
  requests actions, and the server validates and broadcasts state.
- **`/client`** — React + TypeScript + Vite, Tailwind CSS, Framer Motion, Zustand,
  React Router, installable as a PWA. Mobile-first (360px and up), dark theme by default.

## Prerequisites

- Node.js 18+ (tested on 20.x)
- A running MySQL server you can create a database on

## Setup

```bash
npm install
```

This installs all three workspaces (`shared`, `server`, `client`) in one pass.

### Server environment

`server/.env` already exists with local dev defaults (gitignored). Edit
`DATABASE_URL` to match your MySQL instance:

```
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/card_games"
```

If you're on XAMPP, its bundled MySQL/MariaDB defaults to `root` with no password:
`mysql://root:@localhost:3306/card_games`.

Create the database itself first (Prisma migrate will create tables, not the database):

```sql
CREATE DATABASE card_games;
```

### Apply the schema and seed the games catalog

```bash
npm run prisma:migrate --workspace=server -- --name init
npm run prisma:seed --workspace=server
```

The seed populates the `games` table with all 52 games from
`shared/src/games/catalog.ts` (all currently `isImplemented: false` — this flips per
game as its rules module ships).

## Running in development

Two terminals:

```bash
npm run dev:server   # http://localhost:4790
npm run dev:client   # http://localhost:5173
```

Open http://localhost:5173. You should see:

- Bottom navigation (Home / Games / Friends / Profile) — all four tabs are real routes
- `/games` listing all 52 games — Teen Patti is playable now, the rest still show
  "Coming Soon"
- `/demo` — a live shuffle / deal / flip animation using the real `DeckEngine`
- Settings → theme toggle (dark/light, persisted) and language switch (English / Urdu /
  Roman Urdu — proves the i18n scaffold, not a full translation yet)
- A small status dot on the Home screen showing the live WebSocket connection to the
  server (green once the `ping`/`pong` round-trip succeeds)
- Home → "Play with Friends" → **Create Room** / **Join Room**: a real, working room
  lobby — share the 6-character code, players ready up, the host starts once everyone's
  ready. Dropped connections show "Reconnecting…" and automatically restore the same seat.
- Inside a room, "Host on this device (LAN)" shows a QR code a friend's phone can scan
  on the same WiFi to join with **no internet required** — see [network-info](server/src/rest/network.ts).
- Home → "Solo Games" → **Play vs AI**: pick a game, an AI difficulty (Easy/Normal/Hard/
  Expert) and personality (Friendly/Aggressive/Defensive/Smart/Funny) — it creates a room
  and fills the remaining seats with AI automatically.
- Starting a **Teen Patti** room (3-6 players, human or AI) now hands off to a real table:
  boot/pot/blind-seen betting with correct chaal/raise amounts, a 20s turn timer, hidden
  hands (you only ever receive your own cards over the wire), AI opponents that actually
  play using `AIController` + a Teen Patti-specific `MoveScorer`, and a winner/coin
  settlement screen backed by real `Profile.coins` updates.
- Starting a **4 Card** room hands off to its own real table, in any of three modes
  chosen at room creation (**2 Players**, **4 Players — Individual**, **4 Players — Team
  2v2**): real drag-and-drop capture (no tap-to-select, no highlighting — the game never
  hints at a legal move, you find it yourself by observing the table and every visible
  stack), rank-only **group captures** (dragging onto a stack's top card captures the
  *whole* contiguous same-rank run sitting there, not just the one card touched), 🔒
  locks, own-active-stack matching, **matching is always optional — never mandatory**
  (a legal capture never forces itself on you; you can always discard a different card
  instead), **no turn timer at all** (a turn stays open indefinitely), and an emptied
  draw pile doesn't end the game early — a final-resolution phase keeps the hand/table/
  stacks fully interactive (only the Draw action itself disables) until every hand is
  genuinely empty. A physical-looking draw pile with a live count replaces a plain
  number, card moves (draw, capture, discard) animate into place instead of teleporting,
  and the opening deal reveals in a brief staggered animation rather than popping in
  instantly — all reactive to confirmed server state only, never predicted client-side.
  Short synthesized sound cues (draw/capture/discard/deal/turn-change/game-end/win) play
  via Web Audio, gated by Settings → Sound Effects. A shuffler is exempt from the first
  turn (whoever lost the previous game in that room — random for a room's first game, or
  among the two losing teammates in team mode), and a room keeps a persistent in-room
  game history across rematches: either player can request a rematch, everyone still
  seated must accept before the next game auto-starts, and declining leaves the room.
  Every move is logged to the `GameMove` table for replay/anti-cheat (this logging is
  generic — `GameSessionManager` does it for every game, Teen Patti included). Team mode
  shares one captured-stack/score between teammates while keeping each teammate's own
  hand private even from their partner. No coin economy — nothing here touches
  `Profile.coins`.
  `GameSessionManager` runs every game through one shared, game-agnostic turn loop plus a
  small per-game `GameAdapter` (player setup, wire view, settlement, and whether a turn
  timer applies at all) — see `server/src/game/adapters`. Every other catalog game still
  hands off to a `GameSessionPlaceholder` until its rules ship.

## Testing

```bash
npm test
```

Runs `DeckEngine` (52 unique cards, deterministic seeded shuffle, dealing,
draw/remove/return consistency, ownership validation), `AIController` (difficulty-driven
move selection, personality variance, thinking-delay bounds), Teen Patti's `handRanking`
(every category vs. every other, tie-breaks, A-2-3 as the highest run), `TeenPattiEngine`
(dealing, blind/seen betting math, turn rotation, fold/show resolution) and its AI
`aiScorer`, 4 Card's `scoring` (the 400-point invariant), `FourCardEngine` across all
three modes (rank-only matching, **group captures** — the whole contiguous same-rank run
at the top of a stack transfers together, not just the touched card — lock detection,
own-active-stack matching, matching-is-always-optional (never mandatory — a legal capture
and every discard are offered together, the player chooses freely), the
shuffler-skips-first-turn rule, an emptied draw pile entering a final-resolution phase
instead of ending the game (anyone with cards left keeps a real turn until every hand is
truly empty), per-player vs. shared-per-team "collector" state, 4-player-individual
keeping every collection fully separate, team-mode collections merging across both
teammates' captures, game-end scoring) and its AI `aiScorer` (capture-over-discard,
stack-over-table, group-size and lock-completing priority), `fourCardAdapter`'s wire-view
building (a teammate's hand is never sent, no hint/valid-moves data is ever sent to a
human), `RoomManager` (codes, seating, start validation, disconnect/reconnect, AI seat
filling, mode-aware min/max player resolution, the request/accept-or-decline rematch flow
with persistent in-room game history, and the next game's shuffler always being the
previous loser), `GameSessionManager` (turn order, per-game-optional timer-driven auto-play
fallback, AI auto-play, generic move-history logging, and — for both Teen Patti and 4
Card via their respective `GameAdapter`s — end-of-game settlement: coin deltas for Teen
Patti, plain score/placement for 4 Card), and a server smoke test for `GET /api/health`
and the 404 fallback.

## Folder structure

```
/shared/src/card-engine        Card, DeckEngine (shuffle/deal/draw/discard/played, RNG-injected)
/shared/src/games               GameEngine interface + catalog + engine registry
/shared/src/games/teen-patti    Hand ranking, TeenPattiEngine, AI move scorer, wire DTOs
/shared/src/games/four-card     FourCardEngine (capture/stack/lock rules), scoring, AI move scorer, wire DTOs
/shared/src/ai                  AIController (difficulty/personality-driven move picking) + thinking delay
/shared/src/realtime             Socket.IO event names + client->server payload types
/server/prisma                    schema.prisma (full DB schema) + seed.ts
/server/src/rooms                 RoomManager (room lifecycle incl. AI seats) + Prisma persistence adapter
/server/src/game                  GameSessionManager (generic live turn loop, shared across games) + Prisma persistence adapter
/server/src/game/adapters         Per-game GameAdapter: player setup, wire view, settlement (Teen Patti coins, 4 Card score)
/server/src/websocket              Socket.IO gateway, identity (guest sessions), room + game event handlers
/server/src                        Express app, REST routes, config
/client/src/components            PlayingCard, CardFan, AppShell, BottomNav, room QrCode, game/*
/client/src/screens               Lobby, GamesList, Friends, Profile, Settings, Demo, Room/*, Solo, Game/*, Play
/client/src/locales                en.json / ur.json / roman-ur.json
```

## Roadmap

1. ✅ Card engine, DB schema, UI shell
2. ✅ Multiplayer room engine — create/join/ready/start, disconnect/reconnect,
   guest identity with session tokens, and **online + LAN/local-network hosting for
   offline-of-internet play with friends on the same WiFi**
3. ✅ Solo AI framework — difficulty/personality-driven `AIController`, human-like
   thinking delay, and real AI seats in a room (solo = a room the AI fills)
4. ✅ Teen Patti — the first fully playable game: server-authoritative betting rules,
   hidden-hand security, real AI opponents, coin economy
5. ✅ 4 Card (Chaar Patti) — rules engine verified against the spec's own worked
   example, then a full rules-and-UI overhaul into three modes (2 players, 4-player
   individual, 4-player team 2v2), real drag-and-drop capture with zero hints, the
   group-capture rule (a stack's whole contiguous same-rank run transfers together),
   own-active-stack matching, matching that's always optional (never mandatory), no turn
   timer, a final-resolution phase so an emptied draw pile never freezes the game, an
   animated draw-pile visual with card-movement animations and a staggered opening deal,
   synthesized sound cues, a loser-shuffles-next rule with a request/accept-or-decline
   rematch flow and persistent in-room game history, and generic per-move history
   logging. `GameSessionManager` is game-agnostic, driven per-game by a `GameAdapter`
   (`server/src/game/adapters`)
6. Rummy, Call Break, Spades, Hearts — plus a multiplayer/reconnect/security test pass
7. Remaining games, one at a time
