const net = require('net');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Game state
let playerId = null;
let position = { x: 0, y: 0 };
let gridSize = 0;
let treasuresFound = 0;
let winCondition = 0;
let otherPlayers = {};

// Connect to server
const HOST = 'localhost';
const PORT = 3000;

console.log(`Connecting to game server at ${HOST}:${PORT}...`);
const client = net.createConnection({ host: HOST, port: PORT }, () => {
    console.log('Connected to game server');
    console.log('Waiting for game initialization...');
});

// Handle server messages
client.on('data', (data) => {
    const messages = data.toString().trim().split('\n');
    
    messages.forEach(messageStr => {
        try {
            const message = JSON.parse(messageStr);
            handleServerMessage(message);
        } catch (e) {
            console.error('Error parsing server message:', e);
        }
    });
});

// Handle server message
function handleServerMessage(message) {
    switch (message.type) {
        case 'init':
            playerId = message.playerId;
            position = message.position;
            gridSize = message.gridSize;
            winCondition = message.winCondition;
            console.log(`\nYou are player ${playerId}`);
            console.log(`Find ${winCondition} treasures to win!`);
            printHelp();
            drawMap();
            promptUser();
            break;
            
        case 'playerJoined':
            if (message.playerId !== playerId) {
                otherPlayers[message.playerId] = message.position;
                console.log(`\nPlayer ${message.playerId} joined the game`);
                drawMap();
                promptUser();
            }
            break;
            
        case 'playerLeft':
            if (message.playerId !== playerId) {
                delete otherPlayers[message.playerId];
                console.log(`\nPlayer ${message.playerId} left the game`);
                drawMap();
                promptUser();
            }
            break;
            
        case 'playerMoved':
            if (message.playerId === playerId) {
                position = message.position;
                treasuresFound = message.treasuresFound;
            } else {
                otherPlayers[message.playerId] = message.position;
                console.log(`\nPlayer ${message.playerId} moved to (${message.position.x}, ${message.position.y})`);
            }
            drawMap();
            promptUser();
            break;
            
        case 'treasureFound':
            treasuresFound = message.treasuresFound;
            console.log(`\nYou found a treasure! (${treasuresFound}/${winCondition})`);
            drawMap();
            promptUser();
            break;
            
        case 'gameWon':
            if (message.playerId === playerId) {
                console.log('\n🎉 Congratulations! You won the game! 🎉');
            } else {
                console.log(`\nPlayer ${message.playerId} won the game with ${message.treasuresFound} treasures!`);
            }
            console.log('Game will restart shortly...');
            break;
            
        case 'gameReset':
            position = message.position;
            treasuresFound = 0;
            console.log('\nGame has been reset. New round starting!');
            drawMap();
            promptUser();
            break;
            
        case 'gameRestarted':
            console.log('\nNew game round has started!');
            break;
            
        case 'chat':
            console.log(`\n[${message.playerId}]: ${message.message}`);
            promptUser();
            break;
    }
}

// Draw the game map
function drawMap() {
    console.log('\nCurrent Map:');
    console.log(`Treasures found: ${treasuresFound}/${winCondition}`);
    
    for (let y = 0; y < gridSize; y++) {
        let row = '';
        for (let x = 0; x < gridSize; x++) {
            // Check if current position is the player
            if (position.x === x && position.y === y) {
                row += ' P ';
            } 
            // Check if current position is another player
            else {
                let hasOtherPlayer = false;
                for (const id in otherPlayers) {
                    if (otherPlayers[id].x === x && otherPlayers[id].y === y) {
                        row += ' O ';
                        hasOtherPlayer = true;
                        break;
                    }
                }
                if (!hasOtherPlayer) {
                    row += ' . ';
                }
            }
        }
        console.log(row);
    }
    
    console.log('\nP = You, O = Other player, . = Empty space');
}

// Print help information
function printHelp() {
    console.log('\nCommands:');
    console.log('  up, down, left, right - Move in that direction');
    console.log('  chat <message> - Send a chat message to all players');
    console.log('  help - Show this help message');
    console.log('  quit - Exit the game');
}

// Prompt user for input
function promptUser() {
    rl.question('> ', (input) => {
        handleUserInput(input.trim());
    });
}

// Handle user input
function handleUserInput(input) {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput === 'quit' || lowerInput === 'exit') {
        console.log('Goodbye!');
        client.end();
        rl.close();
        return;
    }
    
    if (lowerInput === 'help') {
        printHelp();
        promptUser();
        return;
    }
    
    if (['up', 'down', 'left', 'right'].includes(lowerInput)) {
        client.write(JSON.stringify({
            type: 'move',
            direction: lowerInput
        }) + '\n');
        return;
    }
    
    if (lowerInput.startsWith('chat ')) {
        const message = input.substring(5).trim();
        if (message) {
            client.write(JSON.stringify({
                type: 'chat',
                message: message
            }) + '\n');
        } else {
            console.log('Please provide a message to chat');
            promptUser();
        }
        return;
    }
    
    console.log('Unknown command. Type "help" for available commands.');
    promptUser();
}

// Handle connection errors
client.on('error', (err) => {
    console.error('Connection error:', err.message);
    rl.close();
});

// Handle server disconnect
client.on('end', () => {
    console.log('Disconnected from server');
    rl.close();
});

// Handle client close
client.on('close', () => {
    console.log('Connection closed');
    rl.close();
});