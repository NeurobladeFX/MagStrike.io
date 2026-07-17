// Connect explicitly to the Render backend
const socket = io('https://magstrike-io.onrender.com');

// ==========================================
// 1. Data & State Management
// ==========================================
const STORAGE_KEY = 'magstrike_savedata_v3';
let saveData = {
  coins: 0,
  ownedItems: ['default'],
  equippedTrail: 'default',
  username: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
  totalWins: 0,
  totalGoals: 0,
  matchesPlayed: 0
};

const ITEMS = [
  { id: 'default', name: 'Default Trail', price: 0, color: 'rgba(255, 255, 255, 0.3)' },
  { id: 'plasma', name: 'Plasma Trail', price: 50, color: 'rgba(69, 243, 255, 0.6)' },
  { id: 'void', name: 'Void Trail', price: 200, color: 'rgba(150, 0, 255, 0.6)' },
  { id: 'solar', name: 'Solar Flare Trail', price: 500, color: 'rgba(255, 165, 0, 0.8)' }
];

let gameState = 'MAIN_MENU'; 
let myPlayerNum = 0; // 1 or 2

// ==========================================
// 2. DOM Elements & UI Logic
// ==========================================
const scenes = {
  'MAIN_MENU': document.getElementById('main-menu'),
  'SHOP': document.getElementById('shop'),
  'PROFILE': document.getElementById('profile'),
  'GAMEPLAY': document.getElementById('gameplay-ui'),
  'GAME_OVER': document.getElementById('game-over')
};
const coinsDisplay = document.getElementById('coin-count');
const statusText = document.getElementById('matchmaking-status');
const welcomeName = document.getElementById('welcome-name');

function loadSave() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      saveData = { ...saveData, ...JSON.parse(data) };
    } catch(e) { console.error('Corrupted save data'); }
  }
  updateUI();
  socket.emit('equipTrail', saveData.equippedTrail);
  socket.emit('setProfile', { username: saveData.username });
}

function saveGame() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  updateUI();
}

function updateUI() {
  coinsDisplay.innerText = saveData.coins.toLocaleString();
  welcomeName.innerText = saveData.username;
  
  // Update Profile Scene
  document.getElementById('username-input').value = saveData.username;
  document.getElementById('stat-wins').innerText = saveData.totalWins;
  document.getElementById('stat-matches').innerText = saveData.matchesPlayed;
  document.getElementById('stat-goals').innerText = saveData.totalGoals;
  
  const winRate = saveData.matchesPlayed > 0 ? Math.round((saveData.totalWins / saveData.matchesPlayed) * 100) : 0;
  document.getElementById('stat-winrate').innerText = `${winRate}%`;
}

window.changeScene = function(newScene) {
  Object.values(scenes).forEach(s => s.classList.remove('active'));
  scenes[newScene].classList.add('active');
  gameState = newScene;

  if (newScene === 'MAIN_MENU') {
    statusText.style.display = 'none';
  } else if (newScene === 'SHOP') {
    renderShop();
  }
}

// Profile Save Event
document.getElementById('save-profile-btn').addEventListener('click', () => {
  const newName = document.getElementById('username-input').value.trim();
  if (newName.length > 0) {
    saveData.username = newName;
    saveGame();
    socket.emit('setProfile', { username: saveData.username });
    alert("Profile saved successfully!");
  }
});

