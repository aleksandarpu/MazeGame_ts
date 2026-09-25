import { appendFormattedText } from "./question-pop-up";

export type AnswerDetails = {
  answerText: string | null; // The chosen answer, null when the time ran out
  playerName?: string; // Set when showing someone else's answer
};

export function showResultPopup(
  container: HTMLElement,
  isCorrect: boolean,
  onDismiss: () => void,
  details: AnswerDetails = { answerText: null }
) {
  // 1. Create Overlay
  const overlay = document.createElement("div");
  overlay.id = "result-popup-overlay";
  Object.assign(overlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Arial, sans-serif",
    zIndex: "1000",
  });

  // 2. Create Modal Box with conditional styling
  const modal = document.createElement("div");
  const borderColor = isCorrect ? "#2ecc71" : "#e74c3c"; 
  const bgColor = isCorrect ? "#eafaf1" : "#fdedec";
  
  Object.assign(modal.style, {
    backgroundColor: bgColor,
    padding: "40px",
    borderRadius: "10px",
    border: `5px solid ${borderColor}`,
    width: "350px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    textAlign: "center",
    cursor: "pointer", // Indicates it can be clicked
  });

  // 3. Create Content
  const title = document.createElement("h2");
  title.innerText = isCorrect ? "Correct!" : "Wrong!";
  title.style.color = borderColor;
  title.style.margin = "0 0 15px 0";
  title.style.fontSize = "32px";

  // The chosen answer, green if correct, red if wrong
  const answerBox = document.createElement("div");
  Object.assign(answerBox.style, {
    padding: "12px",
    borderRadius: "5px",
    border: `2px solid ${borderColor}`,
    backgroundColor: isCorrect ? "#d4f5e2" : "#fadbd8",
    color: isCorrect ? "#1e8449" : "#c0392b",
    fontSize: "18px",
    fontWeight: "bold",
    textAlign: "left",
    marginBottom: "15px",
  });
  if (details.answerText === null) {
    answerBox.textContent = "Time's up: no answer";
  } else {
    appendFormattedText(answerBox, details.answerText);
  }

  const who = details.playerName;
  const message = document.createElement("p");
  message.innerText = isCorrect
    ? who ? `${who} gets +2 Score & +3 Steps!` : "+2 Score & +3 Steps!"
    : who ? `${who} lost the remaining steps.` : "You lost your remaining steps.";
  message.style.fontSize = "18px";
  message.style.color = "#333";
  message.style.marginBottom = "25px";

  const prompt = document.createElement("div");
  prompt.innerText = "Click, press Space, or press Enter to continue";
  prompt.style.fontSize = "14px";
  prompt.style.color = "#777";
  prompt.style.fontStyle = "italic";

  // Assemble
  modal.appendChild(title);
  modal.appendChild(answerBox);
  modal.appendChild(message);
  modal.appendChild(prompt);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  // 4. Dismissal Logic
  let isDismissed = false;
  let autoCloseTimeout: number;

  const closePopup = () => {
    if (isDismissed) return;
    isDismissed = true;
    
    clearTimeout(autoCloseTimeout);
    window.removeEventListener("keydown", handleKeyDown);
    container.removeChild(overlay);
    
    onDismiss();
  };

  // 6. Event Listeners for keyboard and mouse dismissal
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault(); // Prevent page scrolling
      closePopup();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  overlay.addEventListener("click", closePopup);

  // Auto-close both result variants after five seconds.
  autoCloseTimeout = window.setTimeout(() => {
    closePopup();
  }, 5000);
}