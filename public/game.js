const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = 'MAIN_MENU';
let myPlayerNum = 0;
let roomCode = '';
let serverState = null;

// --- Input Handling ---
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

setInterval(() => {
  if (gameState === 'GAMEPLAY') {
    socket.emit('input', keys);
  }
}, 1000 / 60);

// --- Local Save Data ---
let saveData = {
  matches: 0,
  wins: 0,
  coins: 0,
  ownedItems: [],
  equippedSkin: null,
  equippedBorder: null,
  equippedFrame: null,
  profileImage: ''
};

function loadSave() {
  const data = localStorage.getItem('shadow_grid_save');
  if (data) {
    try {
      saveData = { ...saveData, ...JSON.parse(data) };
    } catch (e) { console.error("Corrupt save"); }
  }
  updateUI();
}

function saveGame() {
  localStorage.setItem('shadow_grid_save', JSON.stringify(saveData));
  updateUI();
}

function updateUI() {
  document.getElementById('coin-count').innerText = saveData.coins;
  document.getElementById('stat-matches').innerText = saveData.matches;
  document.getElementById('stat-wins').innerText = saveData.wins;
  
  const winrate = saveData.matches > 0 ? Math.round((saveData.wins / saveData.matches) * 100) : 0;
  document.getElementById('stat-winrate').innerText = winrate + '%';
  
  const frameContainer = document.getElementById('avatar-frame-container');
  frameContainer.className = 'avatar-frame-default';
  if (saveData.equippedFrame === 'frame_crimson') frameContainer.classList.add('frame-crimson');
  if (saveData.equippedFrame === 'frame_custom') frameContainer.classList.add('frame-custom');
  
  if (saveData.profileImage) {
    document.getElementById('profile-avatar-preview').src = saveData.profileImage;
  }
}

// --- Scene Management ---
function changeScene(sceneId) {
  document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
  document.getElementById('in-game-hud').classList.add('hidden');
  
  if (sceneId === 'GAMEPLAY') {
    document.getElementById('in-game-hud').classList.remove('hidden');
    gameState = 'GAMEPLAY';
  } else {
    document.getElementById(sceneId.toLowerCase().replace('_', '-')).classList.add('active');
    gameState = sceneId;
    if (sceneId === 'SHOP') renderShop();
  }
}

// --- Profile Upload ---
document.getElementById('avatar-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      saveData.profileImage = event.target.result;
      saveGame();
      document.getElementById('profile-avatar-preview').src = saveData.profileImage;
    };
    reader.readAsDataURL(file);
  }
});

// --- Shop Logic ---
const SHOP_ITEMS = [
  { id: 'skin_neon', name: 'Silly Top Hat', type: 'skin', price: 200 },
  { id: 'border_crimson', name: 'Muddy UI Border', type: 'border', price: 100 },
  { id: 'frame_custom', name: 'Leafy Avatar Frame', type: 'frame', price: 150 }
];

function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  
  SHOP_ITEMS.forEach(item => {
    const isOwned = saveData.ownedItems.includes(item.id);
    let isEquipped = false;
    if (item.type === 'skin') isEquipped = (saveData.equippedSkin === item.id);
    if (item.type === 'border') isEquipped = (saveData.equippedBorder === item.id);
    if (item.type === 'frame') isEquipped = (saveData.equippedFrame === item.id);
    
    const div = document.createElement('div');
    div.className = 'shop-item';
    
    let btnHtml = '';
    if (isEquipped) {
      btnHtml = `<button class="btn btn-equipped" disabled>EQUIPPED</button>`;
    } else if (isOwned) {
      btnHtml = `<button class="btn btn-equip" onclick="equipItem('${item.id}', '${item.type}')">EQUIP</button>`;
    } else {
      btnHtml = `<button class="btn primary-btn" onclick="buyItem('${item.id}', ${item.price})">BUY ${item.price}</button>`;
    }
    
    div.innerHTML = `
      <div class="item-name">${item.name}</div>
      <div class="item-price">${isOwned ? 'OWNED' : `ACORNS: ${item.price}`}</div>
      ${btnHtml}
    `;
    grid.appendChild(div);
  });
}

