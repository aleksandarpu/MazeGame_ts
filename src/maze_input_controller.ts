import { Cell} from "./maze_generator";
import { Player } from "./player";

export function setupInputController(
  canvas: HTMLCanvasElement,
  cellSize: number,
  maze: Cell[][],
  getCurrentPlayer: () => Player | undefined,
  onPlayerMove: (newX: number, newY: number) => void
) {
  // Helper to validate if a move between two neighboring cells is unobstructed
  const isValidMove = (currX: number, currY: number, targetX: number, targetY: number): boolean => {
    // Check bounds
    if (
      targetX < 0 ||
      targetX >= maze[0].length ||
      targetY < 0 ||
      targetY >= maze.length
    ) {
      return false;
    }

    const currentCell = maze[currY][currX];

    // Check adjacency and walls
    if (targetX === currX + 1 && targetY === currY) return !currentCell.walls.right;
    if (targetX === currX - 1 && targetY === currY) return !currentCell.walls.left;
    if (targetY === currY + 1 && targetX === currX) return !currentCell.walls.bottom;
    if (targetY === currY - 1 && targetX === currX) return !currentCell.walls.top;

    return false; // Not a valid orthogonal neighbor or blocked by wall
  };

  // Central movement handler
  const attemptMove = (dx: number, dy: number) => {
    const player = getCurrentPlayer();
    if (!player || !player.isCurrentTurn) return; // Add check for player.steps > 0 in actual game loop

    const targetX = player.x + dx;
    const targetY = player.y + dy;

    if (isValidMove(player.x, player.y, targetX, targetY)) {
      onPlayerMove(targetX, targetY);
    }
  };

  // Keyboard Input Handler
  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        attemptMove(0, -1);
        break;
      case "ArrowRight":
      case "d":
      case "D":
        attemptMove(1, 0);
        break;
      case "ArrowDown":
      case "s":
      case "S":
        attemptMove(0, 1);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        attemptMove(-1, 0);
        break;
    }
  };

  // Mouse Input Handler
  const handleMouseClick = (e: MouseEvent) => {
    const player = getCurrentPlayer();
    if (!player || !player.isCurrentTurn) return;

    // Calculate mouse click coordinates relative to the canvas
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel coordinates to grid indices
    const targetX = Math.floor(clickX / cellSize);
    const targetY = Math.floor(clickY / cellSize);

    // Calculate distance
    const dx = targetX - player.x;
    const dy = targetY - player.y;

    // Ensure the clicked cell is exactly 1 step away (orthogonal neighbor)
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      attemptMove(dx, dy);
    }
  };

  // Attach listeners
  window.addEventListener("keydown", handleKeyDown);
  canvas.addEventListener("click", handleMouseClick);

  // Return a cleanup function to remove listeners when the game component unmounts
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    canvas.removeEventListener("click", handleMouseClick);
  };
}