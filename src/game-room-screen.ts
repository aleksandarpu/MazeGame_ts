import { createLanguagePicker, t } from "./i18n";

export type RoomPlayer = {
  id: string;
  name: string;
  status: "waiting" | "ready"; // each player has status waiting or ready
};

export function renderGameRoomScreen(
  container: HTMLElement,
  roomName: string,
  currentUserId: string,
  players: RoomPlayer[],
  onToggleStatus: (newStatus: "waiting" | "ready") => void,
  onLeave: () => void
) {
  // Clear container
  container.innerHTML = "";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.padding = "20px";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.color = "#333";
  container.style.backgroundColor = "#ecf0f1";
  container.style.height = "100%";
  container.style.boxSizing = "border-box";

  // 1. Header
  const header = document.createElement("h1");
  header.innerText = t("room.title", { name: roomName });
  header.style.borderBottom = "2px solid #bdc3c7";
  header.style.paddingBottom = "10px";
  container.appendChild(header);

  // Language switch: redraw this screen with the same data
  const languagePicker = createLanguagePicker(() =>
    renderGameRoomScreen(container, roomName, currentUserId, players, onToggleStatus, onLeave)
  );
  languagePicker.style.alignSelf = "flex-end";
  container.appendChild(languagePicker);

  // 2. Player List Section
  const listTitle = document.createElement("h2");
  listTitle.innerText = t("room.playersInRoom");
  container.appendChild(listTitle);

  const listContainer = document.createElement("div");
  Object.assign(listContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "30px",
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  });

  let allReady = true;

  // list players by name[cite: 1]
  players.forEach((player) => {
    if (player.status !== "ready") {
      allReady = false;
    }

    const playerRow = document.createElement("div");
    Object.assign(playerRow.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px",
      borderBottom: "1px solid #eee",
    });

    const nameNode = document.createElement("span");
    nameNode.innerText = player.id === currentUserId ? t("room.you", { name: player.name }) : player.name;
    nameNode.style.fontSize = "18px";
    nameNode.style.fontWeight = player.id === currentUserId ? "bold" : "normal";

    const statusWrapper = document.createElement("div");
    statusWrapper.style.display = "flex";
    statusWrapper.style.alignItems = "center";
    statusWrapper.style.gap = "15px";

    const statusText = document.createElement("span");
    statusText.innerText = t(player.status === "ready" ? "room.status.ready" : "room.status.waiting");
    statusText.style.fontWeight = "bold";
    statusText.style.color = player.status === "ready" ? "#27ae60" : "#f39c12";

    statusWrapper.appendChild(statusText);

    // user can change own status from initial waiting or ready[cite: 1]
    if (player.id === currentUserId) {
      const toggleBtn = document.createElement("button");
      toggleBtn.innerText = t(player.status === "ready" ? "room.setWaiting" : "room.setReady");
      Object.assign(toggleBtn.style, {
        padding: "8px 15px",
        fontSize: "14px",
        backgroundColor: player.status === "ready" ? "#e74c3c" : "#2ecc71",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
      });

      toggleBtn.onclick = () => {
        const newStatus = player.status === "ready" ? "waiting" : "ready";
        onToggleStatus(newStatus);
      };

      statusWrapper.appendChild(toggleBtn);
    }

    playerRow.appendChild(nameNode);
    playerRow.appendChild(statusWrapper);
    listContainer.appendChild(playerRow);
  });

  container.appendChild(listContainer);

  // 3. Game Start Status Message
  const statusMessage = document.createElement("div");
  Object.assign(statusMessage.style, {
    textAlign: "center",
    fontSize: "18px",
    fontWeight: "bold",
    color: allReady && players.length > 0 ? "#27ae60" : "#7f8c8d",
    marginTop: "20px",
  });

  if (players.length === 0) {
    statusMessage.innerText = t("room.waitingForPlayers");
  } else if (allReady) {
    statusMessage.innerText = t("room.allReady");
  } else {
    statusMessage.innerText = t("room.waitingForReady");
  }

  container.appendChild(statusMessage);

  // 4. Back to the lobby
  const leaveBtn = document.createElement("button");
  leaveBtn.innerText = t("room.leave");
  Object.assign(leaveBtn.style, {
    alignSelf: "center",
    marginTop: "25px",
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#7f8c8d",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  });
  leaveBtn.onclick = () => {
    leaveBtn.disabled = true;
    onLeave();
  };
  container.appendChild(leaveBtn);
}