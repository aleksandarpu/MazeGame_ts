import { randomBytes } from "node:crypto";
import { Db } from "./db";
import { buildNewGame } from "../src/game_setup";
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
   * Creates the mock rooms and clears what a restart left behind: every connection
   * is gone, so all users are offline and all real players leave their rooms.
   */
  async init(): Promise<void> {
    await this.db.transaction(async () => {
      await this.db.run("UPDATE users SET state = 'offline', room_id = NULL, last_changed = ?", [Date.now()]);
      await this.db.run("DELETE FROM room_players WHERE is_mock = 0");
      await this.db.run("DELETE FROM rooms WHERE is_mock = 0");
      for (const seed of mockRoomSeeds) await this.resetMockRoom(seed);
    });
  }

  private async resetMockRoom(seed: (typeof mockRoomSeeds)[number]) {
    await this.db.run("DELETE FROM rooms WHERE id = ?", [seed.id]); // Cascades to its players and game
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
    return { gameId: row.game_id, width: row.width, maze: row.maze, ...(JSON.parse(row.state) as SyncedGameState) };
  }

  // ==========================================
  // ROOM ACTIONS
  // ==========================================

  async createRoom(userId: string, roomName: string): Promise<{ roomId: string; changes: Changes }> {
    return this.db.transaction(async () => {
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
  }

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
      else await this.db.run("DELETE FROM rooms WHERE id = ?", [roomId]);
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
   * Saves the changing part of the game. Allowed for the player who controls the current
   * turn (a mock player's turn is played by the first real player), and for the first real
   * player still in the room, who removes players who left.
   */
  async saveGame(userId: string, roomId: string, gameId: string, state: SyncedGameState): Promise<void> {
    if (!isSyncedState(state)) throw new RequestError("badRequest");
    await this.db.transaction(async () => {
      const room = await this.getRoom(roomId);
      const game = await this.getGame(roomId);
      if (!room || !game || room.gameId !== gameId || game.gameId !== gameId) throw new RequestError("notFound");
      if (!room.players[userId] || game.phase === "finished") throw new RequestError("notAllowed");

      const current = game.players.find((p) => p.isCurrentTurn);
      const firstReal = game.players.find((p) => !p.isMock)?.id;
      const controller = current?.isMock ? firstReal : current?.id;
      const keeper = game.players.find((p) => !p.isMock && room.players[p.id])?.id;
      if (userId !== controller && userId !== keeper) throw new RequestError("notAllowed");

      // Players can be removed from the game, never added
      const known = new Set(game.players.map((p) => p.id));
      if (!state.players.every((p) => known.has(p.id))) throw new RequestError("badRequest");

      await this.db.run("UPDATE games SET state = ? WHERE room_id = ?", [JSON.stringify(state), roomId]);
    });
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

const phases = new Set(["roll", "move", "question", "finished"]);

/** Shape check of a saved game state (the client is not trusted). */
function isSyncedState(value: any): value is SyncedGameState {
  return (
    !!value && typeof value === "object" &&
    Array.isArray(value.players) && value.players.length <= MAX_PLAYERS_PER_ROOM &&
    value.players.every((p: any) =>
      p && typeof p.id === "string" && typeof p.name === "string" &&
      Number.isInteger(p.x) && Number.isInteger(p.y) &&
      typeof p.score === "number" && typeof p.steps === "number" && typeof p.isCurrentTurn === "boolean") &&
    phases.has(value.phase) &&
    typeof value.rollCount === "number" && typeof value.lastRoll === "number" &&
    typeof value.answerCount === "number" && typeof value.lastAnswerCorrect === "boolean" &&
    (value.lastAnswerText === null || typeof value.lastAnswerText === "string") &&
    (value.question === null || typeof value.question === "object") &&
    (value.winnerId === null || typeof value.winnerId === "string")
  );
}
