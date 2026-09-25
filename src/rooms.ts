import {
  collection, doc, onSnapshot, runTransaction, setDoc, deleteField, serverTimestamp, Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase_init";
import { UserPresence, watchPresence } from "./presence";

// Firestore: gameRooms/{roomId}
//   { name, status, hostId, createdAt, isMock?, players: { [userId]: RoomMember } }
// Players are a map keyed by user id, so joining / leaving / toggling ready
// touches one field (players.<userId>) instead of rewriting an array.

export const MAX_PLAYERS_PER_ROOM = 6;

export type RoomStatus = "waiting" | "started";
export type MemberStatus = "waiting" | "ready";

export type RoomMember = {
  name: string;
  status: MemberStatus;
  joinedAt: number; // Date.now() of the joining client; orders the players in the game
  isMock?: boolean; // Seeded fake player: always ready, never removed by the cleanup
};

export type Room = {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  isMock?: boolean; // Seeded room: never deleted, reset to its seed when the real players leave
  players: Record<string, RoomMember>;
};

const roomsCollection = collection(db, "gameRooms");

/** Room players sorted in join order (the same order on every client). */
export function sortedMembers(room: Room): (RoomMember & { id: string })[] {
  return Object.entries(room.players ?? {})
    .map(([id, member]) => ({ id, ...member }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function toRoom(id: string, data: any): Room {
  return {
    id,
    name: data.name ?? "",
    status: data.status ?? "waiting",
    hostId: data.hostId ?? "",
    isMock: data.isMock === true,
    players: data.players ?? {},
  };
}

// ==========================================
// MOCK ROOMS
// ==========================================

// Kept in Firestore for now so a single tab can try out the flow: their fake
// players are always ready, so the game starts as soon as you're ready too.
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

function mockRoomData(seed: (typeof mockRoomSeeds)[number]) {
  return { name: seed.name, status: "waiting", hostId: "", isMock: true, players: seed.players };
}

/** Creates the mock rooms if they don't exist yet. */
export async function seedMockRooms(): Promise<void> {
  await Promise.all(mockRoomSeeds.map((seed) =>
    runTransaction(db, async (tx) => {
      const ref = doc(roomsCollection, seed.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        tx.set(ref, { ...mockRoomData(seed), createdAt: serverTimestamp() });
      }
    })
  ));
}

// ==========================================
// LISTENERS
// ==========================================

/** Calls back with all rooms whenever any of them changes. */
export function watchRooms(onChange: (rooms: Room[]) => void): Unsubscribe {
  return onSnapshot(
    roomsCollection,
    (snap) => onChange(snap.docs.map((d) => toRoom(d.id, d.data()))),
    (error) => console.error("Rooms: could not load the room list", error)
  );
}

/** Calls back with the room, or null once it has been deleted. */
export function watchRoom(roomId: string, onChange: (room: Room | null) => void): Unsubscribe {
  return onSnapshot(
    doc(roomsCollection, roomId),
    (snap) => onChange(snap.exists() ? toRoom(snap.id, snap.data()) : null),
    (error) => console.error("Rooms: could not load the room", error)
  );
}

// ==========================================
// ACTIONS
// ==========================================

/** Id for a new room, so presence can point at it before the room is written. */
export function newRoomId(): string {
  return doc(roomsCollection).id;
}

export async function createRoom(roomId: string, name: string, userId: string, userName: string): Promise<void> {
  await setDoc(doc(roomsCollection, roomId), {
    name,
    status: "waiting",
    hostId: userId,
    createdAt: serverTimestamp(),
    players: {
      [userId]: { name: userName, status: "waiting", joinedAt: Date.now() },
    },
  });
}

/** Adds the user to the room. Throws an Error with a message for the user if it can't. */
export async function joinRoom(roomId: string, userId: string, userName: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(roomsCollection, roomId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("This room no longer exists.");
    const room = toRoom(snap.id, snap.data());
    if (room.players[userId]) return; // Already in it
    if (room.status !== "waiting") throw new Error("This game has already started.");
    if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) throw new Error("This room is full.");
    tx.update(ref, {
      [`players.${userId}`]: { name: userName, status: "waiting", joinedAt: Date.now() },
    });
  });
}

/**
 * Removes players from the room. When no real players are left, the room is
 * deleted, or reset to its seed if it's a mock room.
 */
export async function removePlayers(roomId: string, userIds: string[]): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(roomsCollection, roomId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = toRoom(snap.id, snap.data());
    const leaving = userIds.filter((id) => room.players[id]);
    const realLeft = Object.entries(room.players)
      .filter(([id, member]) => !member.isMock && !leaving.includes(id));
    // Nothing to do, unless it's a leftover real room with no real players
    if (leaving.length === 0 && (room.isMock || realLeft.length > 0)) return;

    if (realLeft.length === 0) {
      const seed = mockRoomSeeds.find((s) => s.id === roomId);
      if (room.isMock && seed) tx.update(ref, mockRoomData(seed));
      else tx.delete(ref);
      return;
    }

    const updates: Record<string, unknown> = {};
    leaving.forEach((id) => (updates[`players.${id}`] = deleteField()));
    if (leaving.includes(room.hostId)) updates.hostId = realLeft[0][0];
    tx.update(ref, updates);
  });
}

