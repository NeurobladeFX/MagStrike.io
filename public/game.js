// Connect explicitly to the Render backend with a fallback
const RENDER_URL = 'https://magstrike-io.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

// Mock socket in case of total offline failure or CDN block
const mockSocket = { on: () => {}, emit: () => {}, disconnect: () => {} };
let socket = mockSocket;

if (typeof io !== 'undefined') {
  socket = io(RENDER_URL, { timeout: 4000 }); // 4 second timeout
} else {
  console.error("Socket.io failed to load from CDN. Operating in offline UI mode.");
  setTimeout(() => {
    document.getElementById('matchmaking-status').innerText = "Network Error: Cannot connect to multiplayer server.";
    document.getElementById('matchmaking-status').style.display = 'block';
  }, 1000);
}

function initSocketFallback() {
  socket.on('connect_error', () => {
    console.warn("Render server timed out. Falling back to localhost...");
    document.getElementById('matchmaking-status').innerText = "Render sleeping... connecting local.";
    document.getElementById('matchmaking-status').style.display = 'block';
    socket.disconnect();
    socket = io(LOCAL_URL);
    
    socket.on('connect', () => {
      document.getElementById('matchmaking-status').style.display = 'none';
      bindSocketEvents();
    });
  });
  bindSocketEvents();
}

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
  'GAME_OVER': document.getElementById('game-over'),
  'VERSUS_SCREEN': document.getElementById('versus-screen'),
  'WAITING_LOBBY': document.getElementById('waiting-lobby'),
  'GLOBAL_LOADER': document.getElementById('global-loader')
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
  
  if (saveData.customAvatar) {
    document.getElementById('profile-avatar-preview').src = saveData.customAvatar;
    if (assets.striker_blue) assets.striker_blue.src = saveData.customAvatar;
    if (assets.striker_red) assets.striker_red.src = saveData.customAvatar;
  }
}

// Custom Avatar Upload Logic
document.getElementById('avatar-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        const dataUrl = canvas.toDataURL('image/png');
        
        saveData.customAvatar = dataUrl;
        saveGame();
        
        document.getElementById('profile-avatar-preview').src = dataUrl;
        // assets.avatar_1.src = dataUrl;
        
        if (socket && socket.connected) {
          socket.emit('updateAvatar', dataUrl);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
});

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
  // Show loader briefly
  scenes['GLOBAL_LOADER'].style.display = 'flex';
  
  setTimeout(() => {
    Object.values(scenes).forEach(s => {
      if(s) s.classList.remove('active');
    });
    
    if(scenes[newScene]) scenes[newScene].classList.add('active');
    gameState = newScene;

    if (newScene === 'MAIN_MENU') {
      statusText.style.display = 'none';
    } else if (newScene === 'SHOP') {
      renderShop();
    }
    
    scenes['GLOBAL_LOADER'].style.display = 'none';
  }, 500);
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
    const isEquipped = saveData.equippedTrail === item.id || saveData.equippedAvatar === item.id;
    
    const div = document.createElement('div');
    div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
    
    // Different icon style for avatars
    const iconStr = item.type === 'avatar' 
      ? `<div class="item-icon" style="background: radial-gradient(circle, ${item.color} 50%, #fff 50%); border: 2px solid #555;"></div>`
      : `<div class="item-icon" style="background: radial-gradient(circle, ${item.color} 20%, transparent 80%); border: 2px solid #555;"></div>`;
      
    let btnHtml = '';
    if (isEquipped) {
      btnHtml = `<button class="item-btn btn-equipped" disabled>Equipped</button>`;
    } else if (isOwned) {
      btnHtml = `<button class="item-btn btn-equip" onclick="equipItem('${item.id}', '${item.type}')">Equip</button>`;
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

window.equipItem = function(id, type) {
  if (type === 'avatar') {
    saveData.equippedAvatar = id;
    if (id === 'avatar_dog') saveData.customAvatar = 'assets/avatar_1.png';
    else if (id === 'avatar_alien') saveData.customAvatar = 'assets/avatar_2.png';
    
    // Update local preview and game assets instantly
    document.getElementById('profile-avatar-preview').src = saveData.customAvatar;
    if (assets.striker_blue) assets.striker_blue.src = saveData.customAvatar;
    if (assets.striker_red) assets.striker_red.src = saveData.customAvatar;
    
    if (socket && socket.connected) {
      // Need to convert to base64 if we want to send to server, or server handles IDs.
      // For now, this changes local visually.
    }
  } else {
    saveData.equippedTrail = id;
    socket.emit('equipTrail', id);
  }
  saveGame();
  renderShop();
}

// ==========================================
// 3. Socket.io Matchmaking & Fullscreen
// ==========================================
function attemptFullscreen() {
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(err => console.log("Fullscreen blocked"));
  }
}

