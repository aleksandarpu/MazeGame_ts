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
1. `dice-pop-up.ts` (`showDiceRollPopup`) shows a 3D physics die (`DiceScene` class, math in `dice_math.ts`, ported from `playful_dice_roller (3).html`). The player clicks it or presses Space. The rolled value becomes `currentPlayer.steps` (1–6).
2. `maze_input_controller.ts` listens for arrow keys / canvas clicks, validates adjacency against `cell.walls`, and calls back with a target cell.
3. `player_move.ts` (`executePlayerMove`) decrements steps, checks victory, checks `cell.flag` (suspends the turn and opens a question), or advances the turn when steps hit 0.
4. Question outcome: correct → +2 score, +3 steps, turn continues; wrong/timeout → steps = 0, next player. This logic lives inline in `game.ts`; `question_resolver.ts` is a duplicate, currently unused version of it.
5. `render_maze.ts` (`renderGame(ctx, maze, players, cellSize, board, time)`) draws the whole maze. `game.ts` calls it every frame from a `requestAnimationFrame` loop; `time` drives the twinkling crown (`crown21`/`crown22` alternate), the pulsing finish glow and the current player's bob. Flags use `assets/images/question_{typeId}.png` and players `player{spriteId}.png`, scaled to fit the cell with their proportions kept. Until the images load, colored squares and circles are drawn instead. The scoreboard and current-player box are re-rendered via `innerHTML` in `updateUI()`.

`renderGamePlayScreen` returns a cleanup function that removes the input listeners and stops the animation loop — call it when leaving the game screen.

**Themes** — `themes.ts` defines three style sets for the game screen: `garden` (Garden Board, the default), `neon` (Neon Night) and `candy` (Candy Pop). Each has CSS scoped under `.theme-<id>` plus a `board` color set used by the canvas renderer. `game.ts` holds the layout CSS every theme shares (`.gs-*` classes, desktop grid / stacked at <= 1024px) and puts `gs-root theme-<id>` on the screen root. The color dots in the scoreboard header switch the theme; the choice is saved in `localStorage` (`mazegame.theme`). The fonts (Fredoka, Baloo 2, Lilita One) load from Google Fonts in `index.html`. To add a theme, add an entry to `themes`.

**Maze** — `maze_generator.ts` builds a grid via recursive-backtracker DFS starting at the start cell, then "braids" it by knocking out one wall of every dead end (so there are loops). `place_flags_in_maze.ts` attaches `Flag { typeId }` objects directly onto cells (4 types × N each), excluding start and finish.

**Questions.**
- `createQuestionPopup(container, flagTypeId, timeLimit, onResolve)` in `question-pop-up.ts` picks a random question for the flag's type. It builds the text from DOM text nodes, never `innerHTML`: `\n` becomes `<br>`, and text between a pair of `*` is shown in red (a line with an unpaired `*` is shown as-is). It assumes answer index 0 in the data is the correct one and shuffles the answers before showing them.
- `questions.ts` imports the four `assets/data/*.json` files statically (Vite bundles them; `resolveJsonModule` is on). File format: `{ Group, Questions: [{ Question, Answers }] }`. Flag `typeId` maps to files as 1 `gramatika`, 2 `jezik`, 3 `pravopis`, 4 `sluzba`. `getRandomQuestion(typeId)` returns `{ ordNum, group, questionText, answers }`. It strips stray U+FEFF characters and normalizes line endings. `questionText` contains `\n` line breaks, so display it with `textContent` + `white-space: pre-line`, not `innerHTML`. `assets/images/question_{1..4}.png` are the matching flag icons.
- Reaching the finish calls `index.ts`'s `showVictoryPopup`, which removes the game's input listeners and shows `victory-pop-up.ts` (its button goes back to the lobby).

**Sounds** — `sounds.ts` preloads `assets/sound/*.wav`; `playSound(name)` plays a copy each time, so sounds can overlap. Players can mute groups of sounds from the "Mute:" row above the maze. The groups are listed in `muteGroups` (steps, dice, answers, next player, wall), and the choice is saved in `localStorage` (`mazegame.mutedSounds`). A muted `playSound` still returns an (unplayed) element. `winning` is not in any group, so it always plays. Triggers: roll (while the die tumbles in `dice-pop-up.ts`; faded out with `fadeOutSound` when it settles), footstep (valid move), damageTaken (move blocked by a wall or the edge while the player has steps), collect / wrongAnswer (question result, including timeout), winning (inside the victory pop-up), changePlayer (in `game.ts`'s `handleTurnAdvance`, which waits `TURN_CHANGE_DELAY_MS` before the next player's dice).

**Firebase** — `firebase_init.ts` initializes Firestore and the Realtime Database (RTDB intended for presence via `onDisconnect`). It isn't imported by the app flow yet.

## Quirks

- Vite is the only bundler; TypeScript never emits files. Import static files from `assets/` through ES imports (e.g. `import url from "../assets/images/player1.png"`, or import the JSON directly) so Vite fingerprints them and includes them in the build. Plain string paths to `assets/` won't be copied into `dist/`.
- `playful_dice_roller (3).html` and `test_question_pop-up.html` are standalone UI prototypes, not part of the app (the dice one has been ported to `src/dice-pop-up.ts`).
