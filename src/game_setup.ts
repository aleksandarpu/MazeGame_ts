import { generateBraidedMaze } from "./maze_generator";
import { placeFlagsInMaze } from "./place_flags_in_maze";
import { Player } from "./player";
import type { GameDoc } from "./protocol";

// Builds a new game. Runs on the server (server/store.ts) when every room player is ready.

export const MAZE_SIZE = 15;
const playerColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

/** A new game for the room's players (in join order; the first one starts). */
export function buildNewGame(gameId: string, members: { id: string; name: string; isMock?: boolean }[]): GameDoc {
  const maze = generateBraidedMaze(MAZE_SIZE, MAZE_SIZE);
  placeFlagsInMaze(maze, 4, 8);
  const players: Player[] = members.map((member, index) => ({
    id: member.id,
    name: member.name,
    x: 0,
    y: MAZE_SIZE - 1,
    color: playerColors[index % playerColors.length],
    spriteId: (index % 6) + 1,
    score: 0,
    steps: 0,
    isCurrentTurn: index === 0,
    isMock: member.isMock === true,
  }));
  return {
    gameId,
    width: MAZE_SIZE,
    maze: JSON.stringify(maze),
    players,
    phase: "roll",
    rollCount: 0,
    lastRoll: 0,
    answerCount: 0,
    lastAnswerCorrect: false,
    lastAnswerText: null,
    question: null,
    winnerId: null,
  };
}
