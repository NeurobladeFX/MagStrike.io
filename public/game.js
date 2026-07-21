const socket = typeof io !== 'undefined' ? io() : null;

// --- State ---
const MAX_HEALTH = 100;

const appState = {
  scene: 'LOADING',
  credits: 0,
  level: 1,
  avatar: 'hero_pig',
  playerName: 'SPELLCASTER',
  wpmRecord: 0,
  match: {
    inMatch: false,
    timer: 0,
    startTime: 0,
    myHealth: MAX_HEALTH,
    enemyHealth: MAX_HEALTH,
    myDmg: 0,
    enemyDmg: 0,
    myWpm: 0,
    enemyWpm: 0,
    isPlayer1: true
  }
};

// ─── LETTER-BURST COMBAT SYSTEM ──────────────────────────────────────────────
// Input is now managed entirely by DualCombatScene.LetterBurst internally.
// game.js only handles damage values, server sync, and UI HUD.

let combo            = 1;
let totalHits        = 0;   // correct keypresses
let totalAttempts    = 0;   // total keypresses
let matchStartTime   = 0;
let isTypingActive   = false;

function calculateWPM() {
  if (!matchStartTime) return 0;
  const minutes = (Date.now() - matchStartTime) / 60000;
  if (minutes < 0.05) return 0;
  // In letter-burst mode: each correct hit ≈ 1 "word"
  return Math.floor(totalHits / Math.max(minutes, 0.01));
}

// Called by DualCombatScene when a correct letter is pressed
function onLetterCorrect(moveName) {
  totalHits++;
  totalAttempts++;
  combo = Math.min(combo + 1, 10);
  document.getElementById('combo-count').innerText = combo;

  const baseDmg = 10;
  const damage  = Math.floor(baseDmg * (1 + (combo - 1) * 0.15));

  const currentWpm = calculateWPM();
  document.getElementById('game-my-wpm').innerText = currentWpm;

  // Sync to server
  socket.emit('attack', { damage, wpm: currentWpm, move: moveName });
}

// Called by DualCombatScene when wrong letter is pressed
function onLetterWrong() {
  totalAttempts++;
  combo = 1;
  document.getElementById('combo-count').innerText = combo;
}


// --- App Flow / Scene Management ---
const app = {
  init() {
    this.loadSave();

    // Animated loading bar then transition to lobby
    let prog = 0;
    const bar = document.getElementById('progress-bar');
    const tick = setInterval(() => {
      prog = Math.min(prog + Math.random() * 18, 100);
      if (bar) bar.style.width = prog + '%';
      if (prog >= 100) {
        clearInterval(tick);
        setTimeout(() => this.changeScene('lobby-screen'), 300);
      }
    }, 80);

    // Tick loop for match HUD
    setInterval(this.matchTick.bind(this), 500);
  },

  loadSave() {
    const data = localStorage.getItem('typing_battle_save');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        appState.credits = parsed.credits || 0;
        appState.level = parsed.level || 1;
        appState.wpmRecord = parsed.wpmRecord || 0;
        appState.avatar = parsed.avatar || 'hero_pig';
        appState.playerName = parsed.playerName || 'SPELLCASTER';
      } catch (e) { console.error('Save corrupt'); }
    }
    this.updateGlobalUI();
  },

  saveGame() {
    localStorage.setItem('typing_battle_save', JSON.stringify({
      credits: appState.credits,
      level: appState.level,
      wpmRecord: appState.wpmRecord,
      avatar: appState.avatar,
      playerName: appState.playerName
    }));
    this.updateGlobalUI();
  },

  getAvatarSrc(av) {
    if (!av) return 'assets/avatar_default.png';
    if (av.startsWith('data:image')) return av;
    return `assets/${av}.png`;
  },

  updateGlobalUI() {
    const lvlEl = document.getElementById('my-level');
    if (lvlEl) lvlEl.innerText = appState.level;
    
    const wpmEl = document.getElementById('my-wpm');
    if (wpmEl) wpmEl.innerText = appState.wpmRecord;
    
    const credEl = document.getElementById('shop-credits');
    if (credEl) credEl.innerText = appState.credits;
    
    const nameEl = document.getElementById('my-name');
    if (nameEl) nameEl.innerText = appState.playerName;
    
    const avEl = document.getElementById('my-avatar');
    if (avEl) avEl.src = this.getAvatarSrc(appState.avatar);
  },

  changeScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
    document.getElementById(sceneId).classList.add('active');
    appState.scene = sceneId;
    
    // Manage lobby stickman rendering
    if (sceneId === 'lobby-screen') {
      if (!window.lobbyGraphics) {
        const c = document.getElementById('lobby-stickman-canvas');
        if (c) window.lobbyGraphics = new LobbyStickmanScene(c);
      }
      if (window.lobbyGraphics) window.lobbyGraphics.start();
    } else {
      if (window.lobbyGraphics) window.lobbyGraphics.stop();
    }
  },

  openProfile() {
    document.getElementById('profile-panel').classList.add('active');
    document.getElementById('profile-name-input').value = appState.playerName;
    this.renderProfileAvatars();
  },

  closeProfile() {
    document.getElementById('profile-panel').classList.remove('active');
  },

  saveProfile() {
    const newName = document.getElementById('profile-name-input').value.trim();
    if (newName) appState.playerName = newName.toUpperCase();
    this.saveGame();
    this.closeProfile();
  },

  renderProfileAvatars() {
    const grid = document.getElementById('profile-avatar-grid');
    const available = ['hero_pig', 'hero_cat', 'hero_dog', 'hero_bear', 'hero_chicken', 'hero_frog', 'avatar_1', 'avatar_2'];
    grid.innerHTML = available.map(av => `
      <div class="shop-item ${appState.avatar === av ? 'selected' : ''}" onclick="app.selectProfileAvatar('${av}')">
        <img class="avatar-preview" src="${this.getAvatarSrc(av)}" onerror="this.src='assets/avatar_default.png'">
      </div>
    `).join('');
  },

  handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        appState.avatar = e.target.result;
        this.saveGame();
        this.renderProfileAvatars();
      };
      reader.readAsDataURL(file);
    }
  },

  selectProfileAvatar(avId) {
    appState.avatar = avId;
    this.renderProfileAvatars(); // Re-render to highlight
  },

  openShop() {
    document.getElementById('shop-panel').classList.add('active');
  },
  
  closeShop() {
    document.getElementById('shop-panel').classList.remove('active');
  },

  findMatch() {
    this.changeScene('waiting-screen');
    document.getElementById('wait-enemy-side').classList.add('hidden');
    const ticker = document.getElementById('match-ticker');
    if (ticker) ticker.innerText = 'SEARCHING FOR OPPONENT...';
    socket.emit('joinRandom', { avatar: appState.avatar, name: appState.playerName });
  },

  cancelMatch() {
    socket.emit('leaveQueue');
    this.changeScene('lobby-screen');
  },
  
  startCountdown(enemyData) {
    const ticker = document.getElementById('match-ticker');
    if (ticker) ticker.innerText = 'OPPONENT FOUND!';
    document.getElementById('wait-enemy-side').classList.remove('hidden');

    setTimeout(() => {
      this.changeScene('vs-screen');
      let count = 3;
      const cdEl = document.getElementById('vs-countdown');
      cdEl.innerText = count;
      
      const ival = setInterval(() => {
        count--;
        if (count > 0) {
          cdEl.innerText = count;
        } else {
          clearInterval(ival);
          this.startGameplay();
        }
      }, 1000);
    }, 1500);
  },

  startGameplay() {
    this.changeScene('game-screen');
    
    appState.match.inMatch = true;
    appState.match.myHealth = MAX_HEALTH;
    appState.match.enemyHealth = MAX_HEALTH;
    appState.match.myDmg = 0;
    appState.match.enemyDmg = 0;
    
    document.getElementById('my-health').style.width = '100%';
    document.getElementById('enemy-health').style.width = '100%';
    
    matchStartTime = Date.now();
    totalHits      = 0;
    totalAttempts  = 0;
    combo          = 1;
    isTypingActive = true;

    document.getElementById('combo-count').innerText = '1';

    // Start the high-performance combat renderer (LetterBelt starts inside)
    if (graphics) graphics.start();
  },

  matchTick() {
    if (!appState.match.inMatch) return;
    
    // Update local timer
    const seconds = Math.floor((Date.now() - matchStartTime) / 1000);
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('game-timer').innerText = `${m}:${s}`;
    
    // Update WPM local calculation strictly for UI smoothness
    if (isTypingActive) {
      const wpm = calculateWPM();
      document.getElementById('game-my-wpm').innerText = wpm;
    }
  },

  endGame(winnerNum) {
    appState.match.inMatch = false;
    isTypingActive = false;
    if (graphics) graphics.stop();

    const isWinner = (winnerNum === 1 && appState.match.isPlayer1)
                  || (winnerNum === 2 && !appState.match.isPlayer1);

    this.changeScene('game-over-screen');

    const titleEl = document.getElementById('result-title');
    titleEl.innerText = isWinner ? 'VICTORY' : 'DEFEAT';
    titleEl.style.color = isWinner ? '#2ecc71' : '#e74c3c';

    const finalHps = calculateWPM();
    const accuracy = totalAttempts === 0 ? '—'
      : Math.round((totalHits / totalAttempts) * 100) + '%';
    const creditsEarned = isWinner ? 50 : 10;

    document.getElementById('result-words').innerText   = totalHits;
    document.getElementById('result-wpm').innerText     = `${finalHps} HPS`;
    document.getElementById('result-accuracy').innerText = accuracy;
    document.getElementById('result-credits').innerText = `+${creditsEarned}`;

    appState.credits += creditsEarned;
    if (finalHps > appState.wpmRecord) appState.wpmRecord = finalHps;
    this.saveGame();
  },
  
  returnToLobby() {
    this.changeScene('lobby-screen');
  }
};

// --- Networking (Socket) ---
socket.on('matchStarted', (data) => {
  // data: { roomId, playerNum, enemyHero, enemyName }
  appState.match.isPlayer1 = (data.playerNum === 1);
  const eName = data.enemyName || '???';
  
  // Set in VS screen
  document.getElementById('vs-enemy-name').innerText = eName;
  document.getElementById('vs-my-avatar').src = app.getAvatarSrc(appState.avatar);
  document.getElementById('vs-enemy-avatar').src = app.getAvatarSrc(data.enemyHero);
  document.getElementById('wait-enemy-avatar').src = app.getAvatarSrc(data.enemyHero);
  
  // Set in Game screen HUD
  document.getElementById('game-enemy-name').innerText = eName;
  
  app.startCountdown();
});

socket.on('gameState', (state) => {
  if (!appState.match.inMatch) return;
  
  // server sends { p1: { health, dmg, wpm, isAttacking }, p2: { health, dmg, wpm, isAttacking } }
  const myState = appState.match.isPlayer1 ? state.p1 : state.p2;
  const enemyState = appState.match.isPlayer1 ? state.p2 : state.p1;
  
  // Health
  appState.match.myHealth = myState.health;
  appState.match.enemyHealth = enemyState.health;
  
  document.getElementById('my-health').style.width = `${Math.max(0, (myState.health / MAX_HEALTH) * 100)}%`;
  document.getElementById('enemy-health').style.width = `${Math.max(0, (enemyState.health / MAX_HEALTH) * 100)}%`;
  
  // Check enemy attacks for animation
  if (enemyState.isAttacking) {
    if (graphics) graphics.triggerEnemyAttack();
  }
  
  // Update health bars in combat scene using percentages
  if (graphics) graphics.updateHealthBars((myState.health / MAX_HEALTH) * 100, (enemyState.health / MAX_HEALTH) * 100);
  
  // Stats
  document.getElementById('game-my-dmg').innerText = myState.dmg;
  document.getElementById('game-enemy-dmg').innerText = enemyState.dmg;
  document.getElementById('game-enemy-wpm').innerText = enemyState.wpm;
});

socket.on('gameOver', (data) => {
  app.endGame(data.winner);
});

socket.on('roomError', (msg) => {
  alert(msg);
  app.cancelMatch();
});

// --- Canvas Graphics Engine (DualCombatScene from SwordCombatEngine.js) ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DualCombatScene instance — initialized once the page loads (see Boot section)
let graphics = null;
// --- Boot ---
window.onload = () => {
  // Initialize the high-performance combat renderer
  graphics = new DualCombatScene(canvas);
  app.init();
};

