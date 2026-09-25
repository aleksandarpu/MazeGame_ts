import { createLanguagePicker, t } from "./i18n";
import { getPlayerImageUrl } from "./render_maze";
import { MAX_PLAYERS_PER_ROOM } from "./rooms";
import { injectScreenStyles } from "./screen-styles";

export type RoomPlayer = {
  id: string;
  name: string;
  status: "waiting" | "ready"; // each player has status waiting or ready
};

function injectRoomStyles() {
  if (document.getElementById("room-screen-styles")) return;
  const style = document.createElement("style");
  style.id = "room-screen-styles";
  style.textContent = `
    .rs-list { display: flex; flex-direction: column; gap: 10px; }
    .rs-row {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 8px 14px;
      box-sizing: border-box;
      background: #fff;
      border: 2px solid transparent;
      border-radius: 14px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
    .rs-row.me { border-color: #3498db; }
    .rs-row.free { background: transparent; border: 2px dashed #bdc3c7; box-shadow: none; color: #95a5a6; }
    .rs-avatar { width: 44px; height: 44px; object-fit: contain; flex: none; }
    .rs-avatar-empty { width: 44px; height: 44px; flex: none; border-radius: 50%; background: #dfe6e9; }
    .rs-name { flex: 1; min-width: 0; font-size: 19px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-row.free .rs-name { font-weight: 400; font-style: italic; }
    .rs-pill { flex: none; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
    .rs-pill.ready { background: #d4f5e2; color: #1e8449; }
    .rs-pill.waiting { background: #fdebd0; color: #b9770e; }
    .rs-status {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      min-height: 84px; /* same height whatever the message, so nothing below moves */
      margin-top: 20px;
      padding: 14px 18px;
      box-sizing: border-box;
      background: #fff;
      border-radius: 14px;
      text-align: center;
    }
    .rs-status-text { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 18px; font-weight: 600; color: #7f8c8d; }
    .rs-status.go .rs-status-text { color: #1e8449; }
    .rs-pulse { width: 10px; height: 10px; flex: none; border-radius: 50%; background: #f39c12; animation: rs-pulse 1.2s ease-in-out infinite; }
    .rs-status.go .rs-pulse { background: #27ae60; }
    .rs-progress { height: 8px; border-radius: 999px; background: #ecf0f1; overflow: hidden; }
    .rs-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #f39c12, #27ae60); transition: width 0.3s ease; }
    .rs-ready-count { font-size: 14px; color: #95a5a6; }
    .rs-leave { flex: 0 1 auto; }
    .rs-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
    @keyframes rs-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }
  `;
  document.head.appendChild(style);
}

