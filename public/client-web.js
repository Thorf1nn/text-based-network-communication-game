const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

const gridElement = document.getElementById('game-grid');
const playerIdElement = document.getElementById('player-id');
const treasuresFoundElement = document.getElementById('treasures-found');
const winConditionElement = document.getElementById('win-condition');
const playerListElement = document.getElementById('player-list');
const chatMessagesElement = document.getElementById('chat-messages');
const chatInputElement = document.getElementById('chat-input');
const notificationsElement = document.getElementById('notifications');

let myPlayerId = null;
let gridSize = 0;
let players = {}; // Store all player states { id: { x, y, treasuresFound, element } }
let treasures = {}; // Store treasure states { id: { x, y, element } }

function showNotification(message, duration = 3000) {
    notificationsElement.textContent = message;
    notificationsElement.style.display = 'block';
    setTimeout(() => {
        notificationsElement.style.display = 'none';
    }, duration);
}

function addChatMessage(message, type = 'system') {
    const p = document.createElement('p');
    p.textContent = message;
    p.classList.add(type); // 'system', 'mine', 'other'
    chatMessagesElement.appendChild(p);
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight; // Scroll to bottom
}

function updatePlayerList() {
    playerListElement.innerHTML = ''; // Clear list
    for (const id in players) {
        const player = players[id];
        const li = document.createElement('li');
        li.textContent = `Player ${id.substring(0, 4)} (${player.treasuresFound}💎)`;
        if (id === myPlayerId) {
            li.classList.add('you');
            li.textContent += " (You)";
        }
        playerListElement.appendChild(li);
    }
}

function createOrUpdateElement(item, type) {
    let element = item.element;
    if (!element) {
        element = document.createElement('div');
        element.classList.add(type); // 'player', 'other-player', 'treasure'
        if (type === 'treasure') {
             element.dataset.treasureId = item.id; // Store treasure ID
        }
        gridElement.appendChild(element);
        item.element = element;
    }
    // Position element based on grid coordinates
    element.style.gridColumnStart = item.x + 1;
    element.style.gridRowStart = item.y + 1;
}

function removeElement(item) {
    if (item.element) {
        item.element.remove();
        item.element = null;
    }
}

function drawGame() {
    if (!gridSize) return; // Don't draw if grid size isn't set

    // Update grid template columns/rows based on size
    gridElement.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    gridElement.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

    // Ensure all grid cells exist (optional, good for background/borders)
    // This part might be slow for large grids if done frequently
    // gridElement.innerHTML = ''; // Clear previous cells if needed
    // for (let y = 0; y < gridSize; y++) {
    //     for (let x = 0; x < gridSize; x++) {
    //         const cell = document.createElement('div');
    //         cell.classList.add('grid-cell');
    //         gridElement.appendChild(cell);
    //     }
    // }


    // Update players
    for (const id in players) {
        const player = players[id];
        createOrUpdateElement(player, id === myPlayerId ? 'player' : 'other-player');
    }

    // Update treasures
    for (const id in treasures) {
        createOrUpdateElement(treasures[id], 'treasure');
    }

    updatePlayerList();
}


