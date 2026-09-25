export type Player = {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string; // Player color (scoreboard, current-turn highlight)
  spriteId: number; // Player image assets/images/player{spriteId}.png (1 to 6)
  isCurrentTurn: boolean;
  steps: number; // Number of steps the player can take in their turn
  score: number; // Player's score, can be used for tracking progress or achievements
};
