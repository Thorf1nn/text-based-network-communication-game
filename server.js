const net = require('net');
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
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        });
    }
}

// Initialize game
generateTreasures();

// Create server
const server = net.createServer((socket) => {
    // Generate unique player ID
    const playerId = crypto.randomBytes(4).toString('hex');
    
    // Initialize player
    players[playerId] = {
        id: playerId,
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
        treasuresFound: 0,
        socket: socket
    };
    
    // Send initial game state to player
    socket.write(JSON.stringify({
        type: 'init',
        playerId: playerId,
        position: { x: players[playerId].x, y: players[playerId].y },
        gridSize: GRID_SIZE,
        winCondition: WIN_CONDITION
    }) + '\n');
    
    // Broadcast new player to all other players
    broadcastToOthers(playerId, {
        type: 'playerJoined',
        playerId: playerId,
        position: { x: players[playerId].x, y: players[playerId].y }
    });
    
    console.log(`Player ${playerId} connected`);
    
    // Handle player input
    socket.on('data', (data) => {
        try {
            const message = JSON.parse(data.toString().trim());
            handlePlayerMessage(playerId, message);
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });
    
    // Handle player disconnect
    socket.on('end', () => {
        console.log(`Player ${playerId} disconnected`);
        broadcastToOthers(playerId, {
            type: 'playerLeft',
            playerId: playerId
        });
        delete players[playerId];
    });
    
    // Handle errors
    socket.on('error', (err) => {
        console.error(`Socket error for player ${playerId}:`, err);
        delete players[playerId];
    });
});

// Handle player messages
function handlePlayerMessage(playerId, message) {
    const player = players[playerId];
    
    if (!player) return;
    
    switch (message.type) {
        case 'move':
            handlePlayerMove(player, message.direction);
            break;
        case 'chat':
            broadcastToAll({
                type: 'chat',
                playerId: playerId,
                message: message.message
            });
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
    
    // Update player position
    player.x = newX;
    player.y = newY;
    
    // Check for treasures
    checkForTreasure(player);
    
    // Notify all players about the movement
    broadcastToAll({
        type: 'playerMoved',
        playerId: player.id,
        position: { x: player.x, y: player.y },
        treasuresFound: player.treasuresFound
    });
}

// Check if player found a treasure
function checkForTreasure(player) {
    for (let i = 0; i < treasures.length; i++) {
        if (treasures[i].x === player.x && treasures[i].y === player.y) {
            // Player found a treasure
            player.treasuresFound++;
            
            // Remove the treasure and generate a new one
            treasures.splice(i, 1);
            treasures.push({
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE)
            });
            
            // Notify player about treasure
            player.socket.write(JSON.stringify({
                type: 'treasureFound',
                treasuresFound: player.treasuresFound
            }) + '\n');
            
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
            
            break;
        }
    }
}

// Reset game
function resetGame() {
    generateTreasures();
    
    // Reset player positions and treasures
    Object.values(players).forEach(player => {
        player.x = Math.floor(Math.random() * GRID_SIZE);
        player.y = Math.floor(Math.random() * GRID_SIZE);
        player.treasuresFound = 0;
        
        player.socket.write(JSON.stringify({
            type: 'gameReset',
            position: { x: player.x, y: player.y }
        }) + '\n');
    });
    
    broadcastToAll({
        type: 'gameRestarted'
    });
}

// Broadcast message to all players
function broadcastToAll(message) {
    const messageStr = JSON.stringify(message) + '\n';
    Object.values(players).forEach(player => {
        player.socket.write(messageStr);
    });
}

// Broadcast message to all players except one
function broadcastToOthers(excludePlayerId, message) {
    const messageStr = JSON.stringify(message) + '\n';
    Object.values(players).forEach(player => {
        if (player.id !== excludePlayerId) {
            player.socket.write(messageStr);
        }
    });
}

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT}`);
});