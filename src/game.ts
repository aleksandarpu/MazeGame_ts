import { Cell, Flag, generateBraidedMaze } from "./maze_generator"; 
import { setupInputController } from "./maze_input_controller"; 
import { executePlayerMove } from "./player_move"; 
import { createQuestionPopup } from "./question-pop-up"; 
import { showDiceRollPopup } from "./dice-pop-up";
import { playSound } from "./sounds";
import { GameState } from "./GameState";
import { Player } from "./player";
import { BOARD_PADDING, getPlayerImageUrl, renderGame } from "./render_maze";
import { Theme, loadSavedTheme, saveTheme, themes } from "./themes";

const MIN_STEP_PIPS = 6; // dice max; more pips appear when a correct answer adds steps

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
        "maze    score"
        "current .";
      justify-content: center;
      align-items: start;
      gap: 22px;
      padding: 24px 20px;
      box-sizing: border-box;
    }
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
    .gs-pips { display: flex; gap: 5px; }
    .gs-pip { width: 14px; height: 14px; border-radius: 50%; }
    @keyframes gs-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @media (max-width: 1024px) {
      .gs-layout {
        grid-template-columns: minmax(0, 620px);
        grid-template-areas:
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

export function renderGamePlayScreen(
  container: HTMLElement,
  gameState: GameState,
  advanceTurn: () => void,
  updatePlayer: (playerId: string, updates: Partial<Player>) => void,
  showVictoryPopup: () => void,
  showCorrectPopup: (durationMs: number, onDismiss: () => void) => void,
  showWrongPopup: (onDismiss: () => void) => void
) {
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

  layout.append(mazeFrame, scoreboardBox, currentPlayerBox);
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

  const showDicePopup = () => {
    const currentPlayer = gameState.players.find((player) => player.isCurrentTurn);
    if (!currentPlayer || currentPlayer.steps > 0) return;

    showDiceRollPopup(container, currentPlayer.name, (steps) => {
      currentPlayer.steps = steps;
      drawGame();
      updateUI();
    });
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

    // Render Current Player Box: steps left as dice-like pips
    const currentPlayer = gameState.players.find((p) => p.isCurrentTurn);
    if (currentPlayer) {
      const pipCount = Math.max(MIN_STEP_PIPS, currentPlayer.steps);
      const pips = Array.from({ length: pipCount }, (_, i) =>
        `<span class="gs-pip ${i < currentPlayer.steps ? "on" : ""}"></span>`).join("");
      currentPlayerBox.innerHTML = `
        <div class="gs-avatar">${playerIconHtml(currentPlayer)}</div>
        <div class="gs-who">
          <div class="gs-label">Now playing</div>
          <div class="gs-who-name">${escapeHtml(currentPlayer.name)}</div>
        </div>
        <div class="gs-stat">
          <span class="gs-label">Steps left</span>
          <div class="gs-pips" title="${currentPlayer.steps} steps">${pips}</div>
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
      playSound("changePlayer");
      advanceTurn();
      updateUI();
      drawGame();
      showDicePopup();
    }, TURN_CHANGE_DELAY_MS);
  };

  // 4. Question Pop-up Handler Hook
  const handleQuestionTrigger = (flag: Flag, playerId: string) => {
    // Use the imported question pop-up generator[cite: 5]
    createQuestionPopup(container, flag.typeId, 30, (isCorrect: boolean, isTimeout: boolean) => {
      const player = gameState.players.find(p => p.id === playerId);
      if (!player) return;

      if (isCorrect) {
        playSound("collect");
        updatePlayer(playerId, { score: player.score + 2, steps: player.steps + 3 });
        showCorrectPopup(5000, () => {
          // Player continues their turn
          updateUI();
          drawGame();
        });
      } else {
        playSound("wrongAnswer");
        updatePlayer(playerId, { steps: 0 });
        showWrongPopup(() => {
          handleTurnAdvance();
        });
      }
    });
  };

  // 5. Connect Input Controller and Movement Logic
  const getCurrentPlayer = () => gameState.players.find(p => p.isCurrentTurn);

  const cleanupInput = setupInputController(
    canvas,
    cellSize,
    BOARD_PADDING,
    gameState.maze,
    getCurrentPlayer,
    (targetX: number, targetY: number) => {
      const player = getCurrentPlayer();
      if (player && player.steps > 0) playSound("footstep");

      // Execute the move logic using the imported function[cite: 4]
      executePlayerMove(
        targetX,
        targetY,
        gameState,
        handleQuestionTrigger,
        showVictoryPopup,
        handleTurnAdvance,
        (id, updates) => {
          updatePlayer(id, updates);
          updateUI();
          drawGame();
        }
      );
    },
    () => {
      // Only a real attempt counts: ignore key presses while waiting for the dice
      const player = getCurrentPlayer();
      if (player && player.steps > 0) playSound("damageTaken");
    }
  ); //[cite: 3]

  // Initial UI render (the animation loop keeps the maze redrawn, including once images load)
  updateUI();
  drawGame();
  showDicePopup();

  // Cleanup for unmounting: remove input listeners and stop the animation loop
  return () => {
    cleanupInput();
    cancelAnimationFrame(frameId);
  };
}