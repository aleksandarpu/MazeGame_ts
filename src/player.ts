export type Player = {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string; // Used to represent the unique sprite
  isCurrentTurn: boolean;
  steps: number; // Number of steps the player can take in their turn
  score: number; // Player's score, can be used for tracking progress or achievements
};
