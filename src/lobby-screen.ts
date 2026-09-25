import { createLanguagePicker, t } from "./i18n";
import { MAX_PLAYERS_PER_ROOM } from "./rooms";
import { injectScreenStyles } from "./screen-styles";

export type LobbyRoom = {
  id: string;
  name: string;
  players: string[]; // List of player names currently in the room
  status: "waiting" | "started";
};

function injectLobbyStyles() {
  if (document.getElementById("lobby-screen-styles")) return;
  const style = document.createElement("style");
  style.id = "lobby-screen-styles";
  style.textContent = `
    .ls-create { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
    .ls-input {
      flex: 1 1 220px;
      min-width: 0;
      padding: 12px 14px;
      border: 2px solid #d5dbdf;
      border-radius: 12px;
      font-family: inherit;
      font-size: 17px;
      color: #2c3e50;
      background: #fff;
      outline: none;
      transition: border-color 0.2s;
    }
    .ls-input:focus { border-color: #3498db; }
    .ls-create .sc-btn { flex: 0 1 auto; }
    .ls-list { display: flex; flex-direction: column; gap: 10px; }
    .ls-room {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      padding: 12px 14px;
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
    .ls-info { flex: 1 1 200px; min-width: 0; }
    .ls-name { font-size: 19px; font-weight: 600; overflow-wrap: anywhere; }
    .ls-players { font-size: 14px; color: #7f8c8d; overflow-wrap: anywhere; }
    .ls-count { flex: none; padding: 4px 12px; border-radius: 999px; background: #eaf2f8; color: #2471a3; font-weight: 700; font-size: 14px; }
    .ls-count.full { background: #fadbd8; color: #c0392b; }
    .ls-room .sc-btn { flex: 0 0 auto; padding: 10px 18px; font-size: 16px; }
    .ls-empty { margin: 0; padding: 18px; border: 2px dashed #bdc3c7; border-radius: 14px; text-align: center; font-style: italic; color: #95a5a6; }
  `;
  document.head.appendChild(style);
}

/**
 * Builds the lobby. Returns a function that redraws only the room list, so live
 * room updates don't wipe the room name being typed.
 */
export function renderLobbyScreen(
  container: HTMLElement,
  currentUserName: string,
  onCreateRoom: (roomName: string) => void,
  onJoinRoom: (roomId: string) => void
): (availableRooms: LobbyRoom[]) => void {
  // The last room list, so a language switch can redraw it
  let lastRooms: LobbyRoom[] | null = null;
  let updateRooms: (availableRooms: LobbyRoom[]) => void = () => {};

  const build = () => {
    injectScreenStyles();
    injectLobbyStyles();

    // Clear container (and styles an earlier screen put on it)
    container.innerHTML = "";
    container.removeAttribute("style");
    container.style.overflowY = "auto";

    const page = document.createElement("div");
    page.className = "sc-page";
    const card = document.createElement("div");
    card.className = "sc-card";
    page.appendChild(card);

    // 1. Header: welcome, language
    const head = document.createElement("div");
    head.className = "sc-head";
    const title = document.createElement("h1");
    title.className = "sc-title";
    title.innerText = t("lobby.welcome", { name: currentUserName });
    // Language switch: rebuild the whole screen in the new language
    head.append(title, createLanguagePicker(build));

    const body = document.createElement("div");
    body.className = "sc-body";

    // 2. Create New Room Section
    const createSection = document.createElement("div");
    createSection.className = "ls-create";

    const roomNameInput = document.createElement("input");
    roomNameInput.type = "text";
    roomNameInput.className = "ls-input";
    roomNameInput.placeholder = t("lobby.roomNamePlaceholder");
    roomNameInput.maxLength = 30;

    const createBtn = document.createElement("button");
    createBtn.className = "sc-btn green";
    createBtn.innerText = t("lobby.createRoom");

    const createRoom = () => {
      const name = roomNameInput.value.trim();
      if (name) {
        onCreateRoom(name); // User can create a new room and give it a name[cite: 1]
      } else {
        roomNameInput.focus();
      }
    };
    createBtn.onclick = createRoom;
    roomNameInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") createRoom();
    };

    createSection.append(roomNameInput, createBtn);

    // 3. Room List Section
    const roomListTitle = document.createElement("h2");
    roomListTitle.className = "sc-subtitle";
    roomListTitle.innerText = t("lobby.availableGames");

    const roomList = document.createElement("div");
    roomList.className = "ls-list";

    const loadingMsg = document.createElement("p");
    loadingMsg.className = "ls-empty";
    loadingMsg.innerText = t("lobby.loading");
    roomList.appendChild(loadingMsg);

    body.append(createSection, roomListTitle, roomList);
    card.append(head, body);
    container.appendChild(page);

    updateRooms = (availableRooms: LobbyRoom[]) => {
      lastRooms = availableRooms;
      roomList.replaceChildren();

      // Filter out rooms that have already started[cite: 1]
      const pendingRooms = availableRooms.filter((r) => r.status === "waiting");

      if (pendingRooms.length === 0) {
        const emptyMsg = document.createElement("p");
        emptyMsg.className = "ls-empty";
        emptyMsg.innerText = t("lobby.noRooms");
        roomList.appendChild(emptyMsg);
        return;
      }

      pendingRooms.forEach((room) => {
        const row = document.createElement("div");
        row.className = "ls-room";

        // Room Info (Name and Player List)
        const info = document.createElement("div");
        info.className = "ls-info";
        const name = document.createElement("div");
        name.className = "ls-name";
        name.innerText = room.name;
        const playerList = document.createElement("div");
        playerList.className = "ls-players";
        // List players in each room[cite: 1]
        playerList.innerText = t("lobby.players", { names: room.players.join(", ") || t("lobby.noPlayers") });
        info.append(name, playerList);

        // Limit number of players per game room to 6[cite: 1]
        const isFull = room.players.length >= MAX_PLAYERS_PER_ROOM;

        const count = document.createElement("span");
        count.className = isFull ? "ls-count full" : "ls-count";
        count.innerText = `${room.players.length} / ${MAX_PLAYERS_PER_ROOM}`;

        const joinBtn = document.createElement("button");
        joinBtn.className = "sc-btn blue";
        joinBtn.innerText = t("lobby.join");
        joinBtn.disabled = isFull;
        joinBtn.onclick = () => {
          if (!isFull) onJoinRoom(room.id); // User can join one of the game rooms[cite: 1]
        };

        row.append(info, count, joinBtn);
        roomList.appendChild(row);
      });
    };
    if (lastRooms) updateRooms(lastRooms);
  };

  build();
  return (availableRooms: LobbyRoom[]) => updateRooms(availableRooms);
}
