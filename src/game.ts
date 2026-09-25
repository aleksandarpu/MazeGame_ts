import { Cell, Flag, generateBraidedMaze } from "./maze_generator"; 
import { setupInputController } from "./maze_input_controller"; 
import { executePlayerMove } from "./player_move"; 
import { createQuestionPopup } from "./question-pop-up"; 
import { showDiceRollPopup } from "./dice-pop-up";
import { GameState } from "./GameState";
import { Player } from "./player";
import { getPlayerImageUrl, imagesReady, renderGame } from "./render_maze";

/** Player's sprite as an <img> scaled to fit a size x size box, or a color dot if there is no sprite */
function playerIconHtml(player: Player, size: number, extraStyle: string = ""): string {
  const url = getPlayerImageUrl(player.spriteId);
  if (!url) {
    return `<div style="width: ${size}px; height: ${size}px; background-color: ${player.color}; border-radius: 50%; ${extraStyle}"></div>`;
  }
  return `<img src="${url}" alt="" style="width: ${size}px; height: ${size}px; object-fit: contain; ${extraStyle}">`;
}

// Desktop: scoreboard next to the maze, same height. Mobile/tablet (<= 1024px): maze, current player, scoreboard stacked.
function injectLayoutStyles() {
  if (document.getElementById("game-layout-styles")) return;
  const style = document.createElement("style");
  style.id = "game-layout-styles";
  style.textContent = `
    .game-layout {
      display: grid;
      grid-template-columns: minmax(0, 608px) minmax(250px, 350px);
      grid-template-areas:
        "maze    score"
        "current .";
      justify-content: center;
      align-items: start;
      gap: 20px;
      padding: 20px;
      box-sizing: border-box;
    }
    .game-maze {
      grid-area: maze;
      display: block;
      width: 100%;
      height: auto;
      border: 4px solid #34495e;
      border-radius: 8px;
      background-color: #ecf0f1;
      box-sizing: border-box;
    }
    .game-current {
      grid-area: current;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px 20px;
      background-color: #34495e;
      padding: 15px;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .game-score {
      grid-area: score;
      align-self: stretch;
      contain: size; /* don't let the list grow the row: match the maze height and scroll */
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background-color: #34495e;
      padding: 20px;
      border-radius: 8px;
      box-sizing: border-box;
    }
    @media (max-width: 1024px) {
      .game-layout {
        grid-template-columns: minmax(0, 608px);
        grid-template-areas:
          "maze"
          "current"
          "score";
        padding: 12px;
        gap: 12px;
      }
      .game-score {
        align-self: auto;
        contain: none;
        overflow-y: visible;
      }
    }
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
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#2c3e50",
    color: "#fff",
    height: "100%",
    overflowY: "auto", // body doesn't scroll; the stacked mobile layout scrolls here
    boxSizing: "border-box",
  });
  injectLayoutStyles();

  const layout = document.createElement("div");
  layout.className = "game-layout";

  // 1. Maze Canvas (scales down on narrow screens, keeping its aspect ratio)
  const canvas = document.createElement("canvas");
  canvas.className = "game-maze";
  const cellSize = 40;
  canvas.width = gameState.width * cellSize;
  canvas.height = gameState.maze.length * cellSize;

  // 2. Current Player Box (below the maze)
  const currentPlayerBox = document.createElement("div");
  currentPlayerBox.className = "game-current";

  // 3. General Scoreboard (next to the maze on desktop, below the current player box on mobile/tablet)
  const scoreboardBox = document.createElement("div");
  scoreboardBox.className = "game-score";

  layout.append(canvas, scoreboardBox, currentPlayerBox);
  container.appendChild(layout);

  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Unable to draw the maze: canvas context is unavailable.");
  }

  const drawGame = () => {
    renderGame(canvasContext, gameState.maze, gameState.players, cellSize);
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
    // Render Scoreboard
    scoreboardBox.innerHTML = "<h2 style='margin: 0 0 15px 0; border-bottom: 2px solid #7f8c8d; padding-bottom: 10px;'>Scoreboard</h2>";
    
    // Sort players by score for display
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    sortedPlayers.forEach(player => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid #456";
      row.innerHTML = `
        <span style="display: flex; align-items: center; gap: 10px;">
          ${playerIconHtml(player, 28)}
          ${player.name}
        </span>
        <span style="font-weight: bold;">${player.score} pts</span>
      `;
      scoreboardBox.appendChild(row);
    });

    // Render Current Player Box
    const currentPlayer = gameState.players.find((p) => p.isCurrentTurn);
    if (currentPlayer) {
      currentPlayerBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
          ${playerIconHtml(currentPlayer, 44, `padding: 3px; border: 3px solid ${currentPlayer.color}; border-radius: 50%; background-color: rgba(255, 255, 255, 0.85); box-sizing: content-box;`)}
          <div style="font-size: 20px; font-weight: bold;">${currentPlayer.name}</div>
        </div>
        <div style="display: flex; gap: 20px; font-size: 18px;">
          <div>Score: <span style="font-weight: bold; color: #2ecc71;">${currentPlayer.score}</span></div>
          <div>Steps: <span style="font-weight: bold; color: #f1c40f;">${currentPlayer.steps}</span></div>
        </div>
      `;
    }
  };

  const handleTurnAdvance = () => {
    advanceTurn();
    updateUI();
    drawGame();
    showDicePopup();
  };

  // 4. Question Pop-up Handler Hook
  const handleQuestionTrigger = (flag: Flag, playerId: string) => {
    // Use the imported question pop-up generator[cite: 5]
    createQuestionPopup(container, flag.typeId, 30, (isCorrect: boolean, isTimeout: boolean) => {
      const player = gameState.players.find(p => p.id === playerId);
      if (!player) return;

      if (isCorrect) {
        updatePlayer(playerId, { score: player.score + 2, steps: player.steps + 3 });
        showCorrectPopup(5000, () => {
          // Player continues their turn
          updateUI();
          drawGame();
        });
      } else {
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
    gameState.maze,
    getCurrentPlayer,
    (targetX: number, targetY: number) => {
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
    }
  ); //[cite: 3]

  // Initial UI render (redraw once flag and player images have loaded)
  updateUI();
  drawGame();
  imagesReady.then(drawGame);
  showDicePopup();

  return cleanupInput; // Return the listener cleanup function for unmounting
}