document.getElementById('play-random-btn').addEventListener('click', () => {
  attemptFullscreen();
  socket.emit('joinRandom');
  changeScene('WAITING_LOBBY');
  document.getElementById('waiting-text').innerText = "SEARCHING FOR OPPONENT...";
});

document.getElementById('create-room-btn').addEventListener('click', () => {
  attemptFullscreen();
  socket.emit('createRoom');
  changeScene('WAITING_LOBBY');
  document.getElementById('waiting-text').innerText = "CREATING ROOM...";
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  attemptFullscreen();
  const code = document.getElementById('room-code-input').value.trim();
  if (code) {
    socket.emit('joinRoom', code);
    changeScene('WAITING_LOBBY');
    document.getElementById('waiting-text').innerText = "JOINING ROOM...";
  }
});

document.getElementById('cancel-matchmaking-btn').addEventListener('click', () => {
  // If we had a leave logic in socket we'd emit it here
  socket.disconnect(); // brute force cancel
  socket = io(LOCAL_URL); // Reconnect
  initSocketFallback(); // rebind
  changeScene('MAIN_MENU');
});

function bindSocketEvents() {
  socket.on('waitingForMatch', () => {
    document.getElementById('waiting-text').innerText = "SEARCHING FOR OPPONENT...";
  });

  socket.on('roomCreated', (roomId) => {
    document.getElementById('waiting-text').innerText = `ROOM CREATED!\nCODE: ${roomId}\nWAITING FOR PLAYER...`;
  });

  socket.on('roomError', (msg) => {
    document.getElementById('waiting-text').innerText = msg;
    setTimeout(() => { if(gameState === 'WAITING_LOBBY') changeScene('MAIN_MENU'); }, 2000);
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
    
    changeScene('VERSUS_SCREEN');
  });

  socket.on('opponentDisconnected', () => {
    if (gameState === 'GAMEPLAY') {
      document.getElementById('winner-text').innerText = "Opponent Disconnected";
      document.getElementById('winner-text').style.color = "#fff";
      document.getElementById('reward-text').innerText = "";
      changeScene('GAME_OVER');
    }
  });

  socket.on('state', (state) => {
    serverState = state;
    spawnTrails(state);
    
    if (gameState === 'VERSUS_SCREEN') {
      document.getElementById('vs-p1-name').innerText = state.p1.username || 'Player 1';
      document.getElementById('vs-p2-name').innerText = state.p2.username || 'Player 2';
      
      if (state.status === 'COUNTDOWN') {
        document.getElementById('vs-countdown').innerText = state.countdown;
      } else if (state.status === 'PLAYING') {
        // Direct DOM swap to avoid loading delay
        scenes['VERSUS_SCREEN'].classList.remove('active');
        scenes['GAMEPLAY'].classList.add('active');
        gameState = 'GAMEPLAY';
      }
    }
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
    document.getElementById('winner-text').style.color = winner === 1 ? '#54a0ff' : '#ff6b6b';
    document.getElementById('winner-text').style.textShadow = `2px 2px 0px #fff`;
    
    changeScene('GAME_OVER');
  });
}

// Initialize socket handling
initSocketFallback();