export function leaveRoom(roomId: string, userId: string): Promise<void> {
  return removePlayers(roomId, [userId]);
}

export async function setMemberStatus(roomId: string, userId: string, status: MemberStatus): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(roomsCollection, roomId);
    const snap = await tx.get(ref);
    if (!snap.exists() || !snap.data().players?.[userId]) return;
    tx.update(ref, { [`players.${userId}.status`]: status });
  });
}

/** Marks the room started if every player is still ready. Safe to call from every client. */
export async function startRoomIfAllReady(roomId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(roomsCollection, roomId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = toRoom(snap.id, snap.data());
    const members = Object.values(room.players);
    if (room.status !== "waiting" || members.length === 0) return;
    if (!members.every((m) => m.status === "ready")) return;
    tx.update(ref, { status: "started", startedAt: serverTimestamp() });
  });
}

// ==========================================
// CLEANUP OF DISCONNECTED PLAYERS
// ==========================================

// A closed tab can't write to Firestore, so every logged-in client watches
// presence and removes room players who are offline or are now elsewhere.
// Players who joined in the last few seconds are skipped, because their presence
// update and their Firestore join can arrive in either order.
const JOIN_GRACE_MS = 15000;

export function startRoomCleanup(): () => void {
  let presence: Record<string, UserPresence> | null = null;
  let rooms: Room[] | null = null;
  const pending = new Set<string>(); // Rooms with a cleanup transaction in flight

  const sweep = () => {
    if (!presence || !rooms) return;
    const now = Date.now();
    for (const room of rooms) {
      const gone = Object.entries(room.players)
        .filter(([id, member]) => {
          if (member.isMock || now - member.joinedAt < JOIN_GRACE_MS) return false;
          const user = presence![id];
          return !user || user.state !== "online" || user.roomId !== room.id;
        })
        .map(([id]) => id);
      const abandoned = !room.isMock && Object.values(room.players).every((m) => m.isMock);
      if ((gone.length === 0 && !abandoned) || pending.has(room.id)) continue;
      pending.add(room.id);
      removePlayers(room.id, gone)
        .catch((error) => console.error("Rooms: cleanup failed", error))
        .finally(() => pending.delete(room.id));
    }
  };

  const stopPresence = watchPresence((users) => { presence = users; sweep(); });
  const stopRooms = watchRooms((list) => { rooms = list; sweep(); });
  // Re-check now and then, so players inside the grace period get handled later
  const timer = window.setInterval(sweep, JOIN_GRACE_MS);

  return () => {
    stopPresence();
    stopRooms();
    window.clearInterval(timer);
  };
}