window.buyItem = function(id, price) {
  if (saveData.coins >= price) {
    saveData.coins -= price;
    saveData.ownedItems.push(id);
    saveGame();
    renderShop();
  }
}

window.equipItem = function(id, type) {
  if (type === 'skin') saveData.equippedSkin = id;
  if (type === 'border') saveData.equippedBorder = id;
  if (type === 'frame') saveData.equippedFrame = id;
  saveGame();
  renderShop();
}

// --- Networking ---
document.getElementById('play-online-btn').addEventListener('click', () => {
  socket.emit('joinRandom');
  changeScene('WAITING_LOBBY');
  document.getElementById('waiting-text').innerText = "SEARCHING THE WOODS...";
});

document.getElementById('play-friend-btn').addEventListener('click', () => {
  socket.emit('createRoom');
  changeScene('WAITING_LOBBY');
  document.getElementById('waiting-text').innerText = "BUILDING A CLEARING...";
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (code) {
    socket.emit('joinRoom', code);
    changeScene('WAITING_LOBBY');
    document.getElementById('waiting-text').innerText = "RUNNING TO WOODS...";
  }
});

document.getElementById('cancel-match-btn').addEventListener('click', () => {
  socket.emit('leaveQueue');
  changeScene('MAIN_MENU');
});

document.getElementById('return-menu-btn').addEventListener('click', () => {
  changeScene('MAIN_MENU');
});

socket.on('roomCreated', (code) => {
  document.getElementById('waiting-text').innerText = `FOREST READY.\nFRIEND CODE: ${code}\nWAITING FOR ANIMAL...`;
});

socket.on('roomError', (msg) => {
  document.getElementById('waiting-text').innerText = `UH OH: ${msg}`;
  setTimeout(() => changeScene('MAIN_MENU'), 2000);
});

socket.on('matchStarted', (data) => {
  myPlayerNum = data.playerNum;
  roomCode = data.roomId;
  saveData.matches++;
  saveGame();
  
  document.getElementById('hud-p1').style.borderColor = myPlayerNum === 1 ? '#e84393' : '#dfe6e9'; // Pig pink
  document.getElementById('hud-p2').style.borderColor = myPlayerNum === 2 ? '#fdcb6e' : '#dfe6e9'; // Chicken yellow
  
  changeScene('GAMEPLAY');
});

// Screen shake logic
let screenShake = 0;
socket.on('shiftPulse', () => {
  screenShake = 15;
  document.body.style.backgroundColor = '#55efc4';
  setTimeout(() => document.body.style.backgroundColor = 'var(--bg-color)', 100);
});

socket.on('gameState', (state) => {
  serverState = state;
  
  // Update HUD
  const timer = document.getElementById('shift-timer');
  timer.innerText = `DIZZY IN: ${state.timer.toFixed(1)}`;
  
  if (state.timer < 1.5) {
    timer.style.color = '#d63031';
    timer.style.borderColor = '#d63031';
    timer.style.transform = `scale(${1 + Math.random()*0.1})`;
  } else {
    timer.style.color = '#d35400';
    timer.style.borderColor = '#fdcb6e';
    timer.style.transform = 'scale(1)';
  }
  
  const myInverted = state.invertedPlayer === myPlayerNum;
  if (myInverted) {
    document.getElementById(`hud-p${myPlayerNum}`).style.color = '#d63031';
    document.getElementById(`hud-p${myPlayerNum}`).innerText = myPlayerNum === 1 ? 'PIG [DIZZY!]' : 'CHICKEN [DIZZY!]';
  } else {
    document.getElementById(`hud-p${myPlayerNum}`).style.color = myPlayerNum === 1 ? '#e84393' : '#e17055';
    document.getElementById(`hud-p${myPlayerNum}`).innerText = myPlayerNum === 1 ? 'PIG [READY]' : 'CHICKEN [READY]';
  }
});

socket.on('gameOver', (data) => {
  const isWinner = data.winner === myPlayerNum;
  if (isWinner) {
    document.getElementById('winner-text').innerText = "YOU WON THE RACE!";
    document.getElementById('winner-text').style.color = "#00b894";
    document.getElementById('reward-text').innerText = "+50 ACORNS";
    saveData.coins += 50;
    saveData.wins++;
    saveGame();
  } else {
    document.getElementById('winner-text').innerText = "YOU GOT LOST!";
    document.getElementById('winner-text').style.color = "#d63031";
    document.getElementById('reward-text').innerText = "";
  }
  changeScene('GAME_OVER');
});

