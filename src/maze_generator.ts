export type Flag = {
  x: number;
  y: number;
  typeId: number;
};

// Assuming the Cell type from the previous generator, extended to hold an optional flag
export type Cell = {
  x: number;
  y: number;
  visited: boolean;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
  flag?: Flag; 
};

export function generateBraidedMaze(width: number, height: number): Cell[][] {
  // 1. Initialize the grid
  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        visited: false,
        walls: { top: true, right: true, bottom: true, left: true },
      });
    }
    grid.push(row);
  }

  // 2. Recursive Backtracker (Depth-First Search)
  function carvePassages(currentX: number, currentY: number) {
    const current = grid[currentY][currentX];
    current.visited = true;

    // Define directions and randomize their order
    const directions = [
      { dx: 0, dy: -1, wall: "top", oppWall: "bottom" },
      { dx: 1, dy: 0, wall: "right", oppWall: "left" },
      { dx: 0, dy: 1, wall: "bottom", oppWall: "top" },
      { dx: -1, dy: 0, wall: "left", oppWall: "right" },
    ];
    
    // Shuffle directions array for random maze generation
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    for (const dir of directions) {
      const nextX = currentX + dir.dx;
      const nextY = currentY + dir.dy;

      // Check boundaries and if the cell is unvisited
      if (
        nextX >= 0 &&
        nextX < width &&
        nextY >= 0 &&
        nextY < height &&
        !grid[nextY][nextX].visited
      ) {
        // Knock down the wall between current and next cell
        current.walls[dir.wall as keyof Cell["walls"]] = false;
        grid[nextY][nextX].walls[dir.oppWall as keyof Cell["walls"]] = false;

        carvePassages(nextX, nextY);
      }
    }
  }

  // Start carving from the bottom-left corner (0, height - 1)
  carvePassages(0, height - 1);

  // 3. Braiding Pass (Remove Dead Ends)
  function braidMaze() {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        
        // Count how many walls this cell has
        const wallCount = Object.values(cell.walls).filter((w) => w).length;
        
        // If it's a dead end (3 walls), remove one valid internal wall
        if (wallCount === 3) {
          const breakableWalls: { dir: string; dx: number; dy: number; opp: string }[] = [];

          if (cell.walls.top && y > 0) 
            breakableWalls.push({ dir: "top", dx: 0, dy: -1, opp: "bottom" });
          if (cell.walls.bottom && y < height - 1) 
            breakableWalls.push({ dir: "bottom", dx: 0, dy: 1, opp: "top" });
          if (cell.walls.left && x > 0) 
            breakableWalls.push({ dir: "left", dx: -1, dy: 0, opp: "right" });
          if (cell.walls.right && x < width - 1) 
            breakableWalls.push({ dir: "right", dx: 1, dy: 0, opp: "left" });

          if (breakableWalls.length > 0) {
            // Pick a random internal wall to break
            const randomWall = breakableWalls[Math.floor(Math.random() * breakableWalls.length)];
            
            // Break it on current cell
            cell.walls[randomWall.dir as keyof Cell["walls"]] = false;
            // Break the opposite wall on the neighboring cell
            grid[y + randomWall.dy][x + randomWall.dx].walls[randomWall.opp as keyof Cell["walls"]] = false;
          }
        }
      }
    }
  }

  braidMaze();

  return grid;
}