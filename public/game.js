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
  ownedItems: ['hero_pig'], // Everyone starts with Pig
  equippedHero: 'hero_pig',
  profileImage: ''
};

function loadSave() {
  const data = localStorage.getItem('shadow_grid_save');
  if (data) {
    try {
      saveData = { ...saveData, ...JSON.parse(data) };
      // Ensure they have Pig
      if (!saveData.ownedItems) saveData.ownedItems = ['hero_pig'];
      if (!saveData.ownedItems.includes('hero_pig')) saveData.ownedItems.push('hero_pig');
      if (!saveData.equippedHero) saveData.equippedHero = 'hero_pig';
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
  
  // Set Profile Image to equipped hero
  document.getElementById('profile-avatar-preview').src = `assets/${saveData.equippedHero}.png`;
}

// --- Scene Management ---
function changeScene(sceneId) {
  document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
  document.getElementById('in-game-hud').classList.add('hidden');
  
  // Show/Hide Global HUD based on Gameplay
  if (sceneId === 'GAMEPLAY') {
    document.getElementById('global-hud').classList.add('hidden');
    document.getElementById('in-game-hud').classList.remove('hidden');
    gameState = 'GAMEPLAY';
  } else {
    document.getElementById('global-hud').classList.remove('hidden');
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
  { id: 'hero_chicken', name: 'Yellow Chicken', type: 'hero', price: 100 },
  { id: 'hero_bear', name: 'Brown Bear', type: 'hero', price: 150 },
  { id: 'hero_frog', name: 'Green Frog', type: 'hero', price: 200 },
  { id: 'hero_cat', name: 'Orange Cat', type: 'hero', price: 250 },
  { id: 'hero_dog', name: 'Blue Dog', type: 'hero', price: 300 }
];

function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  
  SHOP_ITEMS.forEach(item => {
    const isOwned = saveData.ownedItems.includes(item.id);
    let isEquipped = (saveData.equippedHero === item.id);
    
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
      <img src="assets/${item.id}.png" style="width: 64px; height: 64px; border-radius: 50%; border: 4px solid #fff; margin-bottom: 10px;">
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
  if (type === 'hero') saveData.equippedHero = id;
  saveGame();
  renderShop();
}

// --- Image Preloading ---
const IMAGES = {};
['hero_pig', 'hero_chicken', 'hero_bear', 'hero_frog', 'hero_cat', 'hero_dog'].forEach(name => {
  const img = new Image();
  img.src = `assets/${name}.png`;
  IMAGES[name] = img;
});

// --- Networking ---
function showWaitingScreen(title, status) {
  document.getElementById('waiting-title').innerText = title;
  document.getElementById('waiting-text').innerText = status;
  
  // Reset VS screen
  document.getElementById('vs-loader').classList.remove('hidden');
  document.getElementById('vs-text').classList.add('hidden');
  document.getElementById('enemy-vs-avatar').src = 'assets/avatar_default.png';
  document.getElementById('enemy-vs-avatar').style.opacity = '0.3';
  document.getElementById('enemy-vs-avatar').style.filter = 'grayscale(1)';
  document.getElementById('enemy-vs-name').innerText = 'SEARCHING...';
  
  // Set my avatar
  document.getElementById('my-vs-avatar').src = `assets/${saveData.equippedHero}.png`;
  document.getElementById('my-vs-name').innerText = "YOU";
  
  changeScene('WAITING_LOBBY');
}

document.getElementById('play-online-btn').addEventListener('click', () => {
  socket.emit('joinRandom', { hero: saveData.equippedHero });
  showWaitingScreen("FINDING A CLEARING", "SEARCHING THE WOODS...");
});

document.getElementById('play-friend-btn').addEventListener('click', () => {
  socket.emit('createRoom', { hero: saveData.equippedHero });
  showWaitingScreen("BUILDING A CLEARING", "WAITING FOR FRIEND...");
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (code) {
    socket.emit('joinRoom', { code, hero: saveData.equippedHero });
    showWaitingScreen("RUNNING TO WOODS", "CONNECTING...");
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

let myHeroId = 'hero_pig';
let enemyHeroId = 'hero_chicken';

socket.on('matchStarted', (data) => {
  myPlayerNum = data.playerNum;
  roomCode = data.roomId;
  myHeroId = saveData.equippedHero;
  enemyHeroId = data.enemyHero || 'hero_pig';
  
  saveData.matches++;
  saveGame();
  
  document.getElementById('hud-p1').style.borderColor = myPlayerNum === 1 ? '#0984e3' : '#dfe6e9';
  document.getElementById('hud-p2').style.borderColor = myPlayerNum === 2 ? '#d63031' : '#dfe6e9';
  
  // Dramatic VS Screen Reveal!
  document.getElementById('vs-loader').classList.add('hidden');
  document.getElementById('vs-text').classList.remove('hidden');
  document.getElementById('waiting-text').innerText = "MATCH FOUND!";
  
  const enemyAvatar = document.getElementById('enemy-vs-avatar');
  enemyAvatar.style.opacity = '1';
  enemyAvatar.style.filter = 'grayscale(0)';
  enemyAvatar.src = `assets/${enemyHeroId}.png`;
  
  if (myPlayerNum === 1) {
    document.getElementById('my-vs-name').innerText = "P1 (YOU)";
    document.getElementById('enemy-vs-name').innerText = "P2";
  } else {
    document.getElementById('my-vs-name').innerText = "P2 (YOU)";
    document.getElementById('enemy-vs-name').innerText = "P1";
  }
  
  setTimeout(() => {
    changeScene('GAMEPLAY');
  }, 2500);
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
    document.getElementById(`hud-p${myPlayerNum}`).innerText = myPlayerNum === 1 ? 'P1 [DIZZY!]' : 'P2 [DIZZY!]';
  } else {
    document.getElementById(`hud-p${myPlayerNum}`).style.color = myPlayerNum === 1 ? '#0984e3' : '#d63031';
    document.getElementById(`hud-p${myPlayerNum}`).innerText = myPlayerNum === 1 ? 'P1 [READY]' : 'P2 [READY]';
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

function drawPlayer(p, playerNum, isInverted) {
  ctx.save();
  ctx.translate(p.x, p.y);
  
  const heroId = (playerNum === myPlayerNum) ? myHeroId : enemyHeroId;
  const img = IMAGES[heroId];
  
  if (img && img.complete) {
    // Draw the generated top-down image sprite
    ctx.drawImage(img, -p.radius, -p.radius, p.radius*2, p.radius*2);
  } else {
    // Fallback simple circle
    ctx.fillStyle = playerNum === 1 ? '#e84393' : '#fdcb6e';
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill();
  }
  
  if (isInverted) {
    // Dizzy Effect (Spinning Stars)
    const time = Date.now() / 200;
    ctx.fillStyle = '#ffeaa7';
    for(let i=0; i<3; i++) {
      const angle = time + (i * Math.PI*2/3);
      ctx.beginPath();
      ctx.arc(Math.cos(angle)*(p.radius+10), Math.sin(angle)*(p.radius+10), 5, 0, Math.PI*2);
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (gameState === 'GAMEPLAY' && serverState) {
    ctx.save();
    
    // Scale and center the 800x800 arena
    const scale = Math.min(canvas.width / 800, canvas.height / 800) * 0.95; // 95% to leave a tiny padding
    const offsetX = (canvas.width - (800 * scale)) / 2;
    const offsetY = (canvas.height - (800 * scale)) / 2;
    
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (screenShake > 0) {
      ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
      screenShake -= 1;
    }
    
    // Draw the arena background and border
    ctx.fillStyle = '#55efc4';
    ctx.fillRect(0, 0, 800, 800);
    
    ctx.lineWidth = 10;
    ctx.strokeStyle = saveData.equippedBorder === 'border_crimson' ? '#8b4513' : '#saddlebrown';
    ctx.strokeRect(0, 0, 800, 800);
    
    drawArena();
    
    // Draw Players
    const p1Inverted = serverState.invertedPlayer === 1;
    const p2Inverted = serverState.invertedPlayer === 2;
    
    drawPlayer(serverState.p1, 1, p1Inverted);
    drawPlayer(serverState.p2, 2, p2Inverted);
    
    ctx.restore();
  }
  
  requestAnimationFrame(loop);
}

// Init
window.onload = () => {
  loadSave();
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  
  loop();
};
