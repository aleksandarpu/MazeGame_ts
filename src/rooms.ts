import { request, subscribe } from "./connection";
import { MemberStatus, Room, RoomMember } from "./protocol";

// Rooms live on the server (server/store.ts, SQLite). This module sends the requests
// and follows the updates the server pushes. The server removes players whose tab
// closed or whose connection died, deletes rooms left empty, resets the mock rooms
// and starts the game once every player is ready.

export { MAX_PLAYERS_PER_ROOM } from "./protocol";
export type { Room, RoomMember, RoomStatus, MemberStatus } from "./protocol";

/** Room players sorted in join order (the same order on every client). */
export function sortedMembers(room: Room): (RoomMember & { id: string })[] {
  return Object.entries(room.players ?? {})
    .map(([id, member]) => ({ id, ...member }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

/** Calls back with all rooms whenever any of them changes. */
export function watchRooms(onChange: (rooms: Room[]) => void): () => void {
  return subscribe("rooms", (message) => {
    if (message.type === "rooms") onChange(message.rooms);
  });
}

/** Calls back with the room, or null once it has been deleted. */
export function watchRoom(roomId: string, onChange: (room: Room | null) => void): () => void {
  return subscribe(`room:${roomId}`, (message) => {
    if (message.type === "room") onChange(message.room);
  });
}

/** Creates the room with the user in it and returns its id. Leaves any other room. */
export async function createRoom(name: string): Promise<string> {
  const { roomId } = await request({ type: "createRoom", name });
  return roomId;
}

/** Adds the user to the room. Rejects with a ServerError ("notFound", "started", "full") if it can't. */
export async function joinRoom(roomId: string): Promise<void> {
  await request({ type: "joinRoom", roomId });
}

export async function leaveRoom(roomId: string): Promise<void> {
  await request({ type: "leaveRoom", roomId });
}

/** The server starts the game when this makes every player ready. */
export async function setMemberStatus(roomId: string, status: MemberStatus): Promise<void> {
  await request({ type: "setStatus", roomId, status });
}
