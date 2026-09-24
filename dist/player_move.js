export function executePlayerMove(targetX, targetY, gameState, showQuestionPopup, showVictoryPopup, advanceTurn, updatePlayer) {
    const currentPlayer = gameState.players.find((p) => p.isCurrentTurn);
    if (!currentPlayer || currentPlayer.steps <= 0) {
        return;
    }
    // 1. Move player and subtract step
    const updatedSteps = currentPlayer.steps - 1;
    updatePlayer(currentPlayer.id, {
        x: targetX,
        y: targetY,
        steps: updatedSteps
    });
    // 2. Check Victory Condition (Top-Right field: x = width - 1, y = 0)
    if (targetX === gameState.width - 1 && targetY === 0) {
        showVictoryPopup();
        return; // Halt turn logic; game is over
    }
    // 3. Check for Question Flag
    const cell = gameState.maze[targetY][targetX];
    if (cell.flag) {
        // Suspend turn advancement; the question result will dictate the next state
        showQuestionPopup(cell.flag, currentPlayer.id);
        return;
    }
    // 4. End Turn if out of steps
    if (updatedSteps === 0) {
        advanceTurn();
    }
}
