import { Cell } from "./maze_generator";
import { Player } from "./player";
import question1Url from "../assets/images/question_1.png";
import question2Url from "../assets/images/question_2.png";
import question3Url from "../assets/images/question_3.png";
import question4Url from "../assets/images/question_4.png";

// Flag typeId (1 to 4) -> flag image
const flagImages: Record<number, HTMLImageElement> = {};
const flagImageUrls: Record<number, string> = {
  1: question1Url,
  2: question2Url,
  3: question3Url,
  4: question4Url,
};

/**
 * Resolves once every flag image has loaded (or failed to load).
 * Redraw the maze after this so flags show their images.
 */
export const flagImagesReady: Promise<void> = Promise.all(
  Object.entries(flagImageUrls).map(([typeId, url]) => {
    const image = new Image();
    flagImages[Number(typeId)] = image;
    return new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => {
        console.error(`Failed to load flag image for type ${typeId}: ${url}`);
        resolve();
      };
      image.src = url;
    });
  })
).then(() => undefined);

export function renderGame(
  ctx: CanvasRenderingContext2D,
  maze: Cell[][],
  players: Player[],
  cellSize: number
) {
  const height = maze.length;
  if (height === 0) return;
  const width = maze[0].length;

  // Clear the canvas for the new frame
  ctx.clearRect(0, 0, width * cellSize, height * cellSize);

  // 1. Render Maze Grid, Walls, and Flags
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = maze[y][x];
      const pixelX = x * cellSize;
      const pixelY = y * cellSize;

      // Draw Finish Field (Top-Right)
      if (x === width - 1 && y === 0) {
        ctx.fillStyle = "#FFD700"; // Gold color for the crown/finish
        ctx.fillRect(pixelX, pixelY, cellSize, cellSize);
        ctx.fillStyle = "#000";
        ctx.font = `${cellSize / 2}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👑", pixelX + cellSize / 2, pixelY + cellSize / 2);
      }
      
      // Draw Start Field (Bottom-Left)
      if (x === 0 && y === height - 1) {
        ctx.fillStyle = "#e0ffe0"; 
        ctx.fillRect(pixelX, pixelY, cellSize, cellSize);
      }

      // Draw Flags
      if (cell.flag) {
        const image = flagImages[cell.flag.typeId];
        if (image && image.complete && image.naturalWidth > 0) {
          // Draw the flag image centered in the cell
          const flagSize = cellSize * 0.8;
          const offset = (cellSize - flagSize) / 2;
          ctx.drawImage(image, pixelX + offset, pixelY + offset, flagSize, flagSize);
        } else {
          // Fallback until the image loads: a distinct color per flag type
          const flagColors = ["#FF5733", "#33FF57", "#3357FF", "#F033FF"];
          ctx.fillStyle = flagColors[(cell.flag.typeId - 1) % flagColors.length];

          const flagSize = cellSize * 0.4;
          const offset = (cellSize - flagSize) / 2;
          ctx.fillRect(pixelX + offset, pixelY + offset, flagSize, flagSize);
        }
      }

      // Draw Walls
      ctx.strokeStyle = "#2c3e50";
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (cell.walls.top) {
        ctx.moveTo(pixelX, pixelY);
        ctx.lineTo(pixelX + cellSize, pixelY);
      }
      if (cell.walls.right) {
        ctx.moveTo(pixelX + cellSize, pixelY);
        ctx.lineTo(pixelX + cellSize, pixelY + cellSize);
      }
      if (cell.walls.bottom) {
        ctx.moveTo(pixelX + cellSize, pixelY + cellSize);
        ctx.lineTo(pixelX, pixelY + cellSize);
      }
      if (cell.walls.left) {
        ctx.moveTo(pixelX, pixelY + cellSize);
        ctx.lineTo(pixelX, pixelY);
      }
      ctx.stroke();
    }
  }

  // 2. Render Players (Z-Index Stacking)
  // Separate the current player to draw them last, ensuring their sprite is on top
  const waitingPlayers = players.filter(p => !p.isCurrentTurn);
  const currentPlayer = players.find(p => p.isCurrentTurn);

  const drawPlayer = (player: Player) => {
    const pixelX = player.x * cellSize + cellSize / 2;
    const pixelY = player.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.3;

    ctx.beginPath();
    ctx.arc(pixelX, pixelY, radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();

    // Highlight the current player with a stroke
    if (player.isCurrentTurn) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#FFF";
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }
  };

  waitingPlayers.forEach(drawPlayer);
  if (currentPlayer) {
    drawPlayer(currentPlayer);
  }
}