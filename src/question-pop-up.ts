import { getQuestion, getRandomQuestion } from "./questions";

// The correct answer is always listed first in the question files
export const CORRECT_ANSWER_INDEX = 0;

/**
 * Fills `target` with `text`, turning "\n" into line breaks and
 * *marked* words into red spans. Uses text nodes, so the text is never parsed as HTML.
 */
export function appendFormattedText(target: HTMLElement, text: string) {
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

/**
 * A question as shown in a game: which one, in which answer order. Saved in the game state,
 * so every player's pop-up shows the same question with the answers in the same order.
 */
export type ActiveQuestion = {
  flagTypeId: number;
  ordNum: number; // Question's ordNum in its flag type's bank (questions.ts)
  answerOrder: number[]; // Original answer indexes in the order shown (index 0 is correct)
  timeLimit: number; // Seconds
};

/** Picks a random question for the flag and shuffles its answers. Null if there is none. */
export function pickQuestion(flagTypeId: number, timeLimitSeconds: number = 30): ActiveQuestion | null {
  const question = getRandomQuestion(flagTypeId);
  if (!question) return null;
  const answerOrder = question.answers.map((_, index) => index);
  for (let i = answerOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [answerOrder[i], answerOrder[j]] = [answerOrder[j], answerOrder[i]];
  }
  return { flagTypeId, ordNum: question.ordNum, answerOrder, timeLimit: question.time ?? timeLimitSeconds };
}

/** Text of an answer (by original index), or null if the question can't be found. */
export function getAnswerText(active: ActiveQuestion, answerIndex: number): string | null {
  return getQuestion(active.flagTypeId, active.ordNum)?.answers[answerIndex] ?? null;
}

export type QuestionPopup = { close: () => void };

/**
 * Shows the question. With `onAnswer` the player can answer (click or keys 1-4) and
 * `onAnswer` gets the original index of the chosen answer, or null when time runs out.
 * Without it the pop-up is read-only (other players watching): the timer only counts
 * down, and the caller closes it when the answer arrives.
 */
export function createQuestionPopup(
  container: HTMLElement,
  active: ActiveQuestion,
  onAnswer?: (answerIndex: number | null) => void
): QuestionPopup {
  const interactive = !!onAnswer;
  const question = getQuestion(active.flagTypeId, active.ordNum);

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
  timerEl.innerText = active.timeLimit.toString();

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
  appendFormattedText(questionEl, question?.questionText ?? "?");

  // 5. Create Answers Container
  const answersContainer = document.createElement("div");
  Object.assign(answersContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });

  let timerInterval = 0;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timerInterval);
    window.removeEventListener("keydown", keydownHandler);
    overlay.remove();
  };

  const answer = (answerIndex: number | null) => {
    if (closed) return;
    close();
    onAnswer?.(answerIndex);
  };

  // 6. Inject CSS for Hover Effects (read-only answers don't react)
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
      .answer-btn:not(:disabled):hover {
        background-color: #3498db;
        color: white;
        border-color: #2980b9;
      }
      .answer-btn:disabled { cursor: default; }
    `;
    document.head.appendChild(style);
  }

  // 7. Render the answers in the saved (shuffled) order
  const shownAnswers = question ? active.answerOrder.filter((index) => index < question.answers.length) : [];

  shownAnswers.forEach((answerIndex, position) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.disabled = !interactive;
    btn.appendChild(document.createTextNode(`${position + 1}. `));
    appendFormattedText(btn, question!.answers[answerIndex]);
    btn.onclick = () => answer(answerIndex);
    answersContainer.appendChild(btn);
  });

  const waitingNote = document.createElement("div");
  waitingNote.innerText = "Waiting for the answer...";
  Object.assign(waitingNote.style, { marginTop: "15px", fontSize: "15px", fontStyle: "italic", color: "#7f8c8d" });

  // Assemble Modal
  modal.appendChild(timerEl);
  modal.appendChild(questionEl);
  modal.appendChild(answersContainer);
  if (!interactive) modal.appendChild(waitingNote);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  // 8. Timer Logic
  let timeLeft = active.timeLimit;
  timerInterval = window.setInterval(() => {
    timeLeft = Math.max(0, timeLeft - 1);
    timerEl.innerText = timeLeft.toString();

    // Change to red for the last 10 seconds[cite: 1]
    if (timeLeft <= 10) {
      timerEl.style.color = "red";
    }

    // Timeout triggers wrong answer logic[cite: 1] (decided by the answering player's client)
    if (timeLeft <= 0 && interactive) {
      answer(null);
    }
  }, 1000);

  // 9. Keyboard controls (1-4 keys)[cite: 1]
  function keydownHandler(e: KeyboardEvent) {
    const keyNum = parseInt(e.key);
    if (keyNum >= 1 && keyNum <= 4 && keyNum <= shownAnswers.length) {
      answer(shownAnswers[keyNum - 1]);
    }
  }
  if (interactive) window.addEventListener("keydown", keydownHandler);

  // Nothing to ask (no question for this flag): treat as not answered
  if (!question && interactive) answer(null);

  return { close };
}
