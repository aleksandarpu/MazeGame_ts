import { Cell } from "./maze_generator";
import { Player } from "./player";
import { BoardTheme } from "./themes";
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
import crownAUrl from "../assets/images/crown21.png";
import crownBUrl from "../assets/images/crown22.png";

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

// The two crowns differ only in the sparkle; alternating them makes the finish twinkle
const crownImageUrls: Record<number, string> = {
  0: crownAUrl,
  1: crownBUrl,
};

/** URL of a player's sprite image, for use outside the canvas (e.g. <img src>) */
export function getPlayerImageUrl(spriteId: number): string | undefined {
  return playerImageUrls[spriteId];
}

const flagImages: Record<number, HTMLImageElement> = {};
const playerImages: Record<number, HTMLImageElement> = {};
const crownImages: Record<number, HTMLImageElement> = {};

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
 * Resolves once every flag, player and crown image has loaded (or failed to load).
 * Redraw the maze after this so they show their images.
 */
export const imagesReady: Promise<void> = Promise.all([
  ...loadImages(flagImageUrls, flagImages),
  ...loadImages(playerImageUrls, playerImages),
  ...loadImages(crownImageUrls, crownImages),
]).then(() => undefined);

function isLoaded(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return !!image && image.complete && image.naturalWidth > 0;
}

/**
 * Margin (px) around the maze on the canvas, so the outer walls sit centered on the
 * cell edges like the inner walls instead of being pushed inward.
 * The canvas must be `width * cellSize + 2 * BOARD_PADDING` wide (same for height).
 */
export const BOARD_PADDING = 8;

type Segment = [number, number, number, number];

/** Every wall as a line segment; each shared wall is listed once */
function wallSegments(maze: Cell[][], cellSize: number): Segment[] {
  const height = maze.length;
  const width = maze[0].length;
  const segments: Segment[] = [];
  for (const row of maze) {
    for (const cell of row) {
      const x = cell.x * cellSize;
      const y = cell.y * cellSize;
      if (cell.walls.top) segments.push([x, y, x + cellSize, y]);
      if (cell.walls.left) segments.push([x, y, x, y + cellSize]);
      if (cell.walls.bottom && cell.y === height - 1) segments.push([x, y + cellSize, x + cellSize, y + cellSize]);
      if (cell.walls.right && cell.x === width - 1) segments.push([x + cellSize, y, x + cellSize, y + cellSize]);
    }
  }
  return segments;
}

function drawWalls(ctx: CanvasRenderingContext2D, segments: Segment[], board: BoardTheme) {
  const stroke = (color: string, lineWidth: number, dy: number, glow?: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segments) {
      ctx.moveTo(x1, y1 + dy);
      ctx.lineTo(x2, y2 + dy);
    }
    ctx.stroke();
    ctx.restore();
  };

  if (board.wallShade) stroke(board.wallShade, board.wallWidth, 3);
  stroke(board.wall, board.wallWidth, 0, board.wallGlow);
  if (board.wallHighlight) stroke(board.wallHighlight, Math.max(1.5, board.wallWidth * 0.25), -board.wallWidth * 0.2);
}

function roundedCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 3, cellSize - 6, cellSize - 6, 8);
  ctx.fill();
}

