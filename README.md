# Maze Game

A browser-based, turn-based multiplayer quiz game. Players take turns rolling a die and moving through a maze from the bottom-left corner to the top-right one. Landing on a flag opens a timed multiple-choice question: a correct answer earns points and extra steps, a wrong one ends the turn.

It's a client–server application written in TypeScript. The browser client uses no UI framework (plain DOM and `<canvas>`) and is built with Vite. A Node.js server keeps the lobby, game rooms and shared game state in SQLite and talks to the browsers over WebSockets. The quiz questions are in Serbian (Cyrillic); the interface is available in English and Serbian.

## Features

- **Online multiplayer:** up to 6 players per room. Create a room or join one from the lobby, mark yourself ready, and the game starts when everyone is.
- **Shared game:** all players see the same maze, moves, dice rolls and questions. Only the player whose turn it is can roll, move and answer; the others watch.
- **Maze:** a new braided maze (with loops, no dead ends) every game, with question flags of four types.
- **3D dice** with physics, and timed questions with shuffled answers.
- **Scoring:** a correct answer gives +2 points and +3 steps; a wrong answer or a timeout ends the turn. The first player to reach the finish ends the game, and the highest score wins.
- **Three visual themes** for the game screen (Garden Board, Neon Night, Candy Pop).
- **Sounds**, with groups that can be muted.
- **Two languages** (English, Serbian), switchable on every screen.
- **Connection tracking:** players who close their tab or lose their connection for more than 10 seconds are removed from their room and game, and empty rooms are deleted. A shorter drop reconnects automatically.

## Getting started

Requirements: [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev:server   # game server on http://localhost:3000 (terminal 1)
npm run dev          # Vite dev server with hot reload (terminal 2)
```

Open the address Vite prints (usually http://localhost:5173). Vite forwards the WebSocket (`/ws`) to the game server. To try multiplayer on one computer, open the game in two browser tabs and log in with a different name in each.

The lobby also has two practice rooms, **Alpha Room** and **Beta Room**. Their players are fake and always ready, so you can start a game from a single tab; you play the fake players' turns yourself.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks the client and server, then builds the client into `dist/` |
| `npm start` | Runs the server in production mode: it serves `dist/` and the WebSocket on one port |
| `npx tsc` | Type-check only |

## Running in production

```bash
npm ci
npm run build
npm start
```

The server listens on `PORT` (default 3000) and serves the built client from `dist/` plus the WebSocket at `/ws`, so the page and the server share one address. Put it behind a reverse proxy (nginx, Caddy) that terminates HTTPS and forwards WebSocket upgrades; the client uses `wss://` automatically when the page is on HTTPS.

It needs a host that runs a long-lived Node process with a writable disk for the SQLite file, for example a VPS, Fly.io, Railway or Render with a persistent volume. Static hosts and serverless platforms (GitHub Pages, Vercel, Netlify) can't run it.

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket port |
| `DB_FILE` | `data/mazegame.sqlite` | SQLite database file (the folder is created if needed) |
| `ALLOWED_ORIGINS` | *(none)* | Extra page origins allowed to open a WebSocket, comma separated. The server's own host and `localhost` are always allowed. |

## How the server works

- Each browser tab opens one WebSocket and logs in with a name. The server gives it a user id and a secret token. Every tab is a separate player.
- The server is the only one that writes the data, and it checks every request: at most 6 players per room, one room per user, a game can't be joined after it started, and only the player whose turn it is (or the first real player, who plays the fake players' turns and removes players who left) can save the game.
- **Presence** is the connection itself. A closed tab closes its socket; a ping every 15 seconds catches connections that died without closing. The server then waits 10 seconds: if the tab reconnects with its token in that time, it continues as the same player. Otherwise it's removed from its room.
- When the server restarts, all connections are gone, so it empties all rooms and resets the practice rooms.

### Data layout (SQLite)

| Table | Contents |
| --- | --- |
| `users` | Name, token, online/offline, current room |
| `rooms` | Room name, status (waiting/started), host, the id of its game |
| `room_players` | Who is in each room and whether they are ready |
| `games` | The running game: maze, player positions, steps, scores, whose turn it is, the current question |

## How to play

1. Enter a name and go to the lobby.
2. Create a room or join one, then click **Set Ready**. The game starts when every player in the room is ready.
3. On your turn, click the die or press **Space** to roll. The number you roll is how many steps you can take.
4. Move with the **arrow keys** (or **W A S D**), or click a cell next to your player. You can't walk through walls.
5. If you land on a flag, answer the question before the timer runs out: click an answer or press **1–4**.
6. When you run out of steps, the turn passes to the next player. Reaching the top-right corner ends the game.

## Project structure

```
index.html              Page shell and fonts
server/
  index.ts              HTTP server (serves dist/), WebSockets, heartbeat, reconnects
  store.ts              Rooms, games and users: every rule is checked here
  db.ts                 SQLite (sqlite3 package) and the schema
src/
  index.ts              Router: login → lobby → room → game
  connection.ts         The WebSocket to the server: requests, subscriptions, reconnecting
  protocol.ts           Message and data types shared by the client and server
  game_setup.ts         Builds a new game (maze, players); used by the server
  login-screen.ts       Screens
  lobby-screen.ts
  game-room-screen.ts
  game.ts               Game screen, turn logic and syncing with the other players
  rooms.ts              Rooms: create, join, leave, ready
  games.ts              The shared game state
  maze_generator.ts     Maze generation
  render_maze.ts        Drawing the maze on the canvas
  dice-pop-up.ts        3D dice
  question-pop-up.ts    Question pop-up
  i18n.ts               Translations
  themes.ts             Game screen themes
  sounds.ts             Sound effects and muting
assets/
  data/                 Quiz questions (JSON)
  lang/                 Interface texts, one JSON file per language
  images/, sound/       Sprites, flag icons, sound effects
tools/question-editor/  Desktop editor for the question files
```

## Editing questions

The questions are in [`assets/data/`](assets/data), one JSON file per flag type (grammar, language, spelling, service). In each question, the **first answer is the correct one**; the game shuffles them before showing them.

You can edit the files by hand or with the included desktop editor (Python 3, no extra packages needed):

```bash
python tools/question-editor/question_editor.py assets/data/gramatika_qa.json
```

See the [question editor README](tools/question-editor/README.md) for details.

## Translating the interface

All interface text is in [`assets/lang/`](assets/lang): `en.json` and `sr.json`. Each file maps a key to a text, and `{name}`-style placeholders are filled in by the game. To add a language:

1. Copy `en.json` to a new file, for example `de.json`, and translate the texts.
2. Register it in [`src/i18n.ts`](src/i18n.ts): import the file, add it to `languages`, and add a `satisfies` line like the one for `sr` so a missing text fails the type check.

Texts that include a number have one entry per plural form (`.one`, `.few`, `.other`, as defined by `Intl.PluralRules` for the language).

## Current limitations

- There are no accounts: a name is enough to play, and it isn't kept after the tab closes.
- The server checks who may save the game, but not the moves themselves (dice values, walls, answers), so a modified client could cheat on its own turn.
- The Alpha and Beta practice rooms are always present in the lobby.
- If the player whose turn it is leaves, the turn passes to the next player only while at least one other player's game is open.