// Shop Rendering
function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  
  ITEMS.forEach(item => {
    const isOwned = saveData.ownedItems.includes(item.id);
    const isEquipped = saveData.equippedTrail === item.id;
    
    const div = document.createElement('div');
    div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
    
    const iconStr = `<div class="item-icon" style="background: radial-gradient(circle, ${item.color} 20%, transparent 80%); border: 2px solid #555;"></div>`;
    
    let btnHtml = '';
    if (isEquipped) {
      btnHtml = `<button class="item-btn btn-equipped" disabled>Equipped</button>`;
    } else if (isOwned) {
      btnHtml = `<button class="item-btn btn-equip" onclick="equipItem('${item.id}')">Equip</button>`;
    } else {
      btnHtml = `<button class="item-btn btn-buy" onclick="buyItem('${item.id}', ${item.price})">Buy Ȼ ${item.price}</button>`;
    }
    
    div.innerHTML = `
      ${iconStr}
      <div class="item-name">${item.name}</div>
      <div class="item-price">${isOwned ? 'Owned' : `Ȼ ${item.price}`}</div>
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
  } else {
    alert("Not enough Mag-Credits!");
  }
}

window.equipItem = function(id) {
  saveData.equippedTrail = id;
  saveGame();
  renderShop();
  socket.emit('equipTrail', id);
}

// ==========================================
// 3. Socket.io Matchmaking
// ==========================================
document.getElementById('play-random-btn').addEventListener('click', () => {
  socket.emit('joinRandom');
});

document.getElementById('create-room-btn').addEventListener('click', () => {
  socket.emit('createRoom');
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (code) socket.emit('joinRoom', code);
});

socket.on('waitingForMatch', () => {
  statusText.innerText = "Searching for opponent...";
  statusText.style.display = 'block';
});

socket.on('roomCreated', (roomId) => {
  statusText.innerText = `Room Created! Code: ${roomId}`;
  statusText.style.display = 'block';
});

socket.on('roomError', (msg) => {
  statusText.innerText = msg;
  statusText.style.display = 'block';
  setTimeout(() => statusText.style.display = 'none', 3000);
});

socket.on('matchFound', (data) => {
  myPlayerNum = data.playerNum;
  document.getElementById('p1-score').innerText = '0';
  document.getElementById('p2-score').innerText = '0';
  
  if (data.roomId.startsWith('room_')) {
    document.getElementById('room-code-display').innerText = '';
  } else {
    document.getElementById('room-code-display').innerText = `ROOM: ${data.roomId}`;
  }
  
  saveData.matchesPlayed++;
  saveGame();
  
  changeScene('GAMEPLAY');
});

socket.on('opponentDisconnected', () => {
  if (gameState === 'GAMEPLAY') {
    document.getElementById('winner-text').innerText = "Opponent Disconnected";
    document.getElementById('winner-text').style.color = "#fff";
    document.getElementById('reward-text').innerText = "";
    changeScene('GAME_OVER');
  }
});

// ==========================================
// 4. Game Engine & Rendering
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Input Loop
setInterval(() => {
  if (gameState === 'GAMEPLAY') {
    socket.emit('input', keys);
  }
}, 1000 / 60);

class Particle {
  constructor(x, y, color, life, size, vx=0, vy=0) {
    this.x = x; this.y = y; this.color = color;
    this.life = life; this.maxLife = life;
    this.size = size; this.vx = vx; this.vy = vy;
  }
  update() { this.x += this.vx; this.y += this.vy; this.life--; }
  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

let serverState = null;
let particles = [];

socket.on('state', (state) => {
  serverState = state;
  spawnTrails(state);
});

socket.on('goalScored', (data) => {
  document.getElementById('p1-score').innerText = data.scores.p1;
  document.getElementById('p2-score').innerText = data.scores.p2;
  
  if (data.scorer === myPlayerNum) {
    saveData.coins += 5;
    saveData.totalGoals++;
    saveGame();
  }
  
  // Explosion
  for(let i=0; i<40; i++) {
    const c = data.scorer === 1 ? '#45f3ff' : '#ff45a1';
    particles.push(new Particle(
      data.ball.x, data.ball.y, c, 
      30 + Math.random()*20, 
      Math.random()*6 + 2, 
      (Math.random()-0.5)*20, 
      (Math.random()-0.5)*20
    ));
  }
});

socket.on('gameOver', (data) => {
  const winner = data.winner;
  let text = "";
  if (winner === myPlayerNum) {
    text = "You Win!";
    saveData.coins += 50;
    saveData.totalWins++;
    saveGame();
    document.getElementById('reward-text').innerText = "+50 Ȼ";
  } else {
    text = "You Lose";
    document.getElementById('reward-text').innerText = "";
  }
  
  document.getElementById('winner-text').innerText = text;
  document.getElementById('winner-text').style.color = winner === 1 ? '#45f3ff' : '#ff45a1';
  document.getElementById('winner-text').style.textShadow = `0 0 20px ${winner===1?'#45f3ff':'#ff45a1'}`;
  
  changeScene('GAME_OVER');
});

function spawnTrails(state) {
  [state.p1, state.p2].forEach((p) => {
    const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    if (speed > 2) {
      const trailInfo = ITEMS.find(i => i.id === p.trail) || ITEMS[0];
      const offset = (Math.random()-0.5) * 30; // 30 is player radius
      const nx = -p.vy / speed;
      const ny = p.vx / speed;
      particles.push(new Particle(
        p.x + nx*offset, p.y + ny*offset, 
        trailInfo.color, 20, 15
      ));
    }
  });
}

function drawEntity(x, y, radius, color, username) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.beginPath();
  ctx.arc(x - radius*0.2, y - radius*0.2, radius*0.4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
  
  if (username) {
    ctx.font = 'bold 18px Outfit, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    ctx.fillText(username, x, y - radius - 15);
    ctx.shadowBlur = 0; // reset
  }
}

function drawArena() {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 15;
  ctx.strokeRect(0,0,1200,800);
  
  ctx.beginPath();
  ctx.moveTo(600, 0); ctx.lineTo(600, 800);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 20]);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.beginPath();
  ctx.arc(600, 400, 150, 0, Math.PI*2);
  ctx.stroke();
  
  const goalH = 400;
  const goalY = (800 - goalH)/2;
  
  ctx.fillStyle = 'rgba(69, 243, 255, 0.05)';
  ctx.fillRect(0, goalY, 30, goalH);
  ctx.shadowColor = '#45f3ff'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#45f3ff'; ctx.fillRect(0, goalY, 8, goalH);
  ctx.shadowBlur = 0;
  
  ctx.fillStyle = 'rgba(255, 69, 161, 0.05)';
  ctx.fillRect(1200-30, goalY, 30, goalH);
  ctx.shadowColor = '#ff45a1'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#ff45a1'; ctx.fillRect(1200-8, goalY, 8, goalH);
  ctx.shadowBlur = 0;
}

function drawGame() {
  // Clear
  ctx.fillStyle = gameState === 'GAMEPLAY' ? 'rgba(11, 12, 16, 0.3)' : '#0b0c10';
  ctx.fillRect(0, 0, 1200, 800);

  if (gameState === 'GAMEPLAY' || gameState === 'GAME_OVER') {
    drawArena();
    
    if (serverState) {
      // Visual Effects
      serverState.fx.forEach(fx => {
        if (fx.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(fx.p1.x, fx.p1.y);
          ctx.lineTo(fx.p2.x, fx.p2.y);
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = fx.width;
          ctx.globalAlpha = 0.8;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        } else if (fx.type === 'ring') {
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI*2);
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 5;
          ctx.stroke();
        }
      });
      
      particles.forEach(p => p.draw(ctx));
      
      drawEntity(serverState.p1.x, serverState.p1.y, 30, '#45f3ff', serverState.p1.username);
      drawEntity(serverState.p2.x, serverState.p2.y, 30, '#ff45a1', serverState.p2.username);
      
      if (serverState.ball.x > 0) {
        ctx.beginPath();
        ctx.arc(serverState.ball.x, serverState.ball.y, serverState.ball.radius, 0, Math.PI*2);
        const grad = ctx.createRadialGradient(serverState.ball.x-5, serverState.ball.y-5, 2, serverState.ball.x, serverState.ball.y, serverState.ball.radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.4, '#aaa');
        grad.addColorStop(1, '#333');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else {
    // Menu background particles
    if (Math.random() < 0.1) {
      particles.push(new Particle(Math.random()*1200, Math.random()*800, 'rgba(69,243,255,0.1)', 100, Math.random()*3+1));
    }
    particles.forEach(p => p.draw(ctx));
  }
  
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
}

function loop() {
  drawGame();
  requestAnimationFrame(loop);
}

document.getElementById('return-menu-btn').addEventListener('click', () => {
  serverState = null;
  changeScene('MAIN_MENU');
});

window.onload = () => {
  loadSave();
  loop();
};
