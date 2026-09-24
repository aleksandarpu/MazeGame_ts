import { readFile } from "fs/promises";
import { join } from "path";

export type Question = {
  ordNum: number;
  questionText: string;
  time?: number;
  answers: string[];
};

// Store questions in memory grouped by flag type (1 to 4)
const questionBanks: Map<number, Question[]> = new Map();

/**
 * Loads the 4 JSON files containing the question sets[cite: 1].
 * Assumes files are named `questions_type1.json`, `questions_type2.json`, etc.
 */
export async function loadQuestions(dataDirectory: string): Promise<void> {
  for (let flagType = 1; flagType <= 4; flagType++) {
    const filePath = join(dataDirectory, `questions_type${flagType}.json`);
    try {
      const fileContent = await readFile(filePath, "utf-8");
      const questions: Question[] = JSON.parse(fileContent);
      questionBanks.set(flagType, questions);
      console.log(`Loaded ${questions.length} questions for flag type ${flagType}.`);
    } catch (error) {
      console.error(`Failed to load questions for flag type ${flagType} at ${filePath}:`, error);
      // Initialize with empty array to prevent runtime errors later
      questionBanks.set(flagType, []);
    }
  }
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