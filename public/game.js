const socket = typeof io !== 'undefined' ? io() : null;

// --- State ---
const MAX_HEALTH = 100;

const appState = {
  scene: 'LOADING',
  credits: 0,
  level: 1,
  avatar: 'hero_pig',
  outfit: null,
  effect: null,
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

// ─── LEADERBOARD DATA SYSTEM ──────────────────────────────────────────────────
const DEFAULT_LEADERBOARD = [
  { id: 'bot_1', name: "SHADOWMAGE", avatar: "hero_pig", level: 42, wpm: 9450, gold: 28500, isPlayer: false },
  { id: 'bot_2', name: "GANDALF_BLACK", avatar: "hero_bear", level: 38, wpm: 8200, gold: 19400, isPlayer: false },
  { id: 'bot_3', name: "SPELL_KNIGHT", avatar: "hero_cat", level: 31, wpm: 7100, gold: 14200, isPlayer: false },
  { id: 'bot_4', name: "VOID_CASTER", avatar: "hero_frog", level: 27, wpm: 6350, gold: 11000, isPlayer: false },
  { id: 'bot_5', name: "RUNEMASTER", avatar: "hero_dog", level: 22, wpm: 5400, gold: 8900, isPlayer: false },
  { id: 'bot_6', name: "NEO_WIZARD", avatar: "hero_chicken", level: 18, wpm: 4600, gold: 6500, isPlayer: false },
  { id: 'bot_7', name: "NOOB_SPELLER", avatar: "avatar_1", level: 12, wpm: 3050, gold: 3200, isPlayer: false },
  { id: 'bot_8', name: "GUEST_007", avatar: "avatar_2", level: 5, wpm: 1200, gold: 800, isPlayer: false }
];

function getLeaderboardData() {
  let list = [];
  const raw = localStorage.getItem('typing_battle_leaderboard');
  if (raw) {
    try {
      list = JSON.parse(raw);
    } catch(e) { list = []; }
  }
  if (!Array.isArray(list) || list.length === 0) {
    list = JSON.parse(JSON.stringify(DEFAULT_LEADERBOARD));
  }

  // Find or insert player entry
  const playerIndex = list.findIndex(item => item.isPlayer || item.id === 'local_player');
  const playerData = {
    id: 'local_player',
    name: appState.playerName || 'SPELLCASTER',
    avatar: appState.avatar || 'hero_pig',
    level: appState.level || 1,
    wpm: appState.wpmRecord || 0,
    gold: appState.credits || 0,
    isPlayer: true
  };

  if (playerIndex >= 0) {
    playerData.wpm = Math.max(playerData.wpm, list[playerIndex].wpm || 0);
    list[playerIndex] = playerData;
  } else {
    list.push(playerData);
  }

  // Sort descending by WPM
  list.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));

  // Save back to local storage
  localStorage.setItem('typing_battle_leaderboard', JSON.stringify(list));
  return list;
}

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
function onLetterCorrect(moveName, spellId) {
  totalHits++;
  totalAttempts++;
  combo = Math.min(combo + 1, 10);
  const comboEl = document.getElementById('combo-count');
  if (comboEl) comboEl.innerText = combo;

  const baseDmg = 10;
  const damage  = Math.floor(baseDmg * (1 + (combo - 1) * 0.15));

  const currentWpm = calculateWPM();
  const wpmEl = document.getElementById('game-my-wpm');
  if (wpmEl) wpmEl.innerText = currentWpm;

  const letter = typeof moveName === 'string' ? moveName.replace('Spell_', '') : 'SPELL';

  // Sync to server
  if (socket) {
    socket.emit('attack', { damage, wpm: currentWpm, letter, move: moveName, spellId });
  }
}

// Called by DualCombatScene when a mid-air projectile collision occurs
window.onSpellClash = function(id1, id2) {
  if (socket) {
    socket.emit('spellClash', { id1, id2 });
  }
};

