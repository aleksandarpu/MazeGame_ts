import { doc, onSnapshot, setDoc, Transaction, Unsubscribe } from "firebase/firestore";
import { db } from "./firebase_init";
import { GameState, SyncedGameState } from "./GameState";
import { Cell, generateBraidedMaze } from "./maze_generator";
import { placeFlagsInMaze } from "./place_flags_in_maze";
import { Player } from "./player";

// Firestore: gameRooms/{roomId}/game/state holds the running game:
//   { gameId, width, maze (JSON string), players, phase, rollCount, lastRoll,
//     question, answerCount, lastAnswerCorrect, lastAnswerText, winnerId }
// The maze is a JSON string because Firestore doesn't allow nested arrays.
// Only the client whose turn it is writes (see game.ts `publish`); the others follow the snapshots.

export const MAZE_SIZE = 15;
const playerColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

export type GameDoc = SyncedGameState & {
  gameId: string; // Same id as the room's gameId, so a stale cached game from before is ignored
  width: number;
  maze: string;
};

export function gameRef(roomId: string) {
  return doc(db, "gameRooms", roomId, "game", "state");
}

/** A new game for the room's players (in join order; the first one starts). */
export function buildNewGame(gameId: string, members: { id: string; name: string; isMock?: boolean }[]): GameDoc {
  const maze = generateBraidedMaze(MAZE_SIZE, MAZE_SIZE);
  placeFlagsInMaze(maze, 4, 2);
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

export function createGameInTransaction(tx: Transaction, roomId: string, game: GameDoc) {
  tx.set(gameRef(roomId), game);
}

export function deleteGameInTransaction(tx: Transaction, roomId: string) {
  tx.delete(gameRef(roomId));
}

export function gameStateFromDoc(game: GameDoc): GameState {
  return {
    maze: JSON.parse(game.maze) as Cell[][],
    width: game.width,
    ...syncedFromDoc(game),
  };
}

export function syncedFromDoc(game: GameDoc): SyncedGameState {
  return {
    players: game.players.map((p) => ({ ...p })),
    phase: game.phase,
    rollCount: game.rollCount,
    lastRoll: game.lastRoll,
    answerCount: game.answerCount,
    lastAnswerCorrect: game.lastAnswerCorrect,
    lastAnswerText: game.lastAnswerText ?? null,
    question: game.question ?? null,
    winnerId: game.winnerId,
  };
}

/**
 * Calls back with the game whenever it changes. Check `gameId`: the cache may still hold
 * the room's previous game. `ownPending` is true when the data includes our own saves the
 * server hasn't confirmed yet; such a snapshot only echoes local changes and may be behind them.
 */
export function watchGame(roomId: string, onChange: (game: GameDoc | null, ownPending: boolean) => void): Unsubscribe {
  return onSnapshot(
    gameRef(roomId),
    (snap) => onChange(snap.exists() ? (snap.data() as GameDoc) : null, snap.metadata.hasPendingWrites),
    (error) => console.error("Game: could not load the game", error)
  );
}

/** Writes the changing part of the game. */
export async function saveGame(roomId: string, state: SyncedGameState): Promise<void> {
  await setDoc(gameRef(roomId), state, { merge: true });
}