/**
 * Draws one frame of the maze. `time` (ms, e.g. from requestAnimationFrame) drives the
 * twinkling crown, the finish glow and the current player's bobbing.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  maze: Cell[][],
  players: Player[],
  cellSize: number,
  board: BoardTheme,
  time: number = 0
) {
  const height = maze.length;
  if (height === 0) return;
  const width = maze[0].length;
  const canvasW = width * cellSize;
  const canvasH = height * cellSize;

  // Margin around the maze, then draw everything in maze coordinates
  ctx.fillStyle = board.tileA;
  ctx.fillRect(0, 0, canvasW + 2 * BOARD_PADDING, canvasH + 2 * BOARD_PADDING);
  ctx.save();
  ctx.translate(BOARD_PADDING, BOARD_PADDING);

  // 1. Tiles (checkerboard) and optional dotted grid
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ctx.fillStyle = (x + y) % 2 ? board.tileB : board.tileA;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
  if (board.grid) {
    ctx.save();
    ctx.strokeStyle = board.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (let i = 1; i < width; i++) {
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasH);
    }
    for (let i = 1; i < height; i++) {
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasW, i * cellSize);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 2. Start Field (Bottom-Left)
  roundedCell(ctx, 0, (height - 1) * cellSize, cellSize, board.start);

  // 3. Finish Field (Top-Right): tile, pulsing glow and twinkling crown
  const finishX = (width - 1) * cellSize;
  roundedCell(ctx, finishX, 0, cellSize, board.finish);
  const finishCX = finishX + cellSize / 2;
  const finishCY = cellSize / 2;
  const pulse = 0.75 + 0.25 * Math.sin(time / 350);
  const glow = ctx.createRadialGradient(finishCX, finishCY, 2, finishCX, finishCY, cellSize * 0.75 * pulse);
  glow.addColorStop(0, board.finishGlow);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(finishX - cellSize / 2, 0, cellSize * 1.5, cellSize * 1.5);
  const crown = crownImages[Math.floor(time / 500) % 2];
  if (isLoaded(crown)) {
    // The crown sits in the middle of a square image with empty space around it:
    // centering the image centers the crown, and 1.2x the cell keeps the crown itself inside the tile
    const size = cellSize * 1.2;
    ctx.drawImage(crown, finishCX - size / 2, finishCY - size / 2, size, size);
  }

  // 4. Walls
  drawWalls(ctx, wallSegments(maze, cellSize), board);

  // 5. Flags: coin images with a soft drop shadow
  for (const row of maze) {
    for (const cell of row) {
      if (!cell.flag) continue;
      const pixelX = cell.x * cellSize;
      const pixelY = cell.y * cellSize;
      const image = flagImages[cell.flag.typeId];
      if (isLoaded(image)) {
        const flagSize = cellSize * 0.74;
        const offset = (cellSize - flagSize) / 2;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(image, pixelX + offset, pixelY + offset, flagSize, flagSize);
        ctx.restore();
      } else {
        // Fallback until the image loads: a distinct color per flag type
        const flagColors = ["#FF5733", "#33FF57", "#3357FF", "#F033FF"];
        ctx.fillStyle = flagColors[(cell.flag.typeId - 1) % flagColors.length];
        const flagSize = cellSize * 0.4;
        const offset = (cellSize - flagSize) / 2;
        ctx.fillRect(pixelX + offset, pixelY + offset, flagSize, flagSize);
      }
    }
  }

  // 6. Players (current player drawn last so their sprite is on top)
  const waitingPlayers = players.filter((p) => !p.isCurrentTurn);
  const currentPlayer = players.find((p) => p.isCurrentTurn);

  const drawPlayer = (player: Player) => {
    const centerX = player.x * cellSize + cellSize / 2;
    const centerY = player.y * cellSize + cellSize / 2;
    const bob = player.isCurrentTurn ? Math.sin(time / 190) * 2.5 : 0;

    // Ground shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + cellSize * 0.32, cellSize * 0.28, cellSize * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight the current player with a glowing ring
    if (player.isCurrentTurn) {
      ctx.save();
      ctx.strokeStyle = board.activeRing;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = board.activeRing;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const image = playerImages[player.spriteId];
    if (isLoaded(image)) {
      // Scale the sprite to fit inside the cell, keeping its aspect ratio
      const maxSize = cellSize * 0.82;
      const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      ctx.drawImage(image, centerX - drawW / 2, centerY - drawH / 2 + bob - 1, drawW, drawH);
    } else {
      // Fallback until the image loads: a circle in the player's color
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = player.color;
      ctx.fill();
    }
  };

  waitingPlayers.forEach(drawPlayer);
  if (currentPlayer) drawPlayer(currentPlayer);

  ctx.restore();
}
