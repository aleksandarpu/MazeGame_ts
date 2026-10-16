import { request, subscribe } from "./connection";
import { GameState, SyncedGameState } from "./GameState";
import { Cell } from "./maze_generator";
import type { GameDoc } from "./protocol";

// The running game is kept by the server (games table), created when the room starts
// (game_setup.ts). Only the client whose turn it is saves (see game.ts `publish`);
// the server sends each save to the room's other clients.

export type { GameDoc } from "./protocol";

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

/** Calls back with the room's game (null if there is none) and whenever another player saves it. */
export function watchGame(roomId: string, onChange: (game: GameDoc | null) => void): () => void {
  return subscribe(`game:${roomId}`, (message) => {
    if (message.type === "game") onChange(message.game);
  });
}

/** Saves the changing part of the game. */
export async function saveGame(roomId: string, gameId: string, state: SyncedGameState): Promise<void> {
  await request({ type: "saveGame", roomId, gameId, state });
}

/** Asks the server for the stored game again; it answers on the watch of watchGame. */
export async function refreshGame(roomId: string): Promise<void> {
  await request({ type: "subscribe", topic: `game:${roomId}` });
}

/** Asks the server to drop players who left the room from the game (the server decides the rest). */
export async function removeGamePlayers(roomId: string, gameId: string, playerIds: string[]): Promise<void> {
  await request({ type: "removePlayers", roomId, gameId, playerIds });
}
