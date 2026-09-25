import { renderLoginScreen } from "./login-screen";
import { renderLobbyScreen, LobbyRoom } from "./lobby-screen";
import { renderGameRoomScreen } from "./game-room-screen";
import { GameScreen, renderGamePlayScreen } from "./game";
import { GameState, syncedPart } from "./GameState";
import { gameStateFromDoc, saveGame, syncedFromDoc, watchGame } from "./games";
import { showResultPopup } from "./answer-pop-up";
import { showVictoryPopup as renderVictoryPopup } from "./victory-pop-up";
import { getClientUserId, startPresence, setPresenceRoom } from "./presence";
import {
  Room, RoomMember, sortedMembers, seedMockRooms, watchRooms, watchRoom, newRoomId, createRoom,
  joinRoom, leaveRoom, setMemberStatus, startRoomIfAllReady, startRoomCleanup,
} from "./rooms";

//const path = require('path');
// Inside your server code, pointing to root index.html from dist/
//res.sendFile(path.join(__dirname, '../index.html'));

// Main Application Container
const appContainer = document.getElementById("app-container") as HTMLElement;

// Global Client State
const appState = {
  currentUserId: "",
  currentUserName: "",
  currentRoomId: "", // Firestore gameRooms id the user is in, "" in the lobby
};

// Stops the current screen's Firestore listeners / game loop before the next screen
let stopCurrentScreen: (() => void) | null = null;
function leaveCurrentScreen() {
  stopCurrentScreen?.();
  stopCurrentScreen = null;
}

// ==========================================
// ROUTER & SCREEN CONTROLLERS
// ==========================================

/**
 * 1. Login Controller
 */
function navigateToLogin() {
  renderLoginScreen(appContainer, (playerName: string) => {
    appState.currentUserId = getClientUserId();
    appState.currentUserName = playerName;
    // Track the connection in the Realtime Database (status/{userId})
    startPresence(appState.currentUserId, playerName);
    // Remove disconnected players from rooms, delete rooms left empty
    startRoomCleanup();
    seedMockRooms().catch((error) => console.error("Rooms: could not create the mock rooms", error));

    // After successful login go to lobby screen[cite: 1]
    navigateToLobby();
  });
}

/** Leaves the current room in Firestore first, then clears the room from presence. */
async function leaveCurrentRoom() {
  const roomId = appState.currentRoomId;
  if (!roomId) return;
  appState.currentRoomId = "";
  try {
    await leaveRoom(roomId, appState.currentUserId);
  } catch (error) {
    console.error("Rooms: could not leave the room", error);
  }
  setPresenceRoom(null).catch((error) => console.error("Presence: could not clear the room", error));
}

/**
 * 2. Lobby Controller
 */
function navigateToLobby() {
  leaveCurrentScreen();
  leaveCurrentRoom();

  const userId = appState.currentUserId;
  const userName = appState.currentUserName;
  let busy = false; // A create / join is in progress

  // Presence points at the room before the room lists the player, so the
  // cleanup never sees a room player whose presence says "in the lobby".
  const enterRoom = async (roomId: string, writeRoom: () => Promise<void>, failMessage: string) => {
    if (busy) return;
    busy = true;
    try {
      await setPresenceRoom(roomId);
      await writeRoom();
      appState.currentRoomId = roomId;
      navigateToGameRoom();
    } catch (error) {
      console.error(failMessage, error);
      alert(error instanceof Error && !(error as any).code ? error.message : failMessage);
      setPresenceRoom(null).catch(() => {});
      busy = false;
    }
  };

  const handleCreateRoom = (roomName: string) => {
    const roomId = newRoomId();
    enterRoom(roomId, () => createRoom(roomId, roomName, userId, userName), "Could not create the room.");
  };

  const handleJoinRoom = (roomId: string) => {
    enterRoom(roomId, () => joinRoom(roomId, userId, userName), "Could not join the room.");
  };

  const updateRooms = renderLobbyScreen(appContainer, userName, handleCreateRoom, handleJoinRoom);

  const toLobbyRoom = (room: Room): LobbyRoom => ({
    id: room.id,
    name: room.name,
    players: sortedMembers(room).map((member) => member.name),
    status: room.status,
  });
  stopCurrentScreen = watchRooms((rooms) => updateRooms(rooms.map(toLobbyRoom)));
}

