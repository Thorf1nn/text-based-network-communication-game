const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const crypto = require('crypto');

// Game configuration
const GRID_SIZE = 10;
const TREASURE_COUNT = 5;
const WIN_CONDITION = 3;

// Game state
const players = {};
let treasures = [];

// Generate random treasures
function generateTreasures() {
    treasures = [];
    for (let i = 0; i < TREASURE_COUNT; i++) {
        treasures.push({
            id: `t-${i}`, // Give treasures unique IDs
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        });
    }
    console.log("Generated treasures:", treasures);
}

// Initialize game
generateTreasures();

// Setup Express server to serve static files
const app = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, 'public'))); // Serve files from 'public' directory

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    // Generate unique player ID
    const playerId = crypto.randomBytes(4).toString('hex');

    // Initialize player
    players[playerId] = {
        id: playerId,
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
        treasuresFound: 0,
        ws: ws // Store WebSocket connection
    };
    const player = players[playerId];
    console.log(`Player ${playerId} connected`);

    // Send initial game state to the newly connected player
    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId,
        position: { x: player.x, y: player.y },
        gridSize: GRID_SIZE,
        winCondition: WIN_CONDITION,
        treasures: treasures, // Send initial treasure locations
        players: getPublicPlayerStates() // Send current state of all players
    }));

    // Broadcast new player info to all other players
    broadcastToOthers(playerId, {
        type: 'playerJoined',
        player: getPublicPlayerState(player)
    });

    // Handle player messages
    ws.on('message', (message) => {
        try {
            // Ensure message is a string before parsing
            const messageString = message.toString();
            const parsedMessage = JSON.parse(messageString);
            handlePlayerMessage(playerId, parsedMessage);
        } catch (e) {
            console.error(`Error parsing message from ${playerId}:`, message, e);
        }
    });

    // Handle player disconnect
    ws.on('close', () => {
        console.log(`Player ${playerId} disconnected`);
        broadcastToOthers(playerId, {
            type: 'playerLeft',
            playerId: playerId
        });
        delete players[playerId];
    });

    // Handle errors
    ws.on('error', (err) => {
        console.error(`WebSocket error for player ${playerId}:`, err);
        // Clean up if player exists
        if (players[playerId]) {
             broadcastToOthers(playerId, {
                type: 'playerLeft',
                playerId: playerId
            });
            delete players[playerId];
        }
    });
});

// Get player state suitable for sending to clients (without ws object)
function getPublicPlayerState(player) {
    return {
        id: player.id,
        x: player.x,
        y: player.y,
        treasuresFound: player.treasuresFound
    };
}

// Get state of all players
function getPublicPlayerStates() {
    const states = {};
    for (const id in players) {
        states[id] = getPublicPlayerState(players[id]);
    }
    return states;
}


// Handle player messages
function handlePlayerMessage(playerId, message) {
    const player = players[playerId];

    if (!player) return;

    switch (message.type) {
        case 'move':
            handlePlayerMove(player, message.direction);
            break;
        case 'chat':
             if (typeof message.message === 'string' && message.message.trim().length > 0) {
                broadcastToAll({
                    type: 'chat',
                    playerId: playerId,
                    message: message.message.trim() // Sanitize/validate input as needed
                });
            }
            break;
    }
}

// Handle player movement
function handlePlayerMove(player, direction) {
    let newX = player.x;
    let newY = player.y;

    switch (direction) {
        case 'up':
            newY = Math.max(0, player.y - 1);
            break;
        case 'down':
            newY = Math.min(GRID_SIZE - 1, player.y + 1);
            break;
        case 'left':
            newX = Math.max(0, player.x - 1);
            break;
        case 'right':
            newX = Math.min(GRID_SIZE - 1, player.x + 1);
            break;
    }

    // Update player position if it changed
    if (newX !== player.x || newY !== player.y) {
        player.x = newX;
        player.y = newY;

        // Check for treasures
        const foundTreasureId = checkForTreasure(player);

        // Notify all players about the movement
        broadcastToAll({
            type: 'playerMoved',
            playerId: player.id,
            position: { x: player.x, y: player.y },
            treasuresFound: player.treasuresFound,
            foundTreasureId: foundTreasureId // Include ID if a treasure was found
        });
    }
}

// Check if player found a treasure
function checkForTreasure(player) {
    let foundTreasureId = null;
    for (let i = 0; i < treasures.length; i++) {
        if (treasures[i].x === player.x && treasures[i].y === player.y) {
            // Player found a treasure
            player.treasuresFound++;
            foundTreasureId = treasures[i].id; // Get the ID of the found treasure

            // Remove the treasure and generate a new one
            treasures.splice(i, 1);
            const newTreasure = {
                 id: `t-${Date.now()}-${Math.random().toString(16).slice(2)}`, // More unique ID
                 x: Math.floor(Math.random() * GRID_SIZE),
                 y: Math.floor(Math.random() * GRID_SIZE)
            };
            treasures.push(newTreasure);
            console.log("Generated new treasure:", newTreasure);


            // Notify all players about the new treasure location
             broadcastToAll({
                type: 'newTreasure',
                treasure: newTreasure
            });

            // Check win condition
            if (player.treasuresFound >= WIN_CONDITION) {
                broadcastToAll({
                    type: 'gameWon',
                    playerId: player.id,
                    treasuresFound: player.treasuresFound
                });

                // Reset game after a short delay
                setTimeout(() => {
                    resetGame();
                }, 5000);
            }
            break; // Exit loop once a treasure is found
        }
    }
    return foundTreasureId; // Return the ID of the found treasure, or null
}

// Reset game
function resetGame() {
    console.log("Resetting game...");
    generateTreasures();

    // Reset player positions and treasures
    Object.values(players).forEach(player => {
        player.x = Math.floor(Math.random() * GRID_SIZE);
        player.y = Math.floor(Math.random() * GRID_SIZE);
        player.treasuresFound = 0;
    });

     // Notify all players about the reset and new state
    broadcastToAll({
        type: 'gameReset',
        players: getPublicPlayerStates(),
        treasures: treasures
    });
    console.log("Game reset complete.");
}

// Broadcast message to all connected players
function broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    // console.log("Broadcasting to all:", messageStr); // Debugging
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// Broadcast message to all players except one
function broadcastToOthers(excludePlayerId, message) {
    const messageStr = JSON.stringify(message);
     // console.log(`Broadcasting to others (exclude ${excludePlayerId}):`, messageStr); // Debugging
    Object.values(players).forEach(player => {
        if (player.id !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageStr);
        }
    });
}

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Game server running on http://localhost:${PORT}`);
    console.log(`WebSocket server established`);
});