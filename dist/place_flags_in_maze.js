export function placeFlagsInMaze(maze, numFlagTypes, flagsPerType) {
    const height = maze.length;
    if (height === 0)
        return [];
    const width = maze[0].length;
    const totalFlags = numFlagTypes * flagsPerType;
    const availableCells = [];
    // 1. Gather all valid cells, excluding Start (bottom-left) and Finish (top-right)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isStartField = x === 0 && y === height - 1;
            const isFinishField = x === width - 1 && y === 0;
            if (!isStartField && !isFinishField) {
                availableCells.push(maze[y][x]);
            }
        }
    }
    // Ensure the maze has enough empty space to fit all flags
    if (availableCells.length < totalFlags) {
        throw new Error("Maze is too small to fit the requested number of flags.");
    }
    // 2. Shuffle the available cells to guarantee random placement without collisions
    for (let i = availableCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableCells[i], availableCells[j]] = [availableCells[j], availableCells[i]];
    }
    const placedFlags = [];
    // 3. Assign flags to the randomly shuffled cells
    let cellIndex = 0;
    for (let typeId = 1; typeId <= numFlagTypes; typeId++) {
        for (let i = 0; i < flagsPerType; i++) {
            const targetCell = availableCells[cellIndex];
            const newFlag = {
                x: targetCell.x,
                y: targetCell.y,
                typeId: typeId,
            };
            // Store reference in the cell for easy rendering/hit detection
            targetCell.flag = newFlag;
            placedFlags.push(newFlag);
            cellIndex++;
        }
    }
    return placedFlags;
}
