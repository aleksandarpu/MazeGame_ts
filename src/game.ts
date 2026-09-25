import { Cell, Flag, generateBraidedMaze } from "./maze_generator"; 
import { setupInputController } from "./maze_input_controller"; 
import { executePlayerMove } from "./player_move"; 
import { createQuestionPopup } from "./question-pop-up"; 
import { showDiceRollPopup } from "./dice-pop-up";
import { GameState } from "./GameState";
import { Player } from "./player";
import { flagImagesReady, renderGame } from "./render_maze";

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
    display: "flex",
    flexWrap: "wrap", // Allows the scoreboard to wrap to the bottom on small screens
    justifyContent: "center",
    alignItems: "flex-start",
    gap: "20px",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#2c3e50",
    color: "#fff",
    minHeight: "100vh",
    boxSizing: "border-box",
  });

  // 1. Left Column: Maze Canvas and Current Player Box
  const leftColumn = document.createElement("div");
  leftColumn.style.display = "flex";
  leftColumn.style.flexDirection = "column";
  leftColumn.style.alignItems = "center";
  leftColumn.style.gap = "15px";

  const canvas = document.createElement("canvas");
  const cellSize = 40;
  canvas.width = gameState.width * cellSize;
  canvas.height = gameState.maze.length * cellSize;
  canvas.style.border = "4px solid #34495e";
  canvas.style.backgroundColor = "#ecf0f1";
  canvas.style.borderRadius = "8px";

  const currentPlayerBox = document.createElement("div");
  Object.assign(currentPlayerBox.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: `${canvas.width}px`,
    backgroundColor: "#34495e",
    padding: "15px",
    borderRadius: "8px",
    boxSizing: "border-box",
  });

  leftColumn.appendChild(canvas);
  leftColumn.appendChild(currentPlayerBox);

  // 2. Right Column: General Scoreboard
  const scoreboardBox = document.createElement("div");
  Object.assign(scoreboardBox.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minWidth: "250px",
    backgroundColor: "#34495e",
    padding: "20px",
    borderRadius: "8px",
    flexGrow: "1",
    maxWidth: "350px",
  });

  container.appendChild(leftColumn);
  container.appendChild(scoreboardBox);

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
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid #456";
      row.innerHTML = `
        <span style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 16px; height: 16px; background-color: ${player.color}; border-radius: 50%;"></div>
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
          <div style="width: 32px; height: 32px; background-color: ${currentPlayer.color}; border: 2px solid #fff; border-radius: 50%;"></div>
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

  // Initial UI render (redraw once flag images have loaded)
  updateUI();
  drawGame();
  flagImagesReady.then(drawGame);
  showDicePopup();

  return cleanupInput; // Return the listener cleanup function for unmounting
}