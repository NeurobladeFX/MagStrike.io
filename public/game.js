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
  { id: 'skin_neon', name: 'Neon Glitch (Player Glow)', type: 'skin', price: 200 },
  { id: 'border_crimson', name: 'Crimson Red UI Border', type: 'border', price: 100 },
  { id: 'frame_custom', name: 'Custom Avatar Frame', type: 'frame', price: 150 }
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
      <div class="item-price">${isOwned ? 'OWNED' : `CREDITS: ${item.price}`}</div>
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
  document.getElementById('waiting-text').innerText = "SEARCHING FOR TARGET...";
});

document.getElementById('play-friend-btn').addEventListener('click', () => {
  socket.emit('createRoom');
  changeScene('WAITING_LOBBY');
  document.getElementById('waiting-text').innerText = "ESTABLISHING SECURE ROOM...";
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (code) {
    socket.emit('joinRoom', code);
    changeScene('WAITING_LOBBY');
    document.getElementById('waiting-text').innerText = "CONNECTING TO ROOM...";
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
  document.getElementById('waiting-text').innerText = `ROOM SECURED.\nTRANSMIT CODE: ${code}\nWAITING FOR OPERATOR...`;
});

socket.on('roomError', (msg) => {
  document.getElementById('waiting-text').innerText = `ERROR: ${msg}`;
  setTimeout(() => changeScene('MAIN_MENU'), 2000);
});

socket.on('matchStarted', (data) => {
  myPlayerNum = data.playerNum;
  roomCode = data.roomId;
  saveData.matches++;
  saveGame();
  
  document.getElementById('hud-p1').style.borderColor = myPlayerNum === 1 ? '#00f0ff' : '#333';
  document.getElementById('hud-p2').style.borderColor = myPlayerNum === 2 ? '#ff003c' : '#333';
  
  changeScene('GAMEPLAY');
});

// Screen shake logic
let screenShake = 0;
socket.on('shiftPulse', () => {
  screenShake = 15;
  // Flash body for dramatic effect
  document.body.style.backgroundColor = '#9b59b6';
  setTimeout(() => document.body.style.backgroundColor = 'var(--bg-color)', 50);
});

socket.on('gameState', (state) => {
  serverState = state;
  
  // Update HUD
  const timer = document.getElementById('shift-timer');
  timer.innerText = `SHIFT IN: ${state.timer.toFixed(1)}`;
  
  if (state.timer < 1.5) {
    timer.style.color = '#ff003c';
    timer.style.borderColor = '#ff003c';
    timer.style.transform = `scale(${1 + Math.random()*0.1})`;
  } else {
    timer.style.color = '#00f0ff';
    timer.style.borderColor = '#00f0ff';
    timer.style.transform = 'scale(1)';
  }
  
  // Update Player names to show if they are glitched
  const myInverted = state.invertedPlayer === myPlayerNum;
  if (myInverted) {
    document.getElementById(`hud-p${myPlayerNum}`).style.color = '#9b59b6';
    document.getElementById(`hud-p${myPlayerNum}`).innerText = 'P' + myPlayerNum + ' [INVERTED]';
  } else {
    document.getElementById(`hud-p${myPlayerNum}`).style.color = myPlayerNum === 1 ? '#00f0ff' : '#ff003c';
    document.getElementById(`hud-p${myPlayerNum}`).innerText = 'P' + myPlayerNum + ' [NORMAL]';
  }
});

socket.on('gameOver', (data) => {
  const isWinner = data.winner === myPlayerNum;
  if (isWinner) {
    document.getElementById('winner-text').innerText = "VICTORY ACHIEVED";
    document.getElementById('winner-text').style.color = "#2ecc71";
    document.getElementById('reward-text').innerText = "+50 CREDITS";
    saveData.coins += 50;
    saveData.wins++;
    saveGame();
  } else {
    document.getElementById('winner-text').innerText = "SYSTEM COMPROMISED";
    document.getElementById('winner-text').style.color = "#ff003c";
    document.getElementById('reward-text').innerText = "";
  }
  changeScene('GAME_OVER');
});

// --- Game Engine Rendering ---

function drawPlayer(p, color, isInverted, hasSkin) {
  ctx.save();
  ctx.translate(p.x, p.y);
  
  if (hasSkin) {
    ctx.shadowColor = isInverted ? '#9b59b6' : color;
    ctx.shadowBlur = 20;
  }
  
  if (isInverted) {
    // Glitchy purple look
    ctx.fillStyle = '#9b59b6';
    // Jitter randomly
    ctx.translate((Math.random()-0.5)*4, (Math.random()-0.5)*4);
  } else {
    ctx.fillStyle = color;
  }
  
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI*2);
  ctx.fill();
  
  // Eye indicating forward direction
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, isInverted ? 10 : -10, 5, 0, Math.PI*2);
  ctx.fill();
  
  ctx.restore();
}

function drawArena() {
  // Safe Zones
  ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
  ctx.fillRect(0, 700, 800, 100); // Bottom zone (Blue)
  
  ctx.fillStyle = 'rgba(255, 0, 60, 0.1)';
  ctx.fillRect(0, 0, 800, 100); // Top zone (Red)
  
  // Grid Lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for(let i=0; i<800; i+=40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 800); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke();
  }
  
  // Maze
  if (serverState && serverState.maze) {
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#ff003c';
    ctx.lineWidth = 2;
    serverState.maze.forEach(b => {
      ctx.shadowColor = '#ff003c';
      ctx.shadowBlur = 10;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;
    });
  }
}

function loop() {
  ctx.clearRect(0, 0, 800, 800);
  
  if (gameState === 'GAMEPLAY' && serverState) {
    if (saveData.equippedBorder === 'border_crimson') {
      canvas.style.borderColor = '#ff003c';
    } else {
      canvas.style.borderColor = '#222';
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
    
    drawPlayer(serverState.p1, '#00f0ff', p1Inverted, myPlayerNum===1 ? hasSkin : false);
    drawPlayer(serverState.p2, '#ff003c', p2Inverted, myPlayerNum===2 ? hasSkin : false);
    
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
