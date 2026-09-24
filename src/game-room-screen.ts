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
  onToggleStatus: (newStatus: "waiting" | "ready") => void
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
  header.innerText = `Room: ${roomName}`;
  header.style.borderBottom = "2px solid #bdc3c7";
  header.style.paddingBottom = "10px";
  container.appendChild(header);

  // 2. Player List Section
  const listTitle = document.createElement("h2");
  listTitle.innerText = "Players in Room";
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
    nameNode.innerText = player.id === currentUserId ? `${player.name} (You)` : player.name;
    nameNode.style.fontSize = "18px";
    nameNode.style.fontWeight = player.id === currentUserId ? "bold" : "normal";

    const statusWrapper = document.createElement("div");
    statusWrapper.style.display = "flex";
    statusWrapper.style.alignItems = "center";
    statusWrapper.style.gap = "15px";

    const statusText = document.createElement("span");
    statusText.innerText = player.status.toUpperCase();
    statusText.style.fontWeight = "bold";
    statusText.style.color = player.status === "ready" ? "#27ae60" : "#f39c12";

    statusWrapper.appendChild(statusText);

    // user can change own status from initial waiting or ready[cite: 1]
    if (player.id === currentUserId) {
      const toggleBtn = document.createElement("button");
      toggleBtn.innerText = player.status === "ready" ? "Set Waiting" : "Set Ready";
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
    statusMessage.innerText = "Waiting for players to join...";
  } else if (allReady) {
    statusMessage.innerText = "All players ready! Starting game...";
  } else {
    statusMessage.innerText = "Waiting for all players to be ready...";
  }

  container.appendChild(statusMessage);
}