/**
 * 3. Game Room Controller
 */
function navigateToGameRoom() {
  leaveCurrentScreen();

  const roomId = appState.currentRoomId;
  const userId = appState.currentUserId;
  let started = false;

  const handleToggleStatus = (newStatus: "waiting" | "ready") => {
    // The screen redraws from the room snapshot once Firestore has the change
    setMemberStatus(roomId, userId, newStatus).catch((error) => console.error("Rooms: could not change status", error));
  };

  stopCurrentScreen = watchRoom(roomId, (room, fromCache) => {
    if (started) return;

    // Room deleted, or we were removed from it (e.g. by the cleanup after a disconnect).
    // Only trust the server here: right after joining, the cached room may not list us yet.
    if (!room || !room.players[userId]) {
      if (fromCache) return;
      appState.currentRoomId = "";
      setPresenceRoom(null).catch(() => {});
      navigateToLobby();
      return;
    }

    const members = sortedMembers(room);

    // When all players in the room are ready the game starts[cite: 1]
    if (room.status === "started") {
      started = true;
      navigateToGamePlay(roomId, room.gameId);
      return;
    }

    renderGameRoomScreen(
      appContainer,
      room.name,
      userId,
      members.map((member) => ({ id: member.id, name: member.name, status: member.status })),
      handleToggleStatus,
      navigateToLobby
    );

    if (members.every((member) => member.status === "ready")) {
      startRoomIfAllReady(roomId).catch((error) => console.error("Rooms: could not start the game", error));
    }
  });
}

/**
 * 4. Game Play Controller
 *
 * The game lives in Firestore (gameRooms/{roomId}/game/state, created when the room started).
 * The client whose turn it is saves every change; all clients follow the snapshots.
 */
function navigateToGamePlay(roomId: string, gameId: string) {
  leaveCurrentScreen();

  const userId = appState.currentUserId;
  let gameState: GameState | null = null;
  let screen: GameScreen | null = null;
  let roomMembers: Record<string, RoomMember> | null = null;

  const publish = () => {
    if (!gameState) return;
    saveGame(roomId, syncedPart(gameState)).catch((error) => console.error("Game: could not save", error));
  };

  const showVictoryPopup = () => {
    const players = gameState?.players ?? [];
    leaveCurrentScreen();
    renderVictoryPopup(appContainer, players, navigateToLobby);
  };

  // Players who left the room (closed tab, removed by the cleanup) leave the game too.
  // One client does it: the first real player still in the room.
  const dropPlayersWhoLeft = () => {
    if (!gameState || !screen || !roomMembers || gameState.phase === "finished") return;
    const members = roomMembers;
    const gone = gameState.players.filter((p) => !p.isMock && !members[p.id]).map((p) => p.id);
    if (gone.length === 0) return;
    const keeper = gameState.players.find((p) => !p.isMock && members[p.id]);
    if (keeper?.id === userId) screen.removePlayers(gone);
  };

  const stopGame = watchGame(roomId, (game, ownPending) => {
    if (!game || game.gameId !== gameId) return; // Not created yet, or a previous game of this room
    if (ownPending && gameState) return; // Echo of our own saves; gameState is already ahead of it
    if (!gameState) {
      gameState = gameStateFromDoc(game);
      screen = renderGamePlayScreen(appContainer, gameState, {
        localUserId: userId,
        publish,
        showVictoryPopup,
        showAnswerResult: (isCorrect, details, onDismiss) => showResultPopup(appContainer, isCorrect, onDismiss, details),
      });
      dropPlayersWhoLeft();
    } else {
      screen?.applyRemote(syncedFromDoc(game));
    }
  });

  const stopRoom = watchRoom(roomId, (room, fromCache) => {
    if (!room || fromCache) return;
    roomMembers = room.players;
    dropPlayersWhoLeft();
  });

  stopCurrentScreen = () => {
    stopGame();
    stopRoom();
    screen?.cleanup();
  };
}

// ==========================================
// APP INITIALIZATION
// ==========================================

// Start the app on the login screen
navigateToLogin();