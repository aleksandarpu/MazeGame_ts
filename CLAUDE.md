# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based, turn-based multiplayer maze quiz game written in TypeScript with no UI framework (plain DOM + `<canvas>`). Players roll a die, move through a braided maze from the bottom-left start `(0, height-1)` to the top-right finish `(width-1, 0)`, and landing on a flag triggers a timed multiple-choice question. Question content (in `assets/data/*.json`) is Serbian Cyrillic.

## Commands

- `npm run dev` — Vite dev server with HMR; `index.html` loads `/src/index.ts` directly.
- `npm run build` — `tsc` (type-check only, `noEmit`) then `vite build` → bundled output in `dist/` (`dist/index.html` + hashed files in `dist/assets/`).
- `npm run preview` — serve the built `dist/` locally.
- `npx tsc` — type-check only.
- `node server.js` — old minimal HTTP server on port 3000 that returns `index.html` for every request; it doesn't serve JS or other files, so use `npm run preview` instead.

There is no test runner or linter configured.

## Architecture

**Entry / router — `src/index.ts`.** Holds a small global `appState` and a chain of `navigateTo*` functions: Login → Lobby → Game Room → Game Play. Each screen module exports a `render*Screen(container, ...data, ...callbacks)` function that wipes `#app-container` and builds its DOM with inline styles; navigation happens through the callbacks. Lobby/room data and the second player are currently **mocks** with comments marking where Firebase (Firestore `onSnapshot`/`addDoc`/`updateDoc`) calls should go.

**Game state is a single mutable object** (`GameState` in `src/GameState.ts`: `maze: Cell[][]`, `players: Player[]`, `width`). It's created in `navigateToGamePlay()` and mutated through callbacks (`updatePlayer`, `advanceTurn`) passed down from `index.ts`. Exactly one player has `isCurrentTurn`; `steps` is the remaining moves for that turn.

**Game loop — `src/game.ts` (`renderGamePlayScreen`)** wires everything together:
1. Dice popup sets `currentPlayer.steps` (1–6).
2. `maze_input_controller.ts` listens for arrow keys / canvas clicks, validates adjacency against `cell.walls`, and calls back with a target cell.
3. `player_move.ts` (`executePlayerMove`) decrements steps, checks victory, checks `cell.flag` (suspends the turn and opens a question), or advances the turn when steps hit 0.
4. Question outcome: correct → +2 score, +3 steps, turn continues; wrong/timeout → steps = 0, next player. This logic lives inline in `game.ts`; `question_resolver.ts` is a duplicate, currently unused version of it.
5. `render_maze.ts` redraws the full canvas (`cellSize` = 40) after every state change; the scoreboard/current-player box is re-rendered via `innerHTML`.

`renderGamePlayScreen` returns a cleanup function that removes the global keydown listener — call it when leaving the game screen.

**Maze** — `maze_generator.ts` builds a grid via recursive-backtracker DFS starting at the start cell, then "braids" it by knocking out one wall of every dead end (so there are loops). `place_flags_in_maze.ts` attaches `Flag { typeId }` objects directly onto cells (4 types × N each), excluding start and finish.

**Questions — work in progress.**
- `question-pop-up.ts` currently shows a hard-coded mockup question, not data from `assets/data`.
- `questions.ts` loads `questions_type{1..4}.json` via Node `fs`, which won't run in the browser, and its expected shape (`questionText`, `answers`) doesn't match the real files in `assets/data/` (`{ Group, Questions: [{ Question, Answers }] }`, four files: `gramatika`, `jezik`, `pravopis`, `sluzba`). The first entry in `Answers` appears to be the correct one. Flag `typeId` 1–4 is meant to map to these four groups, and `assets/images/question_{1..4}.png` are the matching flag icons.
- `victory-pop-up.ts` exists but `index.ts`'s `showVictoryPopup` is still a `console.log` stub.

**Firebase** — `firebase_init.ts` initializes Firestore and the Realtime Database (RTDB intended for presence via `onDisconnect`). It isn't imported by the app flow yet.

## Quirks

- Vite is the only bundler; TypeScript never emits files. Import static files from `assets/` through ES imports (e.g. `import url from "../assets/images/player1.png"`, or import the JSON directly) so Vite fingerprints them and includes them in the build. Plain string paths to `assets/` won't be copied into `dist/`.
- `questions.ts` imports Node `fs`/`path`. That's harmless only while nothing in the `index.ts` import graph imports it.
- `playful_dice_roller (3).html` and `test_question_pop-up.html` are standalone UI prototypes, not part of the app.
