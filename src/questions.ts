// Bundled by Vite at build time; JSON files are UTF-8 (Cyrillic text).
import gramatika from "../assets/data/gramatika_qa.json";
import jezik from "../assets/data/jezik_qa.json";
import pravopis from "../assets/data/pravopis_qa.json";
import sluzba from "../assets/data/sluzba_qa.json";

export type Question = {
  ordNum: number;
  group: string;
  questionText: string; // May contain "\n" line breaks; render with `white-space: pre-line`
  time?: number;
  answers: string[];
};

// Shape of the files in assets/data
type QuestionFile = {
  Group: string;
  Questions: { Question: string; Answers: string[] }[];
};

// Flag typeId (1 to 4) -> question file
const questionFiles: Record<number, QuestionFile> = {
  1: gramatika,
  2: jezik,
  3: pravopis,
  4: sluzba,
};

// Strip stray BOM characters and normalize Windows line endings
function cleanText(text: string): string {
  return text.replace(/﻿/g, "").replace(/\r\n?/g, "\n").trim();
}

// Store questions in memory grouped by flag type (1 to 4)
const questionBanks: Map<number, Question[]> = new Map();

for (const [flagType, file] of Object.entries(questionFiles)) {
  const questions = file.Questions.map((item, index) => ({
    ordNum: index + 1,
    group: cleanText(file.Group),
    questionText: cleanText(item.Question),
    answers: item.Answers.map(cleanText),
  }));
  questionBanks.set(Number(flagType), questions);
}

/**
 * Retrieves a random question for the specified flag type.
 */
export function getRandomQuestion(flagType: number): Question | null {
  const bank = questionBanks.get(flagType);

  if (!bank || bank.length === 0) {
    console.warn(`No questions available for flag type ${flagType}.`);
    return null;
  }

  const randomIndex = Math.floor(Math.random() * bank.length);
  return bank[randomIndex];
}
