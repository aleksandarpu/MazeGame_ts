import { renderLoginScreen } from "./login-screen";
import { renderLobbyScreen, LobbyRoom } from "./lobby-screen";
import { renderGameRoomScreen } from "./game-room-screen";
import { GameScreen, renderGamePlayScreen } from "./game";
import { GameState, syncedPart } from "./GameState";
import { gameStateFromDoc, saveGame, syncedFromDoc, watchGame } from "./games";
import { showResultPopup } from "./answer-pop-up";
import { showVictoryPopup as renderVictoryPopup } from "./victory-pop-up";
import { t } from "./i18n";
import { login, ServerError } from "./connection";
import {
  Room, RoomMember, sortedMembers, watchRooms, watchRoom, createRoom, joinRoom, leaveRoom, setMemberStatus,
} from "./rooms";

// Main Application Container
const appContainer = document.getElementById("app-container") as HTMLElement;

// Global Client State
const appState = {
  currentUserId: "",
  currentUserName: "",
  currentRoomId: "", // Id of the room the user is in, "" in the lobby
};

// Stops the current screen's server subscriptions / game loop before the next screen
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
  let busy = false;
  renderLoginScreen(appContainer, async (playerName: string) => {
    if (busy) return;
    busy = true;
    try {
      // Connects to the server, which tracks this tab's connection from now on.
      // If it drops for longer than the server waits, the page reloads to the login.
      appState.currentUserId = await login(playerName, () => {
        alert(t("connection.lost"));
        location.reload();
      });
      appState.currentUserName = playerName;
      navigateToLobby();
    } catch (error) {
      console.error("Could not log in", error);
      busy = false;
    }
  });
}

/** Leaves the current room on the server. */
async function leaveCurrentRoom() {
  const roomId = appState.currentRoomId;
  if (!roomId) return;
  appState.currentRoomId = "";
  try {
    await leaveRoom(roomId);
  } catch (error) {
    console.error("Rooms: could not leave the room", error);
  }
}

/**
 * 2. Lobby Controller
 */
function navigateToLobby() {
  leaveCurrentScreen();
  leaveCurrentRoom();

  const userName = appState.currentUserName;
  let busy = false; // A create / join is in progress

  const enterRoom = async (writeRoom: () => Promise<string>, failMessage: string) => {
    if (busy) return;
    busy = true;
    try {
      appState.currentRoomId = await writeRoom();
      navigateToGameRoom();
    } catch (error) {
      console.error(failMessage, error);
      const code = error instanceof ServerError ? error.code : "";
      alert(code === "notFound" || code === "started" || code === "full" ? t(`room.error.${code}`) : failMessage);
      busy = false;
    }
  };

  const handleCreateRoom = (roomName: string) => {
    enterRoom(() => createRoom(roomName), t("lobby.createFailed"));
  };

  const handleJoinRoom = (roomId: string) => {
    enterRoom(() => joinRoom(roomId).then(() => roomId), t("lobby.joinFailed"));
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
    // The screen redraws from the room update the server sends; once everyone
    // is ready the server starts the game and the room turns "started"
    setMemberStatus(roomId, newStatus).catch((error) => console.error("Rooms: could not change status", error));
  };

  stopCurrentScreen = watchRoom(roomId, (room) => {
    if (started) return;

    // Room deleted, or we were removed from it (e.g. after a long disconnect)
    if (!room || !room.players[userId]) {
      appState.currentRoomId = "";
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
  });
}

/**
 * 4. Game Play Controller
 *
 * The server keeps the game (created when the room started). The client whose turn
 * it is saves every change; the server sends it to the other clients.
 */
function navigateToGamePlay(roomId: string, gameId: string) {
  leaveCurrentScreen();

  const userId = appState.currentUserId;
  let gameState: GameState | null = null;
  let screen: GameScreen | null = null;
  let roomMembers: Record<string, RoomMember> | null = null;

  let savesInFlight = 0;
  const publish = () => {
    if (!gameState) return;
    savesInFlight++;
    saveGame(roomId, gameId, syncedPart(gameState))
      .catch((error) => {
        // Lost with the connection: save the latest state again once reconnected
        if (!(error instanceof ServerError)) publish();
        else console.error("Game: could not save", error);
      })
      .finally(() => savesInFlight--);
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

  const stopGame = watchGame(roomId, (game) => {
    if (!game || game.gameId !== gameId) return; // Deleted, or a later game of this room
    // While our saves are on the way, the server's copy is behind ours
    // (e.g. the current value it sends again after a reconnect)
    if (savesInFlight > 0 && gameState) return;
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

  const stopRoom = watchRoom(roomId, (room) => {
    if (!room) return;
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