ws.onopen = () => {
    console.log('WebSocket connection established');
    addChatMessage('Connected to the server.', 'system');
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
    addChatMessage('Disconnected from the server.', 'system');
    showNotification('Connection lost!', 10000);
     // Optionally disable input or show a reconnect button
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    addChatMessage('Connection error.', 'system');
    showNotification('Connection error!', 10000);
};

ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        // console.log('Message from server:', message); // Debugging

        switch (message.type) {
            case 'init':
                myPlayerId = message.playerId;
                gridSize = message.gridSize;
                winConditionElement.textContent = message.winCondition;
                playerIdElement.textContent = myPlayerId.substring(0, 4);

                // Initialize players and treasures from server data
                players = {}; // Clear local players
                for (const id in message.players) {
                     players[id] = { ...message.players[id], element: null };
                }

                treasures = {}; // Clear local treasures
                message.treasures.forEach(t => {
                    treasures[t.id] = { ...t, element: null };
                });

                // Set initial treasures found count for self
                if (players[myPlayerId]) {
                    treasuresFoundElement.textContent = players[myPlayerId].treasuresFound;
                }

                drawGame(); // Initial draw
                addChatMessage(`Game started. Find ${message.winCondition} treasures!`, 'system');
                break;

            case 'playerJoined':
                if (message.player.id !== myPlayerId) {
                    players[message.player.id] = { ...message.player, element: null };
                    addChatMessage(`Player ${message.player.id.substring(0, 4)} joined.`, 'system');
                    drawGame();
                }
                break;

            case 'playerLeft':
                 if (players[message.playerId]) {
                    removeElement(players[message.playerId]);
                    delete players[message.playerId];
                    addChatMessage(`Player ${message.playerId.substring(0, 4)} left.`, 'system');
                    drawGame(); // Redraw to update player list
                }
                break;

            case 'playerMoved':
                if (players[message.playerId]) {
                    players[message.playerId].x = message.position.x;
                    players[message.playerId].y = message.position.y;
                    players[message.playerId].treasuresFound = message.treasuresFound; // Update score

                     // If a treasure was found, remove its visual element
                    if (message.foundTreasureId && treasures[message.foundTreasureId]) {
                        removeElement(treasures[message.foundTreasureId]);
                        delete treasures[message.foundTreasureId];
                         if (message.playerId === myPlayerId) {
                            showNotification('You found a treasure!');
                            treasuresFoundElement.textContent = message.treasuresFound; // Update UI immediately
                        }
                    }

                    drawGame(); // Redraw to move the player and update list
                }
                break;

             case 'newTreasure':
                // Add the new treasure to the local state and draw it
                treasures[message.treasure.id] = { ...message.treasure, element: null };
                drawGame();
                break;

            case 'chat':
                addChatMessage(`[${message.playerId.substring(0, 4)}]: ${message.message}`, message.playerId === myPlayerId ? 'mine' : 'other');
                break;

            case 'gameWon':
                const winnerName = message.playerId === myPlayerId ? 'You' : `Player ${message.playerId.substring(0, 4)}`;
                showNotification(`${winnerName} won the game with ${message.treasuresFound} treasures! Game restarting soon...`, 5000);
                addChatMessage(`${winnerName} won! Game restarting...`, 'system');
                break;

            case 'gameReset':
                 addChatMessage('Game reset. New round starting!', 'system');
                 // Update all player positions and scores
                 players = {}; // Clear local players
                 for (const id in message.players) {
                     players[id] = { ...message.players[id], element: null };
                 }
                 // Update treasures
                 // First remove all existing treasure elements
                 Object.values(treasures).forEach(removeElement);
                 treasures = {}; // Clear local treasures
                 message.treasures.forEach(t => {
                     treasures[t.id] = { ...t, element: null };
                 });

                 // Update self score display
                 if (players[myPlayerId]) {
                     treasuresFoundElement.textContent = players[myPlayerId].treasuresFound;
                 }

                 drawGame(); // Redraw everything
                 break;

        }
    } catch (e) {
        console.error('Error processing message:', event.data, e);
    }
};

// Handle user input (keyboard for movement)
document.addEventListener('keydown', (event) => {
    if (!myPlayerId || document.activeElement === chatInputElement) {
        // Don't move if chat input is focused or not initialized
        return;
    }

    let direction = null;
    switch (event.key) {
        case 'ArrowUp':
        case 'w':
            direction = 'up';
            break;
        case 'ArrowDown':
        case 's':
            direction = 'down';
            break;
        case 'ArrowLeft':
        case 'a':
            direction = 'left';
            break;
        case 'ArrowRight':
        case 'd':
            direction = 'right';
            break;
        default:
            return; // Ignore other keys
    }

    event.preventDefault(); // Prevent arrow keys from scrolling the page
    ws.send(JSON.stringify({ type: 'move', direction: direction }));
});

// Handle user input (chat)
chatInputElement.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        const message = chatInputElement.value.trim();
        if (message && myPlayerId) {
            ws.send(JSON.stringify({ type: 'chat', message: message }));
            chatInputElement.value = ''; // Clear input field
        }
    }
});

// Initial setup message
addChatMessage('Connecting to server...', 'system');