# Maze Game

A browser-based, turn-based multiplayer quiz game. Players take turns rolling a die and moving through a maze from the bottom-left corner to the top-right one. Landing on a flag opens a timed multiple-choice question: a correct answer earns points and extra steps, a wrong one ends the turn.

It's a client–server application written in TypeScript. The browser client uses no UI framework (plain DOM and `<canvas>`) and is built with Vite. A Node.js server keeps the lobby, game rooms and shared game state in a SQLite database (Turso in production) and talks to the browsers over WebSockets. The client is hosted on Vercel, the server on Railway. The quiz questions are in Serbian (Cyrillic); the interface is available in English and Serbian.

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

Requirements: [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended).

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

## Deployment

Three services, each on a free or hobby plan:

| Part | Host | What it runs |
| --- | --- | --- |
| Client | **Vercel** | The built static site (`dist/`) |
| Server | **Railway** | `npm start`: the Node WebSocket server |
| Database | **Turso** | SQLite in the cloud (libSQL) |

The browser loads the page from Vercel and opens a WebSocket straight to Railway. Only the server talks to Turso, so the database token never reaches the browser.

Set them up in this order, because each step needs an address from the one before.

### 1. Turso (database)

1. Sign up at [turso.tech](https://turso.tech) and install the CLI (or use the web dashboard).
2. Create a database, in the region closest to where Railway will run:
   ```bash
   turso auth login
   turso db create mazegame
   turso db show mazegame --url        # libsql://mazegame-<org>.turso.io
   turso db tokens create mazegame     # the auth token
   ```
3. Keep the URL and the token for step 2. The server creates the tables itself on its first start.

### 2. Railway (server)

1. At [railway.com](https://railway.com), create a project → **Deploy from GitHub repo** → this repository, and pick the `vercel_turso_railway` branch (service **Settings → Source**).
2. [`railway.json`](railway.json) sets the build (`npx tsc`), the start command (`npm start`), the health check (`/health`) and **1 replica**. Keep it at one: connections and the request queue live in the server's memory.
3. Under **Variables**, add:
   - `TURSO_DATABASE_URL` = the `libsql://…` URL
   - `TURSO_AUTH_TOKEN` = the token
   - `ALLOWED_ORIGINS` = your Vercel address(es), e.g. `https://mazegame.vercel.app,https://mazegame-*.vercel.app` (the second one allows Vercel's preview deployments; you can fill this in after step 3)

   Railway sets `PORT` itself.
4. Under **Settings → Networking**, click **Generate Domain**. You get something like `mazegame-production.up.railway.app`. Check that `https://<that domain>/health` answers `ok`.

### 3. Vercel (client)

1. At [vercel.com](https://vercel.com), **Add New → Project** → import this repository. [`vercel.json`](vercel.json) sets the framework (Vite), the build command and the output folder.
2. Under **Environment Variables**, add `VITE_SERVER_URL` = `wss://<your Railway domain>/ws`. Vite builds it into the page, so redeploy after changing it.
3. Set the branch to deploy from: **Settings → Git → Production Branch** = `vercel_turso_railway` (or merge the branch into `main`).
4. Deploy, then put the Vercel address into Railway's `ALLOWED_ORIGINS` if you haven't yet.

### Restarts and redeploys

The rooms and games are in Turso, so they survive a server restart. After a restart, the browsers reconnect by themselves and continue as the same players. Players who don't reconnect within 30 seconds are removed from their rooms.

### Running the production setup locally

```bash
npm run build
npm start          # serves dist/ and /ws on http://localhost:3000
```

Without `TURSO_DATABASE_URL` the server uses a local file, `data/mazegame.sqlite`. To use Turso locally, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the environment first. [`.env.example`](.env.example) lists every setting.

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `VITE_SERVER_URL` | Vercel (build time) | `/ws` on the page's host | The server's WebSocket address |
| `TURSO_DATABASE_URL` | Railway | local file `data/mazegame.sqlite` | Database URL |
| `TURSO_AUTH_TOKEN` | Railway | *(none)* | Turso token |
| `ALLOWED_ORIGINS` | Railway | *(none)* | Page origins allowed to connect, comma separated; `*` matches part of a host name. The server's own host and `localhost` are always allowed. |
| `PORT` | Railway (automatic) | `3000` | HTTP and WebSocket port |

## How the server works

- Each browser tab opens one WebSocket and logs in with a name. The server gives it a user id and a secret token. Every tab is a separate player.
- The server is the only one that writes the data, and it checks every request: at most 6 players per room, one room per user, a game can't be joined after it started, and only the player whose turn it is (or the first real player, who plays the fake players' turns and removes players who left) can save the game.
- **Presence** is the connection itself. A closed tab closes its socket; a ping every 15 seconds catches connections that died without closing. The server then waits 10 seconds: if the tab reconnects with its token in that time, it continues as the same player. Otherwise it's removed from its room.
- When the server restarts, the rooms and games stay in the database. Players have 30 seconds to reconnect; after that, a sweep every 15 seconds removes room players who have no connection.

### Data layout (SQLite / Turso)

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
  index.ts              WebSockets, heartbeat, reconnects, /health (and dist/ when present)
  store.ts              Rooms, games and users: every rule is checked here
  db.ts                 Database (libSQL client: Turso or a local file) and the schema
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
