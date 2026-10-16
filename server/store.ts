import { randomBytes } from "node:crypto";
import { Db } from "./db";
import { buildNewGame, PLAYER_COLORS, SPRITE_COUNT } from "../src/game_setup";
import type { SyncedGameState } from "../src/GameState";
import {
  ErrorCode, GameDoc, MAX_NAME_LENGTH, MAX_PLAYERS_PER_ROOM, MemberStatus, Room, RoomMember,
} from "../src/protocol";

// Rooms, games and users, stored in SQLite. The server is the only writer, so every
// rule (6 players max, one room per user, who may save the game) is checked here.
// Callers run one operation at a time (see `serialize` in index.ts); each one is a transaction.

export class RequestError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

/** Rooms whose room / game data changed, so their subscribers get the new version. */
export type Changes = { rooms: Set<string>; games: Set<string> };

export function noChanges(): Changes {
  return { rooms: new Set(), games: new Set() };
}

export const newId = (bytes = 10) => randomBytes(bytes).toString("hex");

// How long a create request id is remembered (a retry comes within seconds)
const CREATE_MEMORY_MS = 10 * 60 * 1000;

// ==========================================
// MOCK ROOMS
// ==========================================

// Their fake players are always ready, so a single tab can start a game.
const mockRoomSeeds: { id: string; name: string; players: Record<string, RoomMember> }[] = [
  {
    id: "mock_alpha",
    name: "Alpha Room",
    players: {
      mock_alice: { name: "Alice", status: "ready", joinedAt: 1, isMock: true },
      mock_bob: { name: "Bob", status: "ready", joinedAt: 2, isMock: true },
    },
  },
  {
    id: "mock_beta",
    name: "Beta Room",
    players: {
      mock_charlie: { name: "Charlie", status: "ready", joinedAt: 1, isMock: true },
    },
  },
];

type RoomRow = { id: string; name: string; status: string; host_id: string; is_mock: number; game_id: string };
type PlayerRow = { room_id: string; user_id: string; name: string; status: string; joined_at: number; is_mock: number };
type GameRow = { room_id: string; game_id: string; width: number; maze: string; state: string };

export function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new RequestError("badRequest");
  const name = value.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new RequestError("badRequest");
  return name;
}

export class Store {
  constructor(private db: Db) {}

