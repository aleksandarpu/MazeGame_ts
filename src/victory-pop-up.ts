export type PlayerStats = {
  id: string;
  name: string;
  color: string; // Acts as the sprite representation
  score: number;
};

export function showVictoryPopup(
  container: HTMLElement,
  players: PlayerStats[],
  onReturnToLobby: () => void
) {
  // Determine the winner based on the highest score, regardless of who finished
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const winner = sortedPlayers[0];

  // 1. Create Overlay
  const overlay = document.createElement("div");
  overlay.id = "victory-popup-overlay";
  Object.assign(overlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Arial, sans-serif",
    zIndex: "1000",
  });

  // 2. Create Modal Box
  const modal = document.createElement("div");
  Object.assign(modal.style, {
    backgroundColor: "#fff",
    padding: "40px",
    borderRadius: "15px",
    border: "6px solid #FFD700", // Gold border for victory
    width: "450px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    textAlign: "center",
    color: "#333",
  });

  // 3. Title & Winner Announcement
  const title = document.createElement("h1");
  title.innerText = "🏆 Match Finished! 🏆";
  title.style.margin = "0 0 10px 0";
  title.style.color = "#FF8C00";

  const winnerAnnouncement = document.createElement("h2");
  winnerAnnouncement.innerText = `${winner.name} Wins!`;
  winnerAnnouncement.style.margin = "0 0 25px 0";
  winnerAnnouncement.style.color = "#2c3e50";

  // 4. Player List Container
  const listContainer = document.createElement("div");
  Object.assign(listContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "30px",
    textAlign: "left",
  });

  // 5. Populate Player Rows with Sprite, Name, and Score
  sortedPlayers.forEach((player, index) => {
    const playerRow = document.createElement("div");
    Object.assign(playerRow.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 15px",
      backgroundColor: index === 0 ? "#FFF8DC" : "#f8f9fa", // Highlight winner row
      borderRadius: "8px",
      border: index === 0 ? "2px solid #FFD700" : "1px solid #ddd",
    });

    // Sprite and Name wrapper
    const leftSide = document.createElement("div");
    Object.assign(leftSide.style, {
      display: "flex",
      alignItems: "center",
      gap: "15px",
    });

    // Mockup Sprite using Canvas-like color dot
    const spriteNode = document.createElement("div");
    Object.assign(spriteNode.style, {
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      backgroundColor: player.color,
      border: "2px solid #333",
    });

    const nameNode = document.createElement("span");
    nameNode.innerText = index === 0 ? `👑 ${player.name}` : player.name;
    nameNode.style.fontWeight = "bold";
    nameNode.style.fontSize = "18px";

    leftSide.appendChild(spriteNode);
    leftSide.appendChild(nameNode);

    // Score Node
    const scoreNode = document.createElement("span");
    scoreNode.innerText = `${player.score} pts`;
    scoreNode.style.fontWeight = "bold";
    scoreNode.style.fontSize = "18px";
    scoreNode.style.color = "#27ae60";

    playerRow.appendChild(leftSide);
    playerRow.appendChild(scoreNode);
    listContainer.appendChild(playerRow);
  });

  // 6. Return Button
  const returnBtn = document.createElement("button");
  returnBtn.innerText = "Return to Lobby";
  Object.assign(returnBtn.style, {
    padding: "12px 25px",
    fontSize: "18px",
    backgroundColor: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
  });

  returnBtn.onmouseover = () => (returnBtn.style.backgroundColor = "#2980b9");
  returnBtn.onmouseleave = () => (returnBtn.style.backgroundColor = "#3498db");
  
  returnBtn.onclick = () => {
    container.removeChild(overlay);
    onReturnToLobby();
  };

  // Assemble
  modal.appendChild(title);
  modal.appendChild(winnerAnnouncement);
  modal.appendChild(listContainer);
  modal.appendChild(returnBtn);
  overlay.appendChild(modal);
  container.appendChild(overlay);
}