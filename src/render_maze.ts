import { Cell } from "./maze_generator";
import { Player } from "./player";
import question1Url from "../assets/images/question_1.png";
import question2Url from "../assets/images/question_2.png";
import question3Url from "../assets/images/question_3.png";
import question4Url from "../assets/images/question_4.png";

import player1Url from "../assets/images/player1.png";
import player2Url from "../assets/images/player2.png";
import player3Url from "../assets/images/player3.png";
import player4Url from "../assets/images/player4.png";
import player5Url from "../assets/images/player5.png";
import player6Url from "../assets/images/player6.png";

// Flag typeId (1 to 4) -> flag image
const flagImageUrls: Record<number, string> = {
  1: question1Url,
  2: question2Url,
  3: question3Url,
  4: question4Url,
};

// Player spriteId (1 to 6) -> player image
const playerImageUrls: Record<number, string> = {
  1: player1Url,
  2: player2Url,
  3: player3Url,
  4: player4Url,
  5: player5Url,
  6: player6Url,
};

const flagImages: Record<number, HTMLImageElement> = {};
const playerImages: Record<number, HTMLImageElement> = {};

function loadImages(urls: Record<number, string>, target: Record<number, HTMLImageElement>): Promise<void>[] {
  return Object.entries(urls).map(([id, url]) => {
    const image = new Image();
    target[Number(id)] = image;
    return new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => {
        console.error(`Failed to load image ${url}`);
        resolve();
      };
      image.src = url;
    });
  });
}

/**
 * Resolves once every flag and player image has loaded (or failed to load).
 * Redraw the maze after this so flags and players show their images.
 */
export const imagesReady: Promise<void> = Promise.all([
  ...loadImages(flagImageUrls, flagImages),
  ...loadImages(playerImageUrls, playerImages),
]).then(() => undefined);

function isLoaded(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return !!image && image.complete && image.naturalWidth > 0;
}

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
        if (isLoaded(image)) {
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
    const centerX = player.x * cellSize + cellSize / 2;
    const centerY = player.y * cellSize + cellSize / 2;

    // Highlight the current player with a ring in their color
    if (player.isCurrentTurn) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = player.color;
      ctx.stroke();
    }

    const image = playerImages[player.spriteId];
    if (isLoaded(image)) {
      // Scale the sprite to fit inside the cell, keeping its aspect ratio
      const maxSize = cellSize * 0.8;
      const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      ctx.drawImage(image, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
    } else {
      // Fallback until the image loads: a circle in the player's color
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = player.color;
      ctx.fill();
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