import { Cell } from "./maze_generator";
import { Player } from "./player";

export type GameState = {
  maze: Cell[][];
  players: Player[]; // Assumes Player type has `steps: number` and `score: number`
  width: number;
};