// --- Game Engine Rendering ---

function drawPlayer(p, playerNum, isInverted, hasSkin) {
  ctx.save();
  ctx.translate(p.x, p.y);
  
  if (playerNum === 1) {
    // Draw Pig
    ctx.fillStyle = '#fab1a0';
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e17055';
    ctx.beginPath(); ctx.arc(0, -10, 10, 0, Math.PI*2); ctx.fill(); // snout
    ctx.fillStyle = '#fab1a0';
    ctx.beginPath(); ctx.arc(-15, -15, 8, 0, Math.PI*2); ctx.fill(); // ears
    ctx.beginPath(); ctx.arc(15, -15, 8, 0, Math.PI*2); ctx.fill();
  } else {
    // Draw Chicken
    ctx.fillStyle = '#ffeaa7';
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d35400';
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.lineTo(0, -18); ctx.fill(); // beak
    ctx.fillStyle = '#d63031';
    ctx.beginPath(); ctx.arc(0, 15, 6, 0, Math.PI*2); ctx.fill(); // wattle
  }
  
  if (hasSkin) {
    // Draw Silly Top Hat
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(-15, -p.radius-5, 30, 5);
    ctx.fillRect(-10, -p.radius-25, 20, 20);
  }
  
  if (isInverted) {
    // Dizzy Effect (Spinning Stars)
    const time = Date.now() / 200;
    ctx.fillStyle = '#ffeaa7';
    for(let i=0; i<3; i++) {
      const angle = time + (i * Math.PI*2/3);
      ctx.beginPath();
      ctx.arc(Math.cos(angle)*30, Math.sin(angle)*30, 5, 0, Math.PI*2);
      ctx.fill();
    }
  }
  
  ctx.restore();
}

function drawArena() {
  // Safe Zones
  ctx.fillStyle = '#saddlebrown'; // Mud puddle (Blue/Pig starts here)
  ctx.fillRect(0, 700, 800, 100);
  
  ctx.fillStyle = '#fdcb6e'; // Straw nest (Red/Chicken starts here)
  ctx.fillRect(0, 0, 800, 100);
  
  // Wooden Log Maze
  if (serverState && serverState.maze) {
    ctx.fillStyle = '#8e44ad'; // brown logs
    ctx.strokeStyle = '#2d3436';
    ctx.lineWidth = 4;
    serverState.maze.forEach(b => {
      // Draw rounded rectangle for logs/bushes
      ctx.fillStyle = '#d35400'; // Log brown
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 15);
      ctx.fill();
      ctx.stroke();
    });
  }
}

function loop() {
  ctx.clearRect(0, 0, 800, 800);
  
  if (gameState === 'GAMEPLAY' && serverState) {
    if (saveData.equippedBorder === 'border_crimson') {
      canvas.style.borderColor = '#8b4513'; // Muddy border
    } else {
      canvas.style.borderColor = '#saddlebrown';
    }

    ctx.save();
    if (screenShake > 0) {
      ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
      screenShake -= 1;
    }
    
    drawArena();
    
    // Draw Players
    const p1Inverted = serverState.invertedPlayer === 1;
    const p2Inverted = serverState.invertedPlayer === 2;
    const hasSkin = saveData.equippedSkin === 'skin_neon';
    
    drawPlayer(serverState.p1, 1, p1Inverted, myPlayerNum===1 ? hasSkin : false);
    drawPlayer(serverState.p2, 2, p2Inverted, myPlayerNum===2 ? hasSkin : false);
    
    ctx.restore();
  }
  
  requestAnimationFrame(loop);
}

// Init
window.onload = () => {
  loadSave();
  
  const uiLayer = document.getElementById('ui-layer');
  const wrapper = document.getElementById('game-wrapper');
  if (uiLayer && wrapper) {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        let rect = entry.contentRect;
        let scale = Math.min(rect.width / 800, rect.height / 800);
        uiLayer.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
    });
    resizeObserver.observe(wrapper);
  }
  
  loop();
};
