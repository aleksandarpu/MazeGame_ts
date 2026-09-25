# Maze Game

A browser-based, turn-based multiplayer quiz game. Players take turns rolling a die and moving through a maze from the bottom-left corner to the top-right one. Landing on a flag opens a timed multiple-choice question: a correct answer earns points and extra steps, a wrong one ends the turn.

It's written in TypeScript with no UI framework (plain DOM and `<canvas>`), built with Vite, and uses Firebase for the lobby, game rooms, player presence and the shared game state. The quiz questions are in Serbian (Cyrillic); the interface is available in English and Serbian.

## Features

- **Online multiplayer:** up to 6 players per room. Create a room or join one from the lobby, mark yourself ready, and the game starts when everyone is.
- **Shared game:** all players see the same maze, moves, dice rolls and questions. Only the player whose turn it is can roll, move and answer; the others watch.
- **Maze:** a new braided maze (with loops, no dead ends) every game, with question flags of four types.
- **3D dice** with physics, and timed questions with shuffled answers.
- **Scoring:** a correct answer gives +2 points and +3 steps; a wrong answer or a timeout ends the turn. The first player to reach the finish ends the game, and the highest score wins.
- **Three visual themes** for the game screen (Garden Board, Neon Night, Candy Pop).
- **Sounds**, with groups that can be muted.
- **Two languages** (English, Serbian), switchable on every screen.
- **Presence tracking:** players who close their tab are removed from their room and game, and empty rooms are deleted.

## Getting started

Requirements: [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). To try multiplayer on one computer, open the game in two browser tabs and log in with a different name in each.

The lobby also has two practice rooms, **Alpha Room** and **Beta Room**. Their players are fake and always ready, so you can start a game from a single tab; you play the fake players' turns yourself.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks, then builds the site into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npx tsc` | Type-check only |

## Deploying to GitHub Pages

The browser can't run the TypeScript sources directly, so the site has to be built first. The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the game and publishes `dist/` on every push to `main`.

One-time setup: in the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. After the next push (or a manual run from the **Actions** tab), the game is at `https://<user>.github.io/<repo>/`.

The build uses relative paths (`base: "./"` in [`vite.config.ts`](vite.config.ts)), so it works in any sub-folder.

## Firebase setup

The game uses two Firebase services:

- **Cloud Firestore** for the game rooms and the running games
- **Realtime Database** for tracking who is online

The configuration in [`src/firebase_init.ts`](src/firebase_init.ts) points at the author's project. To run the game against your own:

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and add a **Web app** to it.
2. Create a **Firestore database** and a **Realtime Database**.
3. Copy the web app's config (Project settings → General → Your apps) into `firebaseConfig` in `src/firebase_init.ts`, including `databaseURL`.
4. Publish the security rules below.

**Firestore rules** (Firestore Database → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gameRooms/{roomId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Realtime Database rules** (Realtime Database → Rules):

```json
{
  "rules": {
    "status": {
      ".read": true,
      "$uid": { ".write": true }
    }
  }
}
```

> [!WARNING]
> These rules let anyone read and write the game data. They are meant for development only. The game has no sign-in yet; locking the rules down needs Firebase Authentication (for example, Anonymous Auth) so the rules can check who is writing.

### Data layout

| Where | Path | Contents |
| --- | --- | --- |
| Realtime Database | `status/{userId}` | Name, online/offline, current room |
| Firestore | `gameRooms/{roomId}` | Room name, status (waiting/started), players and whether they are ready |
| Firestore | `gameRooms/{roomId}/game/state` | The running game: maze, player positions, steps, scores, whose turn it is, the current question |

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
src/
  index.ts              Router: login → lobby → room → game, and the Firebase wiring
  login-screen.ts       Screens
  lobby-screen.ts
  game-room-screen.ts
  game.ts               Game screen, turn logic and syncing with the other players
  presence.ts           Online/offline tracking (Realtime Database)
  rooms.ts              Rooms: create, join, leave, ready, start, cleanup (Firestore)
  games.ts              The shared game document (Firestore)
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

- There is no sign-in, and the Firebase rules above are open to anyone.
- The Alpha and Beta practice rooms are always present in the lobby.
- If the player whose turn it is closes their tab, the turn passes to the next player only while at least one other player's game is open.