  /**
   * Creates missing mock rooms and marks every user offline (no connections yet after a
   * start). Rooms and games are kept: their players can resume after a restart or a
   * redeploy, and the server removes those who don't come back (sweep in index.ts).
   */
  async init(): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run("UPDATE users SET state = 'offline', last_changed = ?", [Date.now()]);
      for (const seed of mockRoomSeeds) {
        if (!(await this.getRoom(seed.id))) await this.resetMockRoom(seed);
      }
    });
  }

  /** Ids of all real players in rooms. */
  async playersInRooms(): Promise<string[]> {
    const rows = await this.db.all<{ user_id: string }>("SELECT DISTINCT user_id FROM room_players WHERE is_mock = 0");
    return rows.map((row) => row.user_id);
  }

  private async resetMockRoom(seed: (typeof mockRoomSeeds)[number]) {
    await this.deleteRoom(seed.id);
    await this.db.run(
      "INSERT INTO rooms (id, name, status, host_id, is_mock, game_id, created_at) VALUES (?, ?, 'waiting', '', 1, '', 0)",
      [seed.id, seed.name] // created_at 0: first in the list, and stays there after a reset
    );
    for (const [userId, member] of Object.entries(seed.players)) {
      await this.db.run(
        "INSERT INTO room_players (room_id, user_id, name, status, joined_at, is_mock) VALUES (?, ?, ?, ?, ?, 1)",
        [seed.id, userId, member.name, member.status, member.joinedAt]
      );
    }
  }

  /** Deletes the room with its players and game. */
  private async deleteRoom(roomId: string) {
    await this.db.run("DELETE FROM room_players WHERE room_id = ?", [roomId]);
    await this.db.run("DELETE FROM games WHERE room_id = ?", [roomId]);
    await this.db.run("DELETE FROM rooms WHERE id = ?", [roomId]);
  }

  // ==========================================
  // USERS (presence)
  // ==========================================

  async createUser(name: string): Promise<{ userId: string; token: string }> {
    const userId = `uid_${newId(8)}`;
    const token = newId(24);
    await this.db.run(
      "INSERT INTO users (id, name, token, state, room_id, last_changed) VALUES (?, ?, ?, 'online', NULL, ?)",
      [userId, name, token, Date.now()]
    );
    return { userId, token };
  }

  /** True if the user exists and the token is theirs. */
  async checkToken(userId: string, token: string): Promise<boolean> {
    const row = await this.db.get<{ token: string }>("SELECT token FROM users WHERE id = ?", [userId]);
    return !!row && typeof token === "string" && row.token === token;
  }

  async setUserState(userId: string, state: "online" | "offline"): Promise<void> {
    await this.db.run("UPDATE users SET state = ?, last_changed = ? WHERE id = ?", [state, Date.now(), userId]);
  }

  async userName(userId: string): Promise<string> {
    const row = await this.db.get<{ name: string }>("SELECT name FROM users WHERE id = ?", [userId]);
    if (!row) throw new RequestError("notLoggedIn");
    return row.name;
  }

  /** True if the user is a real player in the room. */
  async isInRoom(userId: string, roomId: string): Promise<boolean> {
    const row = await this.db.get<{ user_id: string }>(
      "SELECT user_id FROM room_players WHERE room_id = ? AND user_id = ? AND is_mock = 0", [roomId, userId]
    );
    return !!row;
  }

  /** Rooms that list the user as a player. */
  async roomsOfUser(userId: string): Promise<string[]> {
    const rows = await this.db.all<{ room_id: string }>(
      "SELECT room_id FROM room_players WHERE user_id = ? AND is_mock = 0", [userId]
    );
    return rows.map((row) => row.room_id);
  }

  // ==========================================
  // READS
  // ==========================================

  async listRooms(): Promise<Room[]> {
    const rooms = await this.db.all<RoomRow>("SELECT * FROM rooms ORDER BY created_at");
    const players = await this.db.all<PlayerRow>("SELECT * FROM room_players");
    return rooms.map((row) => toRoom(row, players.filter((p) => p.room_id === row.id)));
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const row = await this.db.get<RoomRow>("SELECT * FROM rooms WHERE id = ?", [roomId]);
    if (!row) return null;
    const players = await this.db.all<PlayerRow>("SELECT * FROM room_players WHERE room_id = ?", [roomId]);
    return toRoom(row, players);
  }

  async getGame(roomId: string): Promise<GameDoc | null> {
    const row = await this.db.get<GameRow>("SELECT * FROM games WHERE room_id = ?", [roomId]);
    if (!row) return null;
    // The columns are the game's details; they come last so nothing in the state can replace them
    const stored = JSON.parse(row.state) as SyncedGameState & { version?: number };
    return { ...stored, gameId: row.game_id, width: row.width, maze: row.maze, version: stored.version ?? 0 };
  }

  // ==========================================
  // ROOM ACTIONS
  // ==========================================

  /**
   * Creates a room for the user. The client sends a request id with each attempt: if the reply
   * was lost and the attempt is sent again, the room made by the first one is returned (while the
   * user is still in it), so one click never makes two rooms.
   */
  async createRoom(userId: string, roomName: string, requestId: string): Promise<{ roomId: string; changes: Changes }> {
    if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) {
      throw new RequestError("badRequest");
    }
    const key = `${userId}:${requestId}`;
    const now = Date.now();
    for (const [old, made] of this.createdByRequest) {
      if (now - made.at > CREATE_MEMORY_MS) this.createdByRequest.delete(old);
    }
    const earlier = this.createdByRequest.get(key);
    if (earlier && (await this.getRoom(earlier.roomId))?.players[userId]) {
      return { roomId: earlier.roomId, changes: noChanges() };
    }

    const result = await this.db.transaction(async () => {
      const changes = await this.leaveAllRooms(userId);
      const roomId = newId();
      await this.db.run(
        "INSERT INTO rooms (id, name, status, host_id, is_mock, game_id, created_at) VALUES (?, ?, 'waiting', ?, 0, '', ?)",
        [roomId, roomName, userId, Date.now()]
      );
      await this.addPlayer(roomId, userId);
      changes.rooms.add(roomId);
      return { roomId, changes };
    });
    this.createdByRequest.set(key, { roomId: result.roomId, at: now });
    return result;
  }

  // Rooms created by a request id, kept for a while so a repeated create gets the same room
  private createdByRequest = new Map<string, { roomId: string; at: number }>();

  async joinRoom(userId: string, roomId: string): Promise<Changes> {
    return this.db.transaction(async () => {
      const room = await this.getRoom(roomId);
      if (!room) throw new RequestError("notFound");
      if (room.players[userId]) return noChanges(); // Already in it
      if (room.status !== "waiting") throw new RequestError("started");
      if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) throw new RequestError("full");
      const changes = await this.leaveAllRooms(userId);
      await this.addPlayer(roomId, userId);
      changes.rooms.add(roomId);
      return changes;
    });
  }

  private async addPlayer(roomId: string, userId: string) {
    const name = await this.userName(userId);
    await this.db.run(
      "INSERT INTO room_players (room_id, user_id, name, status, joined_at, is_mock) VALUES (?, ?, ?, 'waiting', ?, 0)",
      [roomId, userId, name, Date.now()]
    );
    await this.db.run("UPDATE users SET room_id = ?, last_changed = ? WHERE id = ?", [roomId, Date.now(), userId]);
  }

  /** Removes the user from every room (a user is in at most one). */
  async leaveAllRooms(userId: string): Promise<Changes> {
    const changes = noChanges();
    for (const roomId of await this.roomsOfUser(userId)) {
      merge(changes, await this.removePlayers(roomId, [userId]));
    }
    return changes;
  }

  async leaveRoom(userId: string, roomId: string): Promise<Changes> {
    return this.db.transaction(() => this.removePlayers(roomId, [userId]));
  }

  /** leaveAllRooms in its own transaction (a closed connection). */
  async disconnect(userId: string): Promise<Changes> {
    return this.db.transaction(() => this.leaveAllRooms(userId));
  }

  /**
   * Removes players from the room. When no real players are left, the room is
   * deleted, or reset to its seed if it's a mock room. Call inside a transaction.
   */
  private async removePlayers(roomId: string, userIds: string[]): Promise<Changes> {
    const changes = noChanges();
    const room = await this.getRoom(roomId);
    if (!room) return changes;
    const leaving = userIds.filter((id) => room.players[id] && !room.players[id].isMock);
    if (leaving.length === 0) return changes;

    for (const userId of leaving) {
      await this.db.run("DELETE FROM room_players WHERE room_id = ? AND user_id = ?", [roomId, userId]);
      await this.db.run("UPDATE users SET room_id = NULL, last_changed = ? WHERE id = ? AND room_id = ?",
        [Date.now(), userId, roomId]);
    }
    changes.rooms.add(roomId);

    const realLeft = sortMembers(room).filter((m) => !m.isMock && !leaving.includes(m.id));
    if (realLeft.length === 0) {
      const seed = mockRoomSeeds.find((s) => s.id === roomId);
      if (room.isMock && seed) await this.resetMockRoom(seed);
      else await this.deleteRoom(roomId);
      changes.games.add(roomId); // The game (if any) went with it
      return changes;
    }
    if (leaving.includes(room.hostId)) {
      await this.db.run("UPDATE rooms SET host_id = ? WHERE id = ?", [realLeft[0].id, roomId]);
    }
    return changes;
  }

  /** Sets the player's ready status, and starts the game once every player is ready. */
  async setStatus(userId: string, roomId: string, status: MemberStatus): Promise<Changes> {
    if (status !== "waiting" && status !== "ready") throw new RequestError("badRequest");
    return this.db.transaction(async () => {
      const room = await this.getRoom(roomId);
      if (!room || !room.players[userId]) throw new RequestError("notFound");
      if (room.status !== "waiting") return noChanges();
      await this.db.run("UPDATE room_players SET status = ? WHERE room_id = ? AND user_id = ?", [status, roomId, userId]);
      room.players[userId].status = status;

      const changes = noChanges();
      changes.rooms.add(roomId);
      if (Object.values(room.players).every((m) => m.status === "ready")) {
        const gameId = newId();
        const game = buildNewGame(gameId, sortMembers(room));
        const { gameId: _, width, maze, ...state } = game;
        await this.db.run("DELETE FROM games WHERE room_id = ?", [roomId]);
        await this.db.run("INSERT INTO games (room_id, game_id, width, maze, state) VALUES (?, ?, ?, ?, ?)",
          [roomId, gameId, width, maze, JSON.stringify(state)]);
        await this.db.run("UPDATE rooms SET status = 'started', game_id = ? WHERE id = ?", [gameId, roomId]);
        changes.games.add(roomId);
      }
      return changes;
    });
  }

  // ==========================================
  // GAME
  // ==========================================

  /**
   * Saves the changing part of the game (positions, scores, turn, phase). Only the player who
   * controls the current turn may save (a mock player's turn is played by the first real player).
   * The player list is not changed here: the server keeps its own, so a save made from an
   * older copy can't bring back a removed player (removeGamePlayers does the removals).
   */
  async saveGame(userId: string, roomId: string, gameId: string, state: SyncedGameState): Promise<number> {
    if (!isSyncedState(state)) throw new RequestError("badRequest");
    return this.db.transaction(async () => {
      const room = await this.getRoom(roomId);
      const game = await this.getGame(roomId);
      if (!room || !game || room.gameId !== gameId || game.gameId !== gameId) throw new RequestError("notFound");
      if (!room.players[userId] || game.phase === "finished") throw new RequestError("notAllowed");

      const current = game.players.find((p) => p.isCurrentTurn);
      const firstReal = game.players.find((p) => !p.isMock)?.id;
      const controller = current?.isMock ? firstReal : current?.id;
      if (userId !== controller) throw new RequestError("notAllowed");

      // Every player still in the game must be in the save (only removeGamePlayers takes players out)
      if (!game.players.every((stored) => state.players.some((p) => p.id === stored.id))) {
        throw new RequestError("badRequest");
      }
      // Each stored player, with the controller's version of it
      const players = game.players.map((stored) => state.players.find((p) => p.id === stored.id) ?? stored);
      // The controller's copy can be older than a removal made meanwhile. If its turn now points
      // at a player who is gone (or at nobody), refuse it: the controller reloads the game.
      const holders = players.filter((p) => p.isCurrentTurn);
      if (holders.length !== 1 || (state.winnerId !== null && !players.some((p) => p.id === state.winnerId))) {
        throw new RequestError("conflict");
      }
      // The version counts the changes to the game; clients use it to tell newer copies from older ones
      const version = game.version + 1;
      await this.db.run("UPDATE games SET state = ? WHERE room_id = ?", [JSON.stringify({ ...state, players, version }), roomId]);
      return version;
    });
  }

  /**
   * Drops players who left the room from the game, and passes the turn on if it was theirs.
   * Only the first real player still in the room may ask, and only for players who are gone.
   * Ids already out of the game are skipped, so a repeated request changes nothing.
   */
  async removeGamePlayers(userId: string, roomId: string, gameId: string, playerIds: string[]): Promise<Changes> {
    if (!Array.isArray(playerIds) || !playerIds.every((id) => typeof id === "string")) {
      throw new RequestError("badRequest");
    }
    const changes = noChanges();
    await this.db.transaction(async () => {
      const room = await this.getRoom(roomId);
      const game = await this.getGame(roomId);
      if (!room || !game || room.gameId !== gameId || game.gameId !== gameId) throw new RequestError("notFound");
      if (!room.players[userId] || game.phase === "finished") throw new RequestError("notAllowed");
      const keeper = game.players.find((p) => !p.isMock && room.players[p.id])?.id;
      if (userId !== keeper) throw new RequestError("notAllowed");

      const gone = new Set(
        game.players.filter((p) => !p.isMock && !room.players[p.id] && playerIds.includes(p.id)).map((p) => p.id)
      );
      if (gone.size === 0) return;
      const version = game.version + 1;
      await this.db.run("UPDATE games SET state = ? WHERE room_id = ?", [JSON.stringify({ ...withoutPlayers(game, gone), version }), roomId]);
      changes.games.add(roomId);
    });
    return changes;
  }
}

