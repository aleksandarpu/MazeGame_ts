import { Cell, Flag, generateBraidedMaze } from "./maze_generator"; 
import { setupInputController } from "./maze_input_controller"; 
import { executePlayerMove } from "./player_move"; 
import {
  ActiveQuestion, CORRECT_ANSWER_INDEX, QuestionPopup, createQuestionPopup, getAnswerText, pickQuestion,
} from "./question-pop-up";
import { AnswerDetails } from "./answer-pop-up";
import { SpectatorDice, showDiceRollPopup, showSpectatorDicePopup } from "./dice-pop-up";
import { isGroupMuted, muteGroups, playSound, setGroupMuted } from "./sounds";
import { GamePhase, GameState, SyncedGameState } from "./GameState";
import { Player } from "./player";
import { BOARD_PADDING, getPlayerImageUrl, renderGame } from "./render_maze";
import { Theme, loadSavedTheme, saveTheme, themes } from "./themes";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Player's sprite as an <img>, or a color dot if there is no sprite */
function playerIconHtml(player: Player): string {
  const url = getPlayerImageUrl(player.spriteId);
  if (!url) return `<span class="gs-dot" style="background-color: ${player.color};"></span>`;
  return `<img src="${url}" alt="">`;
}

// Layout shared by all themes. Desktop: scoreboard next to the maze, same height.
// Mobile/tablet (<= 1024px): maze, current player, scoreboard stacked. Theme colors come from themes.ts.
function injectLayoutStyles() {
  if (document.getElementById("game-layout-styles")) return;
  const style = document.createElement("style");
  style.id = "game-layout-styles";
  style.textContent = `
    .gs-root {
      min-height: 100%;
      font-family: Fredoka, Arial, sans-serif;
      box-sizing: border-box;
    }
    .gs-layout {
      display: grid;
      grid-template-columns: minmax(0, 620px) minmax(260px, 340px);
      grid-template-areas:
        "mute    ."
        "maze    score"
        "current .";
      justify-content: center;
      align-items: start;
      gap: 22px;
      padding: 24px 20px;
      box-sizing: border-box;
    }
    .gs-mute {
      grid-area: mute;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 16px;
      padding: 8px 16px;
      font-size: 15px;
      box-sizing: border-box;
    }
    .gs-mute-title { font-weight: 700; }
    .gs-mute label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; }
    .gs-mute input { width: 17px; height: 17px; margin: 0; cursor: pointer; }
    .gs-maze {
      grid-area: maze;
      padding: 10px;
      box-sizing: border-box;
    }
    .gs-maze canvas {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 10px;
    }
    .gs-score {
      grid-area: score;
      align-self: stretch;
      contain: size; /* don't let the list grow the row: match the maze height and scroll */
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 18px;
      box-sizing: border-box;
    }
    .gs-score-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 6px 4px; }
    .gs-title { margin: 0; font-size: 26px; }
    .gs-themes { display: flex; gap: 6px; }
    .gs-theme-btn {
      width: 22px; height: 22px; padding: 0; border-radius: 50%; cursor: pointer;
      border: 3px solid rgba(255, 255, 255, 0.6); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    .gs-theme-btn.active { border-color: #fff; outline: 2px solid rgba(0, 0, 0, 0.35); }
    .gs-row { display: flex; align-items: center; gap: 12px; padding: 6px 12px 6px 8px; border-radius: 14px; font-size: 18px; }
    .gs-row img { width: 44px; height: 44px; object-fit: contain; }
    .gs-dot { width: 28px; height: 28px; margin: 8px; border-radius: 50%; flex: none; }
    .gs-rank { width: 22px; text-align: center; opacity: 0.7; font-weight: 700; }
    .gs-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gs-points { font-size: 20px; }
    .gs-current {
      grid-area: current;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 18px;
      padding: 14px 20px;
      box-sizing: border-box;
    }
    .gs-avatar { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; flex: none; box-sizing: border-box; }
    .gs-avatar img { width: 50px; height: 50px; object-fit: contain; animation: gs-bob 1.2s ease-in-out infinite; }
    .gs-who { flex: 1; min-width: 120px; }
    .gs-who .gs-label { font-size: 14px; }
    .gs-who-name { font-size: 24px; font-weight: 700; }
    .gs-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .gs-stat .gs-label { font-size: 14px; }
    .gs-big { font-size: 34px; line-height: 1; }
    @keyframes gs-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @media (max-width: 1024px) {
      .gs-layout {
        grid-template-columns: minmax(0, 620px);
        grid-template-areas:
          "mute"
          "maze"
          "current"
          "score";
        gap: 14px;
        padding: 12px;
      }
      .gs-score { align-self: auto; contain: none; overflow-y: visible; }
    }
    ${themes.map((t) => t.css).join("\n")}
  `;
  document.head.appendChild(style);
}