// ==========================================
// 4. Game Engine & Rendering
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const assets = {
  home_bg: new Image(),
  game_bg: new Image(),
  striker_blue: new Image(),
  striker_red: new Image(),
  metal_ball: new Image()
};

function preloadAssets(callback) {
  let loaded = 0;
  const keys = Object.keys(assets);
  keys.forEach(key => {
    assets[key].src = `assets/${key}.png`;
    assets[key].onload = () => {
      loaded++;
      if (loaded === keys.length) callback();
    };
  });
}

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

function drawEntity(x, y, radius, img, username) {
  // Draw Asset
  ctx.save();
  ctx.translate(x, y);
  ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
  
  if (username) {
    ctx.font = '900 18px Nunito, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(username, x, y - radius - 15);
    ctx.shadowBlur = 0; // reset
  }
}

function drawArena() {
  // Draw Grass Field instead of image to fit theme perfectly
  ctx.fillStyle = '#55efc4'; // Bright green grass
  ctx.fillRect(0, 0, 1200, 800);
  
  // Field stripes
  ctx.fillStyle = '#00b894'; // Darker grass stripe
  for(let i=0; i<1200; i+=100) {
    if ((i/100)%2 === 0) ctx.fillRect(i, 0, 100, 800);
  }
  
  // Outer bounds and center line
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, 1160, 760);
  
  ctx.beginPath();
  ctx.moveTo(600, 20);
  ctx.lineTo(600, 780);
  ctx.stroke();
  
  // Center circle
  ctx.beginPath();
  ctx.arc(600, 400, 120, 0, Math.PI*2);
  ctx.stroke();
  
  // Goal Zones highlight
  const goalH = 400;
  const goalY = (800 - goalH)/2;
  
  ctx.fillStyle = 'rgba(116, 185, 255, 0.4)';
  ctx.fillRect(20, goalY, 40, goalH);
  ctx.strokeRect(20, goalY, 40, goalH);
  
  ctx.fillStyle = 'rgba(255, 118, 117, 0.4)';
  ctx.fillRect(1140, goalY, 40, goalH);
  ctx.strokeRect(1140, goalY, 40, goalH);
}

function drawGame() {
  if (gameState === 'GAMEPLAY' || gameState === 'GAME_OVER') {
    drawArena();
    
    if (serverState) {
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
      
      drawEntity(serverState.p1.x, serverState.p1.y, 30, assets.striker_blue, serverState.p1.username);
      drawEntity(serverState.p2.x, serverState.p2.y, 30, assets.striker_red, serverState.p2.username);
      
      if (serverState.ball.x > 0) {
        ctx.save();
        ctx.translate(serverState.ball.x, serverState.ball.y);
        ctx.drawImage(assets.metal_ball, -serverState.ball.radius, -serverState.ball.radius, serverState.ball.radius * 2, serverState.ball.radius * 2);
        ctx.restore();
      }
    }
  } else {
    // Menu background: beautiful sunny sky gradient instead of the arena field
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 800);
    bgGradient.addColorStop(0, '#74b9ff');
    bgGradient.addColorStop(1, '#81ecec');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1200, 800);
    
    if (Math.random() < 0.1) {
      particles.push(new Particle(Math.random()*1200, Math.random()*800, 'rgba(255,255,255,0.4)', 100, Math.random()*3+1));
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
  preloadAssets(() => {
    scenes['GLOBAL_LOADER'].style.display = 'none';
    loadSave();
    loop();
  });
  
  // Setup perfect UI scaling to match the canvas aspect ratio on any screen size
  const uiLayer = document.getElementById('ui-layer');
  const wrapper = document.querySelector('.game-wrapper');
  if (uiLayer && wrapper) {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        // The game has a fixed logical width of 1200px.
        // We scale the UI layer down to exactly match the container's actual CSS rendered width.
        const scale = entry.contentRect.width / 1200;
        uiLayer.style.transform = `scale(${scale})`;
      }
    });
    resizeObserver.observe(wrapper);
  }
};
