export function onQuestionResolved(isCorrect, playerId, gameState, updatePlayer, advanceTurn, showCorrectPopup, showWrongPopup) {
    const player = gameState.players.find((p) => p.id === playerId);
    if (!player)
        return;
    if (isCorrect) {
        // Award 2 score points and 3 additional steps[cite: 1]
        updatePlayer(playerId, {
            score: player.score + 2,
            steps: player.steps + 3,
        });
        // Display Correct pop-up for 5 seconds[cite: 1]
        showCorrectPopup(5000, () => {
            // Callback fired when space key/click dismisses it early or 5s elapses
            // Turn continues because steps were added
        });
    }
    else {
        // Timeout or wrong answer strips remaining steps[cite: 1]
        updatePlayer(playerId, {
            steps: 0,
        });
        showWrongPopup(() => {
            // Callback fired when space key/click dismisses the pop-up[cite: 1]
            // Next player gets the turn[cite: 1]
            advanceTurn();
        });
    }
}