export type GameScreenOptions = {
  localUserId: string; // This client's player; it only acts on its own turns
  publish: () => void; // gameState changed here: save it so the other players see it
  showVictoryPopup: () => void;
  /** Correct / Wrong pop-up with the chosen answer (details.playerName is set for someone else's answer) */
  showAnswerResult: (isCorrect: boolean, details: AnswerDetails, onDismiss: () => void) => void;
};

export type GameScreen = {
  /** Remove input listeners and stop the animation loop */
  cleanup: () => void;
  /** Take over the state another player saved, and play what happened (roll, move, answer, turn change) */
  applyRemote: (next: SyncedGameState) => void;
  /** Drop players who left the room; passes the turn on if it was theirs */
  removePlayers: (playerIds: string[]) => void;
};

const phaseText: Record<GamePhase, string> = {
  roll: "Rolling the dice",
  move: "Moving",
  question: "Answering a question",
  finished: "Finished",
};

export function renderGamePlayScreen(
  container: HTMLElement,
  gameState: GameState,
  options: GameScreenOptions
): GameScreen {
  const { localUserId, publish, showVictoryPopup, showAnswerResult } = options;

  // Clear container and setup responsive wrapper
  container.innerHTML = "";
  Object.assign(container.style, {
    height: "100%",
    overflowY: "auto", // body doesn't scroll; the stacked mobile layout scrolls here
    boxSizing: "border-box",
  });
  injectLayoutStyles();

  let theme: Theme = loadSavedTheme();

  const root = document.createElement("div");
  root.className = `gs-root theme-${theme.id}`;

  const layout = document.createElement("div");
  layout.className = "gs-layout";

  // 0. Mute row (above the maze): one checkbox per sound group
  const muteRow = document.createElement("div");
  muteRow.className = "gs-mute gs-panel";
  const muteTitle = document.createElement("span");
  muteTitle.className = "gs-mute-title gs-label";
  muteTitle.textContent = "Mute:";
  muteRow.appendChild(muteTitle);
  for (const group of muteGroups) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isGroupMuted(group.id);
    checkbox.addEventListener("change", () => {
      setGroupMuted(group.id, checkbox.checked);
      // Release focus so the next Space press rolls the dice instead of toggling this box
      checkbox.blur();
    });
    label.append(checkbox, group.label);
    muteRow.appendChild(label);
  }

  // 1. Maze Canvas in a frame (scales down on narrow screens, keeping its aspect ratio)
  const mazeFrame = document.createElement("div");
  mazeFrame.className = "gs-maze gs-panel";
  const canvas = document.createElement("canvas");
  const cellSize = 40;
  canvas.width = gameState.width * cellSize + 2 * BOARD_PADDING;
  canvas.height = gameState.maze.length * cellSize + 2 * BOARD_PADDING;
  mazeFrame.appendChild(canvas);

  // 2. Current Player Box (below the maze)
  const currentPlayerBox = document.createElement("div");
  currentPlayerBox.className = "gs-current gs-panel";

  // 3. General Scoreboard (next to the maze on desktop, below the current player box on mobile/tablet)
  const scoreboardBox = document.createElement("div");
  scoreboardBox.className = "gs-score gs-panel";

  layout.append(muteRow, mazeFrame, scoreboardBox, currentPlayerBox);
  root.appendChild(layout);
  container.appendChild(root);

  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Unable to draw the maze: canvas context is unavailable.");
  }

  // The maze is redrawn every frame so the crown twinkles and the current player bobs
  let animationTime = 0;
  const drawGame = () => {
    renderGame(canvasContext, gameState.maze, gameState.players, cellSize, theme.board, animationTime);
  };
  let frameId = 0;
  const animate = (time: number) => {
    animationTime = time;
    drawGame();
    frameId = requestAnimationFrame(animate);
  };
  frameId = requestAnimationFrame(animate);

  const setTheme = (next: Theme) => {
    theme = next;
    saveTheme(next);
    root.className = `gs-root theme-${next.id}`;
    updateUI();
    drawGame();
  };

  const getCurrentPlayer = () => gameState.players.find((p) => p.isCurrentTurn);

  // Real players play their own turns; mock players' turns are played by the first real player
  const controllerOf = (player: Player) =>
    player.isMock ? gameState.players.find((p) => !p.isMock)?.id ?? "" : player.id;
  const isLocalTurn = () => {
    const player = getCurrentPlayer();
    return !!player && gameState.phase !== "finished" && controllerOf(player) === localUserId;
  };

  const updatePlayer = (playerId: string, updates: Partial<Player>) => {
    const player = gameState.players.find((item) => item.id === playerId);
    if (player) Object.assign(player, updates);
  };

  /** Save the local change for the other players and redraw */
  const commit = () => {
    publish();
    updateUI();
    drawGame();
  };

  // The dice pop-up of the current turn: the real one on the roller's client, a spectator one elsewhere
  let spectatorDice: SpectatorDice | null = null;

  const openDiceForCurrentPlayer = () => {
    spectatorDice?.close();
    spectatorDice = null;
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer || gameState.phase !== "roll") return;

    if (!isLocalTurn()) {
      spectatorDice = showSpectatorDicePopup(container, currentPlayer.name);
      return;
    }
    const playerId = currentPlayer.id;
    showDiceRollPopup(
      container,
      currentPlayer.name,
      (steps) => {
        updatePlayer(playerId, { steps });
        gameState.lastRoll = steps;
        gameState.phase = "move";
        commit();
      },
      () => {
        gameState.rollCount += 1;
        gameState.lastRoll = 0;
        publish();
      }
    );
  };

  const advanceTurn = () => {
    const currentIndex = gameState.players.findIndex((player) => player.isCurrentTurn);
    const nextIndex = (currentIndex + 1) % gameState.players.length;
    gameState.players.forEach((player, index) => {
      player.isCurrentTurn = index === nextIndex;
      if (index === nextIndex) player.steps = 0;
    });
    gameState.phase = "roll";
    gameState.lastRoll = 0;
  };

  const finishGame = () => {
    const winner = getCurrentPlayer();
    gameState.phase = "finished";
    gameState.winnerId = winner?.id ?? null;
    commit();
    showVictoryPopup();
  };

  // 3. UI Update Logic
  const updateUI = () => {
    // Render Scoreboard: header with theme switcher, then players ranked by score
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    scoreboardBox.innerHTML = `
      <div class="gs-score-header">
        <h2 class="gs-title">Scoreboard</h2>
        <div class="gs-themes">
          ${themes.map((t) => `
            <button type="button" class="gs-theme-btn ${t.id === theme.id ? "active" : ""}" data-theme="${t.id}"
              title="${t.label}" aria-label="${t.label} theme" style="background-color: ${t.swatch};"></button>`).join("")}
        </div>
      </div>
      ${sortedPlayers.map((player, index) => `
        <div class="gs-row ${player.isCurrentTurn ? "active" : ""}">
          <span class="gs-rank">${index + 1}</span>
          ${playerIconHtml(player)}
          <span class="gs-name">${escapeHtml(player.name)}</span>
          <span class="gs-points">${player.score}</span>
        </div>`).join("")}
    `;
    scoreboardBox.querySelectorAll<HTMLButtonElement>(".gs-theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = themes.find((t) => t.id === btn.dataset.theme);
        if (next) setTheme(next);
      });
    });

    // Render Current Player Box
    const currentPlayer = gameState.players.find((p) => p.isCurrentTurn);
    if (currentPlayer) {
      currentPlayerBox.innerHTML = `
        <div class="gs-avatar">${playerIconHtml(currentPlayer)}</div>
        <div class="gs-who">
          <div class="gs-label">Now playing${controllerOf(currentPlayer) === localUserId ? " (you)" : ""}</div>
          <div class="gs-who-name">${escapeHtml(currentPlayer.name)}</div>
          <div class="gs-label">${phaseText[gameState.phase]}</div>
        </div>
        <div class="gs-stat">
          <span class="gs-label">Steps left</span>
          <span class="gs-big">${currentPlayer.steps}</span>
        </div>
        <div class="gs-stat">
          <span class="gs-label">Score</span>
          <span class="gs-big">${currentPlayer.score}</span>
        </div>
      `;
    }
  };

  // Pause after the last step before handing the turn (and dice) to the next player
  const TURN_CHANGE_DELAY_MS = 800;
  let turnChangePending = false;

  const handleTurnAdvance = () => {
    if (turnChangePending) return;
    turnChangePending = true;
    setTimeout(() => {
      turnChangePending = false;
      if (gameState.phase === "finished") return;
      playSound("changePlayer");
      advanceTurn();
      commit();
      openDiceForCurrentPlayer();
    }, TURN_CHANGE_DELAY_MS);
  };

  // 4. Question Pop-up Handler Hook
  // The question pop-up on screen: answerable on the answering player's client, read-only elsewhere.
  // questionKey identifies the question it shows ("" when none).
  let questionPopup: QuestionPopup | null = null;
  let questionKey = "";
  const keyOf = (question: ActiveQuestion | null) => (question ? JSON.stringify(question) : "");

  const closeQuestionPopup = () => {
    questionPopup?.close();
    questionPopup = null;
    questionKey = "";
  };

  /** answerIndex: original index of the chosen answer, null = no answer (time ran out) */
  const resolveAnswer = (playerId: string, question: ActiveQuestion | null, answerIndex: number | null) => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const isCorrect = answerIndex === CORRECT_ANSWER_INDEX;
    const answerText = question && answerIndex !== null ? getAnswerText(question, answerIndex) : null;
    gameState.answerCount += 1;
    gameState.lastAnswerCorrect = isCorrect;
    gameState.lastAnswerText = answerText;
    gameState.question = null;
    gameState.phase = "move";
    if (isCorrect) {
      playSound("collect");
      updatePlayer(playerId, { score: player.score + 2, steps: player.steps + 3 });
      commit();
      showAnswerResult(true, { answerText }, () => {
        // Player continues their turn
        updateUI();
        drawGame();
      });
    } else {
      playSound("wrongAnswer");
      updatePlayer(playerId, { steps: 0 });
      commit();
      showAnswerResult(false, { answerText }, () => {
        handleTurnAdvance();
      });
    }
  };

  const handleQuestionTrigger = (flag: Flag, playerId: string) => {
    // Pick the question here and save it, so every player sees the same one
    const question = pickQuestion(flag.typeId, 30);
    if (!question) {
      // No question available for this flag: treat as not answered
      resolveAnswer(playerId, null, null);
      return;
    }
    gameState.phase = "question";
    gameState.question = question;
    commit();
    questionKey = keyOf(question);
    // Use the imported question pop-up generator[cite: 5]
    questionPopup = createQuestionPopup(container, question, (answerIndex) => {
      questionPopup = null;
      questionKey = "";
      resolveAnswer(playerId, question, answerIndex);
    });
  };

  // 5. Connect Input Controller and Movement Logic
  // Input only reaches the game on this client's own turn, while walking
  const getLocalMovingPlayer = () =>
    isLocalTurn() && gameState.phase === "move" ? getCurrentPlayer() : undefined;

  const cleanupInput = setupInputController(
    canvas,
    cellSize,
    BOARD_PADDING,
    gameState.maze,
    getLocalMovingPlayer,
    (targetX: number, targetY: number) => {
      const player = getLocalMovingPlayer();
      if (player && player.steps > 0) playSound("footstep");

      // Execute the move logic using the imported function[cite: 4]
      executePlayerMove(
        targetX,
        targetY,
        gameState,
        handleQuestionTrigger,
        finishGame,
        handleTurnAdvance,
        (id, updates) => {
          updatePlayer(id, updates);
          commit();
        }
      );
    },
    () => {
      // Only a real attempt counts: ignore key presses while waiting for the dice
      const player = getLocalMovingPlayer();
      if (player && player.steps > 0) playSound("damageTaken");
    }
  ); //[cite: 3]

  // 6. State saved by another player: take it over and play what happened.
  // Our own saves come back here too; they match gameState, so nothing is replayed.
  const applyRemote = (next: SyncedGameState) => {
    const before = getCurrentPlayer();
    const prev = {
      currentId: before?.id,
      x: before?.x,
      y: before?.y,
      phase: gameState.phase,
      rollCount: gameState.rollCount,
      lastRoll: gameState.lastRoll,
      answerCount: gameState.answerCount,
    };

    // Keep the player objects (matched by id) so nothing holding one goes stale
    gameState.players = next.players.map((p) =>
      Object.assign(gameState.players.find((old) => old.id === p.id) ?? ({} as Player), p)
    );
    gameState.phase = next.phase;
    gameState.rollCount = next.rollCount;
    gameState.lastRoll = next.lastRoll;
    gameState.answerCount = next.answerCount;
    gameState.lastAnswerCorrect = next.lastAnswerCorrect;
    gameState.lastAnswerText = next.lastAnswerText;
    gameState.question = next.question;
    gameState.winnerId = next.winnerId;

    const current = getCurrentPlayer();
    updateUI();
    drawGame();

    if (gameState.phase === "finished") {
      if (prev.phase !== "finished") {
        spectatorDice?.close();
        spectatorDice = null;
        closeQuestionPopup();
        showVictoryPopup();
      }
      return;
    }

    if (current?.id !== prev.currentId) {
      playSound("changePlayer");
      openDiceForCurrentPlayer();
    } else if (current && (current.x !== prev.x || current.y !== prev.y)) {
      playSound("footstep");
    }

    if (gameState.rollCount > prev.rollCount) spectatorDice?.startRolling();
    if (gameState.lastRoll > 0 && (gameState.lastRoll !== prev.lastRoll || gameState.rollCount !== prev.rollCount)) {
      spectatorDice?.showResult(gameState.lastRoll);
      spectatorDice = null;
    }

    // Someone else's question: show it read-only; close it once it's answered
    const nextQuestionKey = keyOf(gameState.question);
    if (nextQuestionKey !== questionKey) {
      closeQuestionPopup();
      if (gameState.question && !isLocalTurn()) {
        questionPopup = createQuestionPopup(container, gameState.question);
        questionKey = nextQuestionKey;
      }
    }

    if (gameState.answerCount > prev.answerCount) {
      const details: AnswerDetails = { answerText: gameState.lastAnswerText, playerName: before?.name ?? current?.name };
      playSound(gameState.lastAnswerCorrect ? "collect" : "wrongAnswer");
      showAnswerResult(gameState.lastAnswerCorrect, details, () => {});
    }
  };

  const removePlayers = (playerIds: string[]) => {
    const current = getCurrentPlayer();
    const currentIndex = current ? gameState.players.indexOf(current) : -1;
    gameState.players = gameState.players.filter((p) => !playerIds.includes(p.id));
    if (gameState.players.length === 0) return;

    if (current && playerIds.includes(current.id)) {
      // It was their turn: hand it to whoever came after them
      const next = gameState.players[currentIndex % gameState.players.length];
      gameState.players.forEach((p) => (p.isCurrentTurn = p === next));
      next.steps = 0;
      gameState.phase = "roll";
      gameState.lastRoll = 0;
      gameState.question = null;
      closeQuestionPopup();
      commit();
      playSound("changePlayer");
      openDiceForCurrentPlayer();
    } else {
      commit();
    }
  };

  // Initial UI render (the animation loop keeps the maze redrawn, including once images load)
  updateUI();
  drawGame();
  openDiceForCurrentPlayer();

  return {
    cleanup: () => {
      cleanupInput();
      cancelAnimationFrame(frameId);
      spectatorDice?.close();
      closeQuestionPopup();
    },
    applyRemote,
    removePlayers,
  };
}
