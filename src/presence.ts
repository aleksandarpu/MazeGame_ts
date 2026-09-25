import { ref, set, update, onValue, onDisconnect, serverTimestamp, Unsubscribe } from "firebase/database";
import { rtdb } from "./firebase_init";

// Presence lives in the Realtime Database at status/{userId}:
//   { name, state: "online" | "offline", roomId, lastChanged }
// onDisconnect() makes the Firebase server flip it to "offline" when the tab closes
// or the connection drops, so other clients can tell who is still here.

export type PresenceState = "online" | "offline";

export type UserPresence = {
  name: string;
  state: PresenceState;
  roomId: string | null; // Game room the user is in, null while in the lobby
  lastChanged: number;
};

// A fresh id per page load, so every tab is a separate player. It isn't stored in
// sessionStorage because "Duplicate tab" copies that, giving two tabs the same id.
const clientUserId = `uid_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Returns this page's user id. */
export function getClientUserId(): string {
  return clientUserId;
}

let currentUserId = "";
let currentName = "";
let currentRoomId: string | null = null;
let stopConnectedListener: Unsubscribe | null = null;

/**
 * Marks the user online and keeps it that way across reconnects.
 * Returns a function that marks the user offline and stops tracking.
 */
export function startPresence(userId: string, name: string): () => Promise<void> {
  stopConnectedListener?.();
  currentUserId = userId;
  currentName = name;
  currentRoomId = null;

  const userStatusRef = ref(rtdb, `status/${userId}`);
  // .info/connected is true while this client is connected to the Realtime Database
  const connectedRef = ref(rtdb, ".info/connected");

  stopConnectedListener = onValue(connectedRef, async (snap) => {
    if (snap.val() !== true) return;
    try {
      // Register the server-side offline write first, so a drop right after
      // going online still ends up as "offline".
      await onDisconnect(userStatusRef).update({
        state: "offline",
        lastChanged: serverTimestamp(),
      });
      await set(userStatusRef, {
        name: currentName,
        state: "online",
        roomId: currentRoomId,
        lastChanged: serverTimestamp(),
      });
    } catch (error) {
      console.error("Presence: could not write status", error);
    }
  });

  return async () => {
    stopConnectedListener?.();
    stopConnectedListener = null;
    await onDisconnect(userStatusRef).cancel();
    await update(userStatusRef, { state: "offline", lastChanged: serverTimestamp() });
  };
}

/** Records which game room the user is in (null = lobby). */
export async function setPresenceRoom(roomId: string | null): Promise<void> {
  currentRoomId = roomId;
  if (!currentUserId) return;
  await update(ref(rtdb, `status/${currentUserId}`), {
    roomId,
    lastChanged: serverTimestamp(),
  });
}

/** Calls back with every user's presence, keyed by user id, whenever any of it changes. */
export function watchPresence(onChange: (users: Record<string, UserPresence>) => void): Unsubscribe {
  return onValue(ref(rtdb, "status"), (snap) => {
    onChange((snap.val() ?? {}) as Record<string, UserPresence>);
  });
}