export function renderGameRoomScreen(
  container: HTMLElement,
  roomName: string,
  currentUserId: string,
  players: RoomPlayer[],
  onToggleStatus: (newStatus: "waiting" | "ready") => void,
  onLeave: () => void
) {
  injectScreenStyles();
  injectRoomStyles();

  // Clear container (and styles an earlier screen put on it)
  container.innerHTML = "";
  container.removeAttribute("style");
  container.style.overflowY = "auto";

  const page = document.createElement("div");
  page.className = "sc-page";
  const card = document.createElement("div");
  card.className = "sc-card";
  page.appendChild(card);

  // 1. Header: room name, player count, language
  const head = document.createElement("div");
  head.className = "sc-head";
  const title = document.createElement("h1");
  title.className = "sc-title";
  title.innerText = t("room.title", { name: roomName });
  const count = document.createElement("span");
  count.className = "sc-count";
  count.innerText = `${players.length} / ${MAX_PLAYERS_PER_ROOM}`;
  // Language switch: redraw this screen with the same data
  const languagePicker = createLanguagePicker(() =>
    renderGameRoomScreen(container, roomName, currentUserId, players, onToggleStatus, onLeave)
  );
  head.append(title, count, languagePicker);

  const body = document.createElement("div");
  body.className = "sc-body";

  // 2. Player list[cite: 1], with free spots up to the room limit
  const listTitle = document.createElement("h2");
  listTitle.className = "sc-subtitle";
  listTitle.innerText = t("room.playersInRoom");

  const list = document.createElement("div");
  list.className = "rs-list";

  players.forEach((player, index) => {
    const isMe = player.id === currentUserId;
    const row = document.createElement("div");
    row.className = isMe ? "rs-row me" : "rs-row";

    // The sprite this player gets in the game (players get them in join order)
    const spriteUrl = getPlayerImageUrl((index % 6) + 1);
    const avatar = document.createElement(spriteUrl ? "img" : "div");
    if (avatar instanceof HTMLImageElement && spriteUrl) {
      avatar.src = spriteUrl;
      avatar.alt = "";
      avatar.className = "rs-avatar";
    } else {
      avatar.className = "rs-avatar-empty";
    }

    const name = document.createElement("span");
    name.className = "rs-name";
    name.innerText = isMe ? t("room.you", { name: player.name }) : player.name;

    const pill = document.createElement("span");
    pill.className = `rs-pill ${player.status}`;
    pill.innerText = t(player.status === "ready" ? "room.status.ready" : "room.status.waiting");

    row.append(avatar, name, pill);
    list.appendChild(row);
  });

  for (let i = players.length; i < MAX_PLAYERS_PER_ROOM; i++) {
    const row = document.createElement("div");
    row.className = "rs-row free";
    const avatar = document.createElement("div");
    avatar.className = "rs-avatar-empty";
    const name = document.createElement("span");
    name.className = "rs-name";
    name.innerText = t("room.freeSlot");
    row.append(avatar, name);
    list.appendChild(row);
  }

  // 3. Game start status: fixed-height box with a ready progress bar
  const readyCount = players.filter((p) => p.status === "ready").length;
  const allReady = players.length > 0 && readyCount === players.length;

  const status = document.createElement("div");
  status.className = allReady ? "rs-status go" : "rs-status";
  const statusText = document.createElement("div");
  statusText.className = "rs-status-text";
  const pulse = document.createElement("span");
  pulse.className = "rs-pulse";
  const statusLabel = document.createElement("span");
  if (players.length === 0) {
    statusLabel.innerText = t("room.waitingForPlayers");
  } else if (allReady) {
    statusLabel.innerText = t("room.allReady");
  } else {
    statusLabel.innerText = t("room.waitingForReady");
  }
  statusText.append(pulse, statusLabel);

  const progress = document.createElement("div");
  progress.className = "rs-progress";
  const progressFill = document.createElement("div");
  progressFill.className = "rs-progress-fill";
  progressFill.style.width = players.length ? `${(readyCount / players.length) * 100}%` : "0%";
  progress.appendChild(progressFill);

  const readyText = document.createElement("div");
  readyText.className = "rs-ready-count";
  readyText.innerText = t("room.readyCount", { ready: readyCount, total: players.length });

  status.append(statusText, progress, readyText);

  // 4. Actions: toggle own status[cite: 1], back to the lobby
  const actions = document.createElement("div");
  actions.className = "rs-actions";

  const me = players.find((p) => p.id === currentUserId);
  if (me) {
    const toggleBtn = document.createElement("button");
    toggleBtn.className = me.status === "ready" ? "sc-btn orange" : "sc-btn green";
    toggleBtn.innerText = t(me.status === "ready" ? "room.setWaiting" : "room.setReady");
    // The screen redraws with the new status once Firestore has the change
    toggleBtn.onclick = () => onToggleStatus(me.status === "ready" ? "waiting" : "ready");
    actions.appendChild(toggleBtn);
  }

  const leaveBtn = document.createElement("button");
  leaveBtn.className = "sc-btn grey rs-leave";
  leaveBtn.innerText = t("room.leave");
  leaveBtn.onclick = () => {
    leaveBtn.disabled = true;
    onLeave();
  };
  actions.appendChild(leaveBtn);

  body.append(listTitle, list, status, actions);
  card.append(head, body);
  container.appendChild(page);
}