// ==========================================
// HELPERS
// ==========================================

function toRoom(row: RoomRow, players: PlayerRow[]): Room {
  const members: Record<string, RoomMember> = {};
  for (const p of players) {
    members[p.user_id] = {
      name: p.name,
      status: p.status === "ready" ? "ready" : "waiting",
      joinedAt: p.joined_at,
      ...(p.is_mock ? { isMock: true } : {}),
    };
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status === "started" ? "started" : "waiting",
    hostId: row.host_id,
    isMock: row.is_mock === 1,
    gameId: row.game_id,
    players: members,
  };
}

function sortMembers(room: Room): (RoomMember & { id: string })[] {
  return Object.entries(room.players)
    .map(([id, member]) => ({ id, ...member }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function merge(into: Changes, from: Changes) {
  from.rooms.forEach((id) => into.rooms.add(id));
  from.games.forEach((id) => into.games.add(id));
}

/**
 * The game's changing state without the players in `gone`. If one of them had the turn, it
 * passes to the player who came after them (the same rule the game screen used).
 */
function withoutPlayers(game: GameDoc, gone: Set<string>): SyncedGameState {
  const { gameId: _, width, maze, ...state } = game;
  const currentIndex = state.players.findIndex((p) => p.isCurrentTurn);
  const current = state.players[currentIndex];
  const players = state.players.filter((p) => !gone.has(p.id));
  if (current && gone.has(current.id)) {
    const next = players[currentIndex % players.length];
    players.forEach((p) => (p.isCurrentTurn = p === next));
    next.steps = 0;
    return { ...state, players, phase: "roll", lastRoll: 0, question: null };
  }
  return { ...state, players };
}

const phases = new Set(["roll", "move", "question", "finished"]);

/** Shape check of a saved game state (the client is not trusted). */
const syncedKeys = new Set(["players", "phase", "rollCount", "lastRoll", "answerCount", "lastAnswerCorrect", "lastAnswerText", "question", "winnerId"]);
const playerKeys = new Set(["id", "name", "x", "y", "color", "spriteId", "isCurrentTurn", "steps", "score", "isMock"]);
const questionKeys = new Set(["flagTypeId", "ordNum", "answerOrder", "timeLimit"]);

/** True if every key of the object is one of `allowed` (unknown fields are refused, not stored). */
const onlyKeys = (value: object, allowed: Set<string>) => Object.keys(value).every((key) => allowed.has(key));

/** Shape check of a saved game state (the client is not trusted). Only the changing fields are accepted. */
function isSyncedState(value: any): value is SyncedGameState {
  return (
    !!value && typeof value === "object" && onlyKeys(value, syncedKeys) &&
    Array.isArray(value.players) && value.players.length <= MAX_PLAYERS_PER_ROOM &&
    value.players.every((p: any) =>
      p && typeof p === "object" && onlyKeys(p, playerKeys) &&
      typeof p.id === "string" && typeof p.name === "string" &&
      Number.isInteger(p.x) && Number.isInteger(p.y) &&
      typeof p.score === "number" && typeof p.steps === "number" && typeof p.isCurrentTurn === "boolean" &&
      PLAYER_COLORS.includes(p.color) && Number.isInteger(p.spriteId) && p.spriteId >= 1 && p.spriteId <= SPRITE_COUNT) &&
    phases.has(value.phase) &&
    typeof value.rollCount === "number" && typeof value.lastRoll === "number" &&
    typeof value.answerCount === "number" && typeof value.lastAnswerCorrect === "boolean" &&
    (value.lastAnswerText === null || typeof value.lastAnswerText === "string") &&
    (value.question === null || (typeof value.question === "object" && onlyKeys(value.question, questionKeys))) &&
    (value.winnerId === null || typeof value.winnerId === "string")
  );
}
