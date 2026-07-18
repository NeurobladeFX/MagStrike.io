const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = 'MAIN_MENU';
let myPlayerNum = 0;
let roomCode = '';

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
  { id: 'skin_neon', name: 'Neon Trim (Spider)', type: 'skin', price: 200 },
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
  
  document.getElementById('hud-p1').style.borderColor = myPlayerNum === 1 ? '#e74c3c' : '#333';
  document.getElementById('hud-p2').style.borderColor = myPlayerNum === 2 ? '#e74c3c' : '#333';
  
  changeScene('GAMEPLAY');
});

socket.on('gameState', (state) => {
  serverState = state;
  
  // Update HUD
  document.getElementById('p1-stars').innerText = `${state.scores.p1} / 3`;
  document.getElementById('p2-stars').innerText = `${state.scores.p2} / 3`;
  
  const indicator = document.getElementById('turn-indicator');
  if (state.turn === myPlayerNum) {
    indicator.innerText = "YOUR TURN";
    indicator.style.color = "#2ecc71";
    indicator.style.borderColor = "#2ecc71";
  } else {
    indicator.innerText = "ENEMY TURN";
    indicator.style.color = "#e74c3c";
    indicator.style.borderColor = "#e74c3c";
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
    document.getElementById('winner-text').style.color = "#e74c3c";
    document.getElementById('reward-text').innerText = "";
  }
  changeScene('GAME_OVER');
});

// --- Game Engine Rendering ---
let serverState = null;
const TILE_SIZE = 100; // 800 / 8

function drawSpider(x, y, isEnemy, hasNeon) {
  ctx.save();
  ctx.translate(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + TILE_SIZE/2);
  
  // Core body
  ctx.fillStyle = isEnemy ? '#c0392b' : '#3498db';
  if (!isEnemy && hasNeon) {
    ctx.shadowColor = '#00cec9';
    ctx.shadowBlur = 15;
  }
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // 6 Legs
  ctx.strokeStyle = '#7f8c8d';
  ctx.lineWidth = 4;
  for(let i=0; i<6; i++) {
    const angle = (i * Math.PI*2/6) + Math.PI/6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle)*20, Math.sin(angle)*20);
    ctx.lineTo(Math.cos(angle)*35, Math.sin(angle)*35);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStar(x, y) {
  ctx.save();
  ctx.translate(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + TILE_SIZE/2);
  ctx.fillStyle = '#e74c3c';
  
  ctx.beginPath();
  for(let i=0; i<5; i++) {
    ctx.lineTo(Math.cos((18 + i*72)/180*Math.PI)*20, -Math.sin((18 + i*72)/180*Math.PI)*20);
    ctx.lineTo(Math.cos((54 + i*72)/180*Math.PI)*10, -Math.sin((54 + i*72)/180*Math.PI)*10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  
  for(let i=0; i<=8; i++) {
    ctx.beginPath();
    ctx.moveTo(i*TILE_SIZE, 0);
    ctx.lineTo(i*TILE_SIZE, 800);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, i*TILE_SIZE);
    ctx.lineTo(800, i*TILE_SIZE);
    ctx.stroke();
  }
}

function drawFogOfWar(fogMap) {
  // fogMap is a 2D array [8][8], true if visible
  for(let x=0; x<8; x++) {
    for(let y=0; y<8; y++) {
      if (!fogMap || !fogMap[x] || !fogMap[x][y]) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

function loop() {
  ctx.clearRect(0, 0, 800, 800);
  
  if (gameState === 'GAMEPLAY' && serverState) {
    if (saveData.equippedBorder === 'border_crimson') {
      canvas.style.borderColor = '#e74c3c';
    } else {
      canvas.style.borderColor = '#222';
    }

    drawGrid();
    
    // Draw stars
    if (serverState.stars) {
      serverState.stars.forEach(s => drawStar(s.x, s.y));
    }
    
    // Draw players
    const myPos = myPlayerNum === 1 ? serverState.p1 : serverState.p2;
    const enemyPos = myPlayerNum === 1 ? serverState.p2 : serverState.p1;
    
    // Enemy is only drawn if in our fog map
    const fog = myPlayerNum === 1 ? serverState.fog1 : serverState.fog2;
    if (fog && fog[enemyPos.x] && fog[enemyPos.x][enemyPos.y]) {
      drawSpider(enemyPos.x, enemyPos.y, true, false);
    }
    
    drawSpider(myPos.x, myPos.y, false, saveData.equippedSkin === 'skin_neon');
    drawFogOfWar(fog);
    
    // Highlight hovered tile if it's our turn
    if (serverState.turn === myPlayerNum && hoveredTile) {
      // Must be adjacent (manhattan distance == 1)
      const dist = Math.abs(hoveredTile.x - myPos.x) + Math.abs(hoveredTile.y - myPos.y);
      if (dist === 1 || dist === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(hoveredTile.x*TILE_SIZE, hoveredTile.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
  
  requestAnimationFrame(loop);
}

// --- Interaction ---
let hoveredTile = null;

canvas.addEventListener('mousemove', (e) => {
  if (gameState !== 'GAMEPLAY') return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = 800 / rect.width;
  const scaleY = 800 / rect.height;
  
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;
  
  hoveredTile = {
    x: Math.floor(cx / TILE_SIZE),
    y: Math.floor(cy / TILE_SIZE)
  };
});

canvas.addEventListener('click', () => {
  if (gameState !== 'GAMEPLAY' || !serverState || serverState.turn !== myPlayerNum || !hoveredTile) return;
  
  const myPos = myPlayerNum === 1 ? serverState.p1 : serverState.p2;
  const dist = Math.abs(hoveredTile.x - myPos.x) + Math.abs(hoveredTile.y - myPos.y);
  
  if (dist === 1) { // Can only move 1 tile orthogonally
    socket.emit('moveIntent', hoveredTile);
  }
});

// Init
window.onload = () => {
  loadSave();
  
  // UI Layer Scaling
  const uiLayer = document.getElementById('ui-layer');
  const wrapper = document.getElementById('game-wrapper');
  if (uiLayer && wrapper) {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        // Wrapper uses max-height 100vmin, so its size is dynamic. 
        // We scale UI layer to match.
        let rect = entry.contentRect;
        let scale = Math.min(rect.width / 800, rect.height / 800);
        uiLayer.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
    });
    resizeObserver.observe(wrapper);
  }
  
  loop();
};
