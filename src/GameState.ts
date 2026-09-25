import { Cell } from "./maze_generator";
import { Player } from "./player";
import type { ActiveQuestion } from "./question-pop-up";

// "roll": waiting for the current player's dice; "move": walking the rolled steps;
// "question": answering a flag's question; "finished": someone reached the finish.
export type GamePhase = "roll" | "move" | "question" | "finished";

export type GameState = {
  maze: Cell[][];
  players: Player[]; // Assumes Player type has `steps: number` and `score: number`
  width: number;
  phase: GamePhase;
  rollCount: number; // +1 each time the current player starts rolling (spectators start their dice)
  lastRoll: number; // Value of the latest roll, 0 while the dice is still rolling
  answerCount: number; // +1 per answered question (spectators show the result)
  lastAnswerCorrect: boolean;
  lastAnswerText: string | null; // The chosen answer, null when the time ran out
  question: ActiveQuestion | null; // Question on screen (phase "question"), shown to every player
  winnerId: string | null;
};

/** The parts of GameState that change during the game (everything but the maze). */
export type SyncedGameState = Omit<GameState, "maze" | "width">;

export function syncedPart(state: GameState): SyncedGameState {
  const { maze, width, ...rest } = state;
  return rest;
}