// Called by DualCombatScene when wrong letter is pressed
function onLetterWrong() {
  totalAttempts++;
  combo = 1;
  const comboEl = document.getElementById('combo-count');
  if (comboEl) comboEl.innerText = combo;
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
        appState.outfit = parsed.outfit || null;
        appState.effect = parsed.effect || null;
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
      outfit: appState.outfit,
      effect: appState.effect,
      playerName: appState.playerName
    }));
    this.updateGlobalUI();
    if (socket) {
      socket.emit('submitScore', {
        name: appState.playerName,
        avatar: appState.avatar,
        level: appState.level,
        wpm: appState.wpmRecord,
        gold: appState.credits
      });
    }
  },

  getAvatarSrc(av) {
    if (!av || av === 'undefined' || av === 'null' || typeof av !== 'string') return 'assets/avatar_default.png';
    if (av.startsWith('data:image')) return av;
    
    let src = av;
    if (src.startsWith('assets/')) src = src.replace('assets/', '');
    src = src.split('.png')[0];
    
    return `assets/${src}.png`;
  },

  updateGlobalUI() {
    const lvlEl = document.getElementById('my-level');
    if (lvlEl) lvlEl.innerText = appState.level;
    
    const wpmEl = document.getElementById('my-wpm');
    if (wpmEl) wpmEl.innerText = appState.wpmRecord;
    
    const credEl = document.getElementById('shop-credits');
    if (credEl) credEl.innerText = appState.credits;

    const globCredEl = document.getElementById('global-credits');
    if (globCredEl) globCredEl.innerText = appState.credits;
    
    const nameEl = document.getElementById('my-name');
    if (nameEl) nameEl.innerText = appState.playerName;
    
    const avEl = document.getElementById('my-avatar');
    if (avEl) avEl.src = this.getAvatarSrc(appState.avatar);
    
    if (window.lobbyGraphics) {
      window.lobbyGraphics.setConfig(appState.outfit, appState.effect);
    }
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
      if (window.lobbyGraphics) {
        window.lobbyGraphics.setConfig(appState.outfit, appState.effect);
        window.lobbyGraphics.start();
      }
    } else {
      if (window.lobbyGraphics) window.lobbyGraphics.stop();
    }
  },

  openProfile() {
    document.getElementById('profile-panel').classList.add('active');
    document.getElementById('profile-name-input').value = appState.playerName;
    this.renderProfileAvatars();
    this.updateProfilePreview();
  },

  closeProfile() {
    document.getElementById('profile-panel').classList.remove('active');
  },

  saveProfile() {
    const newName = document.getElementById('profile-name-input').value.trim();
    if (newName) {
      appState.playerName = newName.substring(0, 15).toUpperCase();
    }
    this.saveGame();
    this.closeProfile();
  },

  updateProfilePreview() {
    const previewAv = document.getElementById('profile-current-avatar');
    if (previewAv) previewAv.src = this.getAvatarSrc(appState.avatar);
    const previewName = document.getElementById('profile-current-name');
    if (previewName) previewName.innerText = appState.playerName;
  },

  renderProfileAvatars() {
    const grid = document.getElementById('profile-avatar-grid');
    const available = ['hero_pig', 'hero_cat', 'hero_dog', 'hero_bear', 'hero_chicken', 'hero_frog', 'avatar_1', 'avatar_2'];
    grid.innerHTML = available.map(av => `
      <div class="aaa-avatar-item ${appState.avatar === av ? 'selected' : ''}" onclick="app.selectProfileAvatar('${av}')">
        <div class="aaa-avatar-circle">
          <img src="${this.getAvatarSrc(av)}" onerror="this.src='assets/avatar_default.png'">
        </div>
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
        this.updateProfilePreview();
      };
      reader.readAsDataURL(file);
    }
  },

  selectProfileAvatar(avId) {
    appState.avatar = avId;
    this.renderProfileAvatars();
    this.updateProfilePreview();
  },

  openShop() {
    this.changeScene('shop-screen');
    shop.render();
  },
  
  closeShop() {
    this.changeScene('lobby-screen');
  },

  openLeaderboard() {
    this.changeScene('leaderboard-screen');
    if (socket) socket.emit('getLeaderboard');
    this.renderLeaderboard();
  },

  closeLeaderboard() {
    this.changeScene('lobby-screen');
  },

  renderLeaderboard() {
    const list = getLeaderboardData();
    const podiumEl = document.getElementById('lb-podium');
    const tableEl = document.getElementById('leaderboard-list');

    // Podium Top 3
    const p1 = list[0] || { name: '—', wpm: 0, avatar: 'hero_pig', level: 1 };
    const p2 = list[1] || { name: '—', wpm: 0, avatar: 'hero_cat', level: 1 };
    const p3 = list[2] || { name: '—', wpm: 0, avatar: 'hero_bear', level: 1 };

    if (podiumEl) {
      podiumEl.innerHTML = `
        <div class="podium-card rank-2">
          <div class="podium-badge">🥈 #2</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p2.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p2.name} ${p2.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${p2.wpm} WPM</div>
        </div>
        <div class="podium-card rank-1">
          <div class="podium-badge">👑 #1</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p1.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p1.name} ${p1.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${p1.wpm} WPM</div>
        </div>
        <div class="podium-card rank-3">
          <div class="podium-badge">🥉 #3</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p3.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p3.name} ${p3.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${p3.wpm} WPM</div>
        </div>
      `;
    }

    if (tableEl) {
      tableEl.innerHTML = list.map((item, idx) => {
        const rankNum = idx + 1;
        const rankClass = rankNum <= 3 ? `rank-${rankNum}` : '';
        const myClass = item.isPlayer ? 'my-rank' : '';
        return `
          <div class="lb-row ${rankClass} ${myClass}">
            <div class="lb-rank-num">#${rankNum}</div>
            <div class="lb-col-player">
              <img class="lb-row-avatar" src="${this.getAvatarSrc(item.avatar)}" onerror="this.src='assets/avatar_default.png'">
              <span>${item.name} ${item.isPlayer ? '<span style="color:#3daeff; font-size:0.85rem; font-weight:900;">(YOU)</span>' : ''}</span>
            </div>
            <div class="lb-col-level">Lvl. ${item.level || 1}</div>
            <div class="lb-col-wpm">${item.wpm || 0} WPM</div>
            <div class="lb-col-gold">🟡 ${(item.gold || 0).toLocaleString()}</div>
          </div>
        `;
      }).join('');
    }
  },

  openSettings() {
    document.getElementById('settings-panel').classList.add('active');
  },

  closeSettings() {
    document.getElementById('settings-panel').classList.remove('active');
  },

  openFriendMenu() {
    document.getElementById('friend-panel').classList.add('active');
  },

  closeFriendMenu() {
    document.getElementById('friend-panel').classList.remove('active');
  },

  findMatch() {
    this.changeScene('waiting-screen');
    const myNameEl = document.getElementById('wait-my-name');
    const myAvEl = document.getElementById('wait-my-avatar');
    if (myNameEl) myNameEl.innerText = appState.playerName;
    if (myAvEl) myAvEl.src = this.getAvatarSrc(appState.avatar);

    const rcDisplay = document.getElementById('room-code-display');
    if (rcDisplay) {
      rcDisplay.innerText = '';
      rcDisplay.classList.add('hidden');
    }

    if (socket) {
      socket.emit('joinRandom', { 
        name: appState.playerName, 
        avatar: appState.avatar,
        outfit: appState.outfit,
        effect: appState.effect
      });
    } else {
      setTimeout(() => app.handleMatchStarted({ roomId: 'local', playerNum: 1, enemyName: 'GANDALF_BOT', enemyHero: 'hero_gold' }), 1000);
    }
  },

  hostGame() {
    this.changeScene('waiting-screen');
    const myNameEl = document.getElementById('wait-my-name');
    const myAvEl = document.getElementById('wait-my-avatar');
    if (myNameEl) myNameEl.innerText = appState.playerName;
    if (myAvEl) myAvEl.src = this.getAvatarSrc(appState.avatar);
    
    if (socket) {
      socket.emit('createRoom', {
        name: appState.playerName, 
        avatar: appState.avatar,
        outfit: appState.outfit,
        effect: appState.effect
      });
    }
  },

  joinGame() {
    const code = prompt("Enter 4-letter Room Code to Join:");
    if (!code || code.trim().length !== 4) return;
    
    this.changeScene('waiting-screen');
    const myNameEl = document.getElementById('wait-my-name');
    const myAvEl = document.getElementById('wait-my-avatar');
    if (myNameEl) myNameEl.innerText = appState.playerName;
    if (myAvEl) myAvEl.src = this.getAvatarSrc(appState.avatar);
    
    if (socket) {
      socket.emit('joinRoom', {
        code: code.trim().toUpperCase(),
        playerData: {
          name: appState.playerName, 
          avatar: appState.avatar,
          outfit: appState.outfit,
          effect: appState.effect
        }
      });
    }
  },

  cancelMatch() {
    if (appState.botFallbackTimer) clearTimeout(appState.botFallbackTimer);
    if (socket) socket.emit('leaveQueue');
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
    if (graphics) {
      if (appState.match.isPlayer1) {
        graphics.setConfig(appState.outfit, appState.effect, appState.match.enemyOutfit, appState.match.enemyEffect);
      } else {
        graphics.setConfig(appState.match.enemyOutfit, appState.match.enemyEffect, appState.outfit, appState.effect);
      }
      graphics.start();
    }
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
  },
  
  handleMatchStarted(data) {
    if (appState.botFallbackTimer) {
      clearTimeout(appState.botFallbackTimer);
      appState.botFallbackTimer = null;
    }

    // data: { roomId, playerNum, enemyHero, enemyName }
    appState.match.isPlayer1 = (data.playerNum === 1);
    const eName = data.enemyName || '???';
    appState.match.enemyOutfit = data.enemyOutfit || null;
    appState.match.enemyEffect = data.enemyEffect || null;
    
    // Set names in waiting & VS screens
    const vsMyName = document.getElementById('vs-my-name');
    if (vsMyName) vsMyName.innerText = appState.playerName;
    const vsEnemyName = document.getElementById('vs-enemy-name');
    if (vsEnemyName) vsEnemyName.innerText = eName;
    const waitEnemyName = document.getElementById('wait-enemy-name');
    if (waitEnemyName) waitEnemyName.innerText = eName;

    const vsMyAvatar = document.getElementById('vs-my-avatar');
    if (vsMyAvatar) vsMyAvatar.src = app.getAvatarSrc(appState.avatar);
    const vsEnemyAvatar = document.getElementById('vs-enemy-avatar');
    if (vsEnemyAvatar) vsEnemyAvatar.src = app.getAvatarSrc(data.enemyHero);
    const waitEnemyAvatar = document.getElementById('wait-enemy-avatar');
    if (waitEnemyAvatar) waitEnemyAvatar.src = app.getAvatarSrc(data.enemyHero);
    
    // Set in Game screen HUD
    const gameMyName = document.getElementById('game-my-name');
    if (gameMyName) gameMyName.innerText = appState.playerName;
    const gameEnemyName = document.getElementById('game-enemy-name');
    if (gameEnemyName) gameEnemyName.innerText = eName;

    const gameMyAvatar = document.getElementById('game-my-avatar');
    if (gameMyAvatar) gameMyAvatar.src = app.getAvatarSrc(appState.avatar);
    const gameEnemyAvatar = document.getElementById('game-enemy-avatar');
    if (gameEnemyAvatar) gameEnemyAvatar.src = app.getAvatarSrc(data.enemyHero);
    
    app.startCountdown();
  }
};

// --- Networking (Socket) ---
if (socket) {
  socket.on('matchStarted', (data) => app.handleMatchStarted(data));

  socket.on('gameState', (state) => {
    if (!appState.match.inMatch) return;
    
    const myState = appState.match.isPlayer1 ? state.p1 : state.p2;
    const enemyState = appState.match.isPlayer1 ? state.p2 : state.p1;
    
    // Health
    appState.match.myHealth = myState.health;
    appState.match.enemyHealth = enemyState.health;
    
    const myHpBar = document.getElementById('my-health');
    const enemyHpBar = document.getElementById('enemy-health');
    if (myHpBar) myHpBar.style.width = `${Math.max(0, (myState.health / MAX_HEALTH) * 100)}%`;
    if (enemyHpBar) enemyHpBar.style.width = `${Math.max(0, (enemyState.health / MAX_HEALTH) * 100)}%`;
    
    // Update health bars in combat scene using percentages
    if (graphics) graphics.updateHealthBars((myState.health / MAX_HEALTH) * 100, (enemyState.health / MAX_HEALTH) * 100);
    
    // Stats
    const myDmgEl = document.getElementById('game-my-dmg');
    if (myDmgEl) myDmgEl.innerText = myState.dmg;
    const enemyDmgEl = document.getElementById('game-enemy-dmg');
    if (enemyDmgEl) enemyDmgEl.innerText = enemyState.dmg;
    const enemyWpmEl = document.getElementById('game-enemy-wpm');
    if (enemyWpmEl) enemyWpmEl.innerText = enemyState.wpm;
  });

  socket.on('opponentAttack', (data) => {
    if (graphics) {
      graphics.triggerEnemyAttack(data.letter || 'SPELL', data.spellId);
    }
  });

  socket.on('leaderboardData', (serverList) => {
    if (Array.isArray(serverList)) {
      localStorage.setItem('typing_battle_leaderboard', JSON.stringify(serverList));
      if (appState.scene === 'leaderboard-screen') {
        app.renderLeaderboard();
      }
    }
  });

  socket.on('gameOver', (data) => {
    app.endGame(data.winner);
  });

  socket.on('roomCreated', (roomId) => {
    const rcDisplay = document.getElementById('room-code-display');
    const ticker = document.getElementById('match-ticker');
    if (rcDisplay) {
      rcDisplay.innerHTML = `ROOM CODE: <span style="cursor:pointer; text-decoration:underline;" onclick="navigator.clipboard.writeText('${roomId}'); alert('Code copied!')">${roomId}</span>`;
      rcDisplay.classList.remove('hidden');
    }
    if (ticker) {
      ticker.innerText = 'WAITING FOR FRIEND...';
    }
  });

  socket.on('roomError', (msg) => {
    alert(msg);
    app.cancelMatch();
  });
}

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

