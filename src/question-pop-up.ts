import { getRandomQuestion } from "./questions";

// The correct answer is always listed first in the question files
const CORRECT_ANSWER_INDEX = 0;

/**
 * Fills `target` with `text`, turning "\n" into line breaks and
 * *marked* words into red spans. Uses text nodes, so the text is never parsed as HTML.
 */
function appendFormattedText(target: HTMLElement, text: string) {
  text.split("\n").forEach((line, lineIndex) => {
    if (lineIndex > 0) target.appendChild(document.createElement("br"));

    const parts = line.split("*");
    // An odd part count means every "*" is paired; otherwise leave the text as-is
    if (parts.length % 2 === 0) {
      target.appendChild(document.createTextNode(line));
      return;
    }

    parts.forEach((part, partIndex) => {
      if (!part) return;
      if (partIndex % 2 === 1) {
        const marked = document.createElement("span");
        marked.style.color = "red";
        marked.textContent = part;
        target.appendChild(marked);
      } else {
        target.appendChild(document.createTextNode(part));
      }
    });
  });
}

export function createQuestionPopup(
  container: HTMLElement,
  flagTypeId: number,
  timeLimitSeconds: number = 30,
  onResolve: (isCorrect: boolean, isTimeout: boolean) => void
) {
  const question = getRandomQuestion(flagTypeId);
  if (!question) {
    // No question available for this flag: treat as not answered
    onResolve(false, false);
    return;
  }
  const timeLimit = question.time ?? timeLimitSeconds;

  // 1. Create Overlay Container
  const overlay = document.createElement("div");
  overlay.id = "question-popup-overlay";
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

  // 2. Create Modal Box
  const modal = document.createElement("div");
  Object.assign(modal.style, {
    position: "relative",
    backgroundColor: "#fff",
    color: "#2c3e50", // Don't inherit the game screen's white text
    padding: "30px",
    borderRadius: "10px",
    border: "4px solid #333", // Border around the pop-up
    width: "400px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    textAlign: "center",
  });

  // 3. Create Timer (Top Right Corner)
  const timerEl = document.createElement("div");
  Object.assign(timerEl.style, {
    position: "absolute",
    top: "10px",
    right: "15px",
    fontSize: "20px",
    fontWeight: "bold",
    color: "green", // Starts green
  });
  timerEl.innerText = timeLimit.toString();

  // 4. Create Question Text with Red Word Formatting
  const questionEl = document.createElement("div");
  Object.assign(questionEl.style, {
    fontSize: "22px",
    fontWeight: "bold",
    marginBottom: "20px",
    paddingBottom: "20px",
    borderBottom: "2px solid #ccc", // Separator between question and answers
  });

  // Multiline question with *marked* words shown in red
  appendFormattedText(questionEl, question.questionText);

  // 5. Create Answers Container
  const answersContainer = document.createElement("div");
  Object.assign(answersContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });

  let timerInterval: number;

  const closePopup = (isCorrect: boolean, isTimeout: boolean = false) => {
    clearInterval(timerInterval);
    window.removeEventListener("keydown", keydownHandler);
    container.removeChild(overlay);
    // Remove injected style
    const styleTag = document.getElementById("answer-hover-styles");
    if (styleTag) styleTag.remove();
    
    onResolve(isCorrect, isTimeout);
  };

  // 6. Inject CSS for Hover Effects
  if (!document.getElementById("answer-hover-styles")) {
    const style = document.createElement("style");
    style.id = "answer-hover-styles";
    style.innerHTML = `
      .answer-btn {
        background-color: #f0f0f0;
        border: 2px solid #ddd;
        padding: 12px;
        border-radius: 5px;
        font-size: 18px;
        color: #2c3e50;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .answer-btn:hover {
        background-color: #3498db;
        color: white;
        border-color: #2980b9;
      }
    `;
    document.head.appendChild(style);
  }

  // 7. Render Randomized Answers
  // Map to objects to keep track of the original correct index before shuffling
  const shuffledAnswers = question.answers
    .map((text, index) => ({ text, isCorrect: index === CORRECT_ANSWER_INDEX }))
    .sort(() => Math.random() - 0.5);

  shuffledAnswers.forEach((ans, index) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.appendChild(document.createTextNode(`${index + 1}. `));
    appendFormattedText(btn, ans.text);
    
    btn.onclick = () => {
      closePopup(ans.isCorrect);
    };
    answersContainer.appendChild(btn);
  });

  // Assemble Modal
  modal.appendChild(timerEl);
  modal.appendChild(questionEl);
  modal.appendChild(answersContainer);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  // 8. Timer Logic
  let timeLeft = timeLimit;
  timerInterval = window.setInterval(() => {
    timeLeft--;
    timerEl.innerText = timeLeft.toString();

    // Change to red for the last 10 seconds[cite: 1]
    if (timeLeft <= 10) {
      timerEl.style.color = "red";
    }

    if (timeLeft <= 0) {
      closePopup(false, true); // Timeout triggers wrong answer logic[cite: 1]
    }
  }, 1000);

  // 9. Keyboard controls (1-4 keys)[cite: 1]
  function keydownHandler(e: KeyboardEvent) {
    const keyNum = parseInt(e.key);
    if (keyNum >= 1 && keyNum <= 4 && keyNum <= shuffledAnswers.length) {
      closePopup(shuffledAnswers[keyNum - 1].isCorrect);
    }
  }
  window.addEventListener("keydown", keydownHandler);
}