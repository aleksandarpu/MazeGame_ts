export type LobbyRoom = {
  id: string;
  name: string;
  players: string[]; // List of player names currently in the room
  status: "waiting" | "started";
};

export function renderLobbyScreen(
  container: HTMLElement,
  currentUserName: string,
  availableRooms: LobbyRoom[],
  onCreateRoom: (roomName: string) => void,
  onJoinRoom: (roomId: string) => void
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
  header.innerText = `Lobby - Welcome, ${currentUserName}!`;
  header.style.borderBottom = "2px solid #bdc3c7";
  header.style.paddingBottom = "10px";
  container.appendChild(header);

  // 2. Create New Room Section
  const createSection = document.createElement("div");
  Object.assign(createSection.style, {
    display: "flex",
    gap: "10px",
    marginBottom: "30px",
    marginTop: "20px",
  });

  const roomNameInput = document.createElement("input");
  roomNameInput.type = "text";
  roomNameInput.placeholder = "Enter new room name...";
  Object.assign(roomNameInput.style, {
    padding: "10px",
    fontSize: "16px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    flexGrow: "1",
    maxWidth: "300px",
  });

  const createBtn = document.createElement("button");
  createBtn.innerText = "Create Room";
  Object.assign(createBtn.style, {
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#27ae60",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  });

  createBtn.onclick = () => {
    const name = roomNameInput.value.trim();
    if (name) {
      onCreateRoom(name); // User can create a new room and give it a name[cite: 1]
    }
  };

  createSection.appendChild(roomNameInput);
  createSection.appendChild(createBtn);
  container.appendChild(createSection);

  // 3. Room List Section
  const roomListTitle = document.createElement("h2");
  roomListTitle.innerText = "Available Games";
  container.appendChild(roomListTitle);

  const roomListContainer = document.createElement("div");
  Object.assign(roomListContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "15px",
    overflowY: "auto",
  });

  // Filter out rooms that have already started[cite: 1]
  const pendingRooms = availableRooms.filter((r) => r.status === "waiting");

  if (pendingRooms.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.innerText = "No open rooms available. Create one to start playing!";
    emptyMsg.style.fontStyle = "italic";
    roomListContainer.appendChild(emptyMsg);
  } else {
    pendingRooms.forEach((room) => {
      const roomCard = document.createElement("div");
      Object.assign(roomCard.style, {
        backgroundColor: "#fff",
        padding: "15px",
        borderRadius: "8px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      });

      // Room Info (Name and Player List)
      const roomInfo = document.createElement("div");
      
      const roomName = document.createElement("div");
      roomName.innerText = room.name;
      roomName.style.fontWeight = "bold";
      roomName.style.fontSize = "18px";
      roomName.style.marginBottom = "5px";

      const playerList = document.createElement("div");
      // List players in each room[cite: 1]
      playerList.innerText = `Players: ${room.players.join(", ") || "None"}`; 
      playerList.style.fontSize = "14px";
      playerList.style.color = "#7f8c8d";

      roomInfo.appendChild(roomName);
      roomInfo.appendChild(playerList);

      // Join Controls
      const joinControls = document.createElement("div");
      joinControls.style.display = "flex";
      joinControls.style.alignItems = "center";
      joinControls.style.gap = "15px";

      const playerCount = document.createElement("span");
      playerCount.innerText = `${room.players.length} / 6`;
      playerCount.style.fontWeight = "bold";

      const joinBtn = document.createElement("button");
      joinBtn.innerText = "Join Game";
      
      // Limit number of players per game room to 6[cite: 1]
      const isFull = room.players.length >= 6; 
      
      Object.assign(joinBtn.style, {
        padding: "10px 20px",
        fontSize: "16px",
        backgroundColor: isFull ? "#95a5a6" : "#2980b9",
        color: "#fff",
        border: "none",
        borderRadius: "5px",
        cursor: isFull ? "not-allowed" : "pointer",
      });
      joinBtn.disabled = isFull;

      joinBtn.onclick = () => {
        if (!isFull) {
          onJoinRoom(room.id); // User can join one of the game rooms[cite: 1]
        }
      };

      joinControls.appendChild(playerCount);
      joinControls.appendChild(joinBtn);

      roomCard.appendChild(roomInfo);
      roomCard.appendChild(joinControls);
      roomListContainer.appendChild(roomCard);
    });
  }

  container.appendChild(roomListContainer);
}