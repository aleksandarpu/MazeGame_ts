import { renderLoginScreen } from "./login-screen";
import { renderLobbyScreen } from "./lobby-screen";
import { renderGameRoomScreen } from "./game-room-screen";
import { renderGamePlayScreen } from "./game";
import { generateBraidedMaze } from "./maze_generator";
import { placeFlagsInMaze } from "./place_flags_in_maze";
//const path = require('path');
// Inside your server code, pointing to root index.html from dist/
//res.sendFile(path.join(__dirname, '../index.html'));
// Main Application Container
const appContainer = document.getElementById("app-container");
// Global Client State
const appState = {
    currentUserId: "",
    currentUserName: "",
    currentRoomId: "",
};
// ==========================================
// ROUTER & SCREEN CONTROLLERS
// ==========================================
/**
 * 1. Login Controller
 */
function navigateToLogin() {
    renderLoginScreen(appContainer, (playerName) => {
        // In a real app, you would authenticate anonymously with Firebase here
        // and get a real UID.
        appState.currentUserId = `uid_${Math.random().toString(36).substr(2, 9)}`;
        appState.currentUserName = playerName;
        // After successful login go to lobby screen[cite: 1]
        navigateToLobby();
    });
}
/**
 * 2. Lobby Controller
 */
function navigateToLobby() {
    // MOCK DATA: Replace with Firebase onSnapshot listener for the 'gameRooms' collection
    const mockRooms = [
        { id: "room1", name: "Alpha Room", players: ["Alice", "Bob"], status: "waiting" },
        { id: "room2", name: "Beta Room", players: ["Charlie"], status: "waiting" }
    ];
    const handleCreateRoom = (roomName) => {
        // MOCK: Replace with Firestore addDoc() to create a new room
        console.log(`Creating room: ${roomName}`);
        appState.currentRoomId = "new_room_id";
        navigateToGameRoom();
    };
    const handleJoinRoom = (roomId) => {
        // MOCK: Replace with Firestore updateDoc() to add user to room array
        console.log(`Joining room: ${roomId}`);
        appState.currentRoomId = roomId;
        navigateToGameRoom();
    };
    renderLobbyScreen(appContainer, appState.currentUserName, mockRooms, handleCreateRoom, handleJoinRoom);
}
/**
 * 3. Game Room Controller
 */
function navigateToGameRoom() {
    // MOCK DATA: Replace with Firebase onSnapshot listener for this specific room
    // When all players in the room are ready the game starts[cite: 1]
    const mockPlayers = [
        { id: appState.currentUserId, name: appState.currentUserName, status: "waiting" },
        { id: "uid_2", name: "Bob", status: "ready" }
    ];
    const handleToggleStatus = (newStatus) => {
        // MOCK: Replace with Firestore updateDoc() to change this user's status
        console.log(`Setting status to: ${newStatus}`);
        // Simulate immediate UI update (In reality, wait for Firestore snapshot)
        const me = mockPlayers.find(p => p.id === appState.currentUserId);
        if (me)
            me.status = newStatus;
        // Check if everyone is ready to transition to the Game Play Screen[cite: 1]
        const allReady = mockPlayers.every(p => p.status === "ready");
        if (allReady) {
            navigateToGamePlay();
        }
        else {
            // Re-render with updated status
            renderGameRoomScreen(appContainer, "Alpha Room", appState.currentUserId, mockPlayers, handleToggleStatus);
        }
    };
    renderGameRoomScreen(appContainer, "Alpha Room", // Fetch real name from Firestore
    appState.currentUserId, mockPlayers, handleToggleStatus);
}
/**
 * 4. Game Play Controller
 */
function navigateToGamePlay() {
    const maze = generateBraidedMaze(15, 15);
    placeFlagsInMaze(maze, 4, 2);
    // Initialize initial game state[cite: 1]
    const initialGameState = {
        width: 15,
        maze,
        players: [
            { id: appState.currentUserId, name: appState.currentUserName, x: 0, y: 14, color: "#e74c3c", score: 0, steps: 0, isCurrentTurn: true },
            { id: "uid_2", name: "Bob", x: 0, y: 14, color: "#3498db", score: 0, steps: 0, isCurrentTurn: false }
        ]
    };
    const advanceTurn = () => {
        const currentIndex = initialGameState.players.findIndex((player) => player.isCurrentTurn);
        const nextIndex = (currentIndex + 1) % initialGameState.players.length;
        initialGameState.players.forEach((player, index) => {
            player.isCurrentTurn = index === nextIndex;
            if (index === nextIndex)
                player.steps = 0;
        });
    };
    const updatePlayer = (playerId, updates) => {
        const player = initialGameState.players.find((item) => item.id === playerId);
        if (player)
            Object.assign(player, updates);
    };
    const showVictoryPopup = () => {
        console.log("Game Over! Triggering victory popup...");
        // Render victory popup overlay
    };
    // Mount the game screen
    const cleanupGameInputs = renderGamePlayScreen(appContainer, initialGameState, advanceTurn, updatePlayer, showVictoryPopup, (durationMs, onDismiss) => {
        console.log(`Showing CORRECT popup for ${durationMs}ms`);
        setTimeout(onDismiss, durationMs); // Mocking the popup behavior
    }, (onDismiss) => {
        console.log("Showing WRONG popup");
        setTimeout(onDismiss, 2000); // Mocking manual dismissal after 2 seconds
    });
    // If you ever unmount this screen (e.g., returning to lobby), call cleanupGameInputs()
}
// ==========================================
// APP INITIALIZATION
// ==========================================
// Start the app on the login screen
navigateToLogin();
