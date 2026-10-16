import type { SyncedGameState } from "./GameState";

// Messages between the browser (connection.ts) and the Node server (server/)
// over one WebSocket per tab. Shared by both sides, so it must not touch the DOM.

export const MAX_PLAYERS_PER_ROOM = 6;
export const MAX_NAME_LENGTH = 30;

export type RoomStatus = "waiting" | "started";
export type MemberStatus = "waiting" | "ready";

export type RoomMember = {
  name: string;
  status: MemberStatus;
  joinedAt: number; // Server time of the join; orders the players in the game
  isMock?: boolean; // Seeded fake player: always ready, never removed
};

export type Room = {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  isMock?: boolean; // Seeded room: never deleted, reset to its seed when the real players leave
  gameId: string; // Id of the game started in this room ("" before the start)
  players: Record<string, RoomMember>;
};

export type GameDoc = SyncedGameState & {
  gameId: string; // Same id as the room's gameId
  width: number;
  maze: string; // Cell[][] as JSON
  version: number; // Counts the changes to the game (set by the server); the newest copy has the highest
};

/** Error codes a request can fail with; the client shows t(`room.error.<code>`) for the room ones. */
export type ErrorCode = "notFound" | "started" | "full" | "badRequest" | "notAllowed" | "notLoggedIn" | "conflict";

// Client -> server. Every request carries an `id`; the server answers with a `reply` with the same id.
export type ClientRequest =
  | { type: "hello"; name: string } // Log in as a new user
  | { type: "resume"; userId: string; token: string } // Reconnect as the same user after a dropped connection
  | { type: "createRoom"; name: string; requestId: string } // A repeated request id gets the same room back
  | { type: "joinRoom"; roomId: string }
  | { type: "leaveRoom"; roomId: string }
  | { type: "setStatus"; roomId: string; status: MemberStatus }
  | { type: "saveGame"; roomId: string; gameId: string; state: SyncedGameState }
  | { type: "removePlayers"; roomId: string; gameId: string; playerIds: string[] } // Players who left the room
  | { type: "subscribe"; topic: Topic }
  | { type: "unsubscribe"; topic: Topic };

export type ClientMessage = ClientRequest & { id: number };

/** "rooms" = the room list, "room:<id>" = one room, "game:<roomId>" = the room's game. */
export type Topic = "rooms" | `room:${string}` | `game:${string}`;

export type ReplyData = {
  hello: { userId: string; token: string };
  resume: { userId: string; token: string };
  createRoom: { roomId: string };
  saveGame: { version: number }; // The game's version after the save
};

// Server -> client
export type ServerMessage =
  | { type: "reply"; id: number; ok: true; data?: unknown }
  | { type: "reply"; id: number; ok: false; error: ErrorCode }
  | { type: "rooms"; rooms: Room[] }
  | { type: "room"; roomId: string; room: Room | null }
  | { type: "game"; roomId: string; game: GameDoc | null };
