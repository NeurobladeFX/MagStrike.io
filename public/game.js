const socket = typeof io !== 'undefined' ? io('https://magstrike-io.onrender.com', {
  transports: ['polling', 'websocket'],
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  timeout: 20000
}) : null;

// --- State ---
const MAX_HEALTH = 100;

const appState = {
  scene: 'LOADING',
  credits: 0,
  level: 1,
  avatar: 'avatar_stickman_assassin',
  outfit: null,
  effect: null,
  armband: null,
  playerName: 'SPELLCASTER',
  wpmRecord: 0,
  wins: 0,
  losses: 0,
  xp: 0,
  trophyPoints: 0,
  trophyRank: 1,
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
  },
  playerId: localStorage.getItem('magstrike_player_id') || Math.random().toString(36).substring(2)
};
localStorage.setItem('magstrike_player_id', appState.playerId);

// ─── LEADERBOARD DATA SYSTEM ──────────────────────────────────────────────────
const DEFAULT_LEADERBOARD = [
  { id: 'bot_1', name: "SHADOWMAGE", avatar: "avatar_stickman_assassin", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_2', name: "GANDALF_BLACK", avatar: "avatar_stickman_elder", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_3', name: "SPELL_KNIGHT", avatar: "avatar_stickman_warrior", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_4', name: "VOID_CASTER", avatar: "avatar_stickman_mage", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_5', name: "RUNEMASTER", avatar: "avatar_stickman_rogue", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_6', name: "NEO_WIZARD", avatar: "avatar_stickman_youth", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_7', name: "NOOB_SPELLER", avatar: "avatar_stickman_assassin", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false },
  { id: 'bot_8', name: "GUEST_007", avatar: "avatar_stickman_warrior", level: 0, wpm: 0, gold: 0, wins: 0, isPlayer: false }
];

function getLeaderboardData() {
  let list = [];
  const raw = localStorage.getItem('typing_battle_leaderboard');
  if (raw) {
    try {
      let parsed = JSON.parse(raw);
      // Keep only real network players (filter out cached bots from server AND old local_player entries)
      list = parsed.filter(item => (item.isPlayer || (item.id && !item.id.startsWith('bot_'))) && item.id !== 'local_player');
    } catch(e) { list = []; }
  }
  
  // Always append fresh zeroed bots
  const bots = JSON.parse(JSON.stringify(DEFAULT_LEADERBOARD));
  list.push(...bots);

  // Find or insert player entry
  let playerIndex = list.findIndex(item => item.playerId === appState.playerId);
  if (playerIndex === -1) {
    playerIndex = list.length;
    list.push({});
  }

  const playerData = list[playerIndex];
  playerData.playerId = appState.playerId;
  playerData.id = playerData.id || 'local_player';
  playerData.name = appState.playerName || 'SPELLCASTER';
  playerData.avatar = appState.avatar || 'avatar_stickman_assassin';
  playerData.level = appState.level || 1;
  playerData.wpm = Math.max(playerData.wpm || 0, appState.wpmRecord || 0);
  playerData.gold = appState.credits || 0;
  playerData.wins = appState.wins || 0;
  playerData.losses = appState.losses || 0;
  playerData.trophy = appState.trophyRank || 1;
  playerData.isPlayer = true;

  // Sort descending by WPM initially (app.renderLeaderboard will re-sort based on active tab)
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

function showAd() {
  if (app && typeof app.showAd === 'function') {
    app.showAd();
  }
}

// --- App Flow / Scene Management ---
const app = {
  async init() {
    this.loadSave();
    
    /* 
    // CrazyGames SDK Initialization (Commented out)
    if (window.CrazyGames && window.CrazyGames.SDK) {
      try {
        await window.CrazyGames.SDK.init();
        console.log('CrazyGames SDK initialized successfully');
        if (window.CrazyGames.SDK.banner) {
          try {
            await window.CrazyGames.SDK.banner.requestBanner({
              id: 'cg-banner-container',
              width: 728,
              height: 90
            });
            console.log('CrazyGames banner requested');
          } catch(e) {
            console.warn('CrazyGames banner request failed:', e);
          }
        }
      } catch(e) {
        console.warn('CrazyGames SDK init failed:', e);
      }
    } else {
      console.log('CrazyGames SDK not available (running outside CrazyGames)');
    }
    */

    // Autoplay music on first interaction
    const initMusic = () => {
      const audio = document.getElementById('bg-music');
      const btn = document.getElementById('music-toggle-btn');
      if (audio && btn && btn.classList.contains('active')) {
        audio.play().catch(e => console.log('Autoplay blocked', e));
      }
      document.removeEventListener('click', initMusic);
      document.removeEventListener('keypress', initMusic);
    };
    document.addEventListener('click', initMusic);
    document.addEventListener('keypress', initMusic);

    // Setup input
    window.addEventListener('keypress', (e) => {
      this.handleKeyPress(e.key.toUpperCase());
    });

    // Show splash screen briefly, then quick loading bar
    setTimeout(() => {
      this.changeScene('loading-screen');
      let prog = 0;
      const bar = document.getElementById('progress-bar');
      const tick = setInterval(() => {
        prog = Math.min(prog + Math.random() * 30, 100); // Faster loading
        if (bar) bar.style.width = prog + '%';
        if (prog >= 100) {
          clearInterval(tick);
          setTimeout(() => this.changeScene('lobby-screen'), 150); // Faster transition
        }
      }, 40); // Faster tick
    }, 1000); // Reduced delay from 2000ms

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
        appState.wins = parsed.wins || 0;
        appState.losses = parsed.losses || 0;
        appState.xp = parsed.xp || 0;
        appState.trophyPoints = parsed.trophyPoints || 0;
        appState.trophyRank = parsed.trophyRank || 1;
        appState.avatar = parsed.avatar || 'avatar_stickman_assassin';
        appState.outfit = parsed.outfit || null;
        appState.effect = parsed.effect || null;
        appState.armband = parsed.armband || null;
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
      wins: appState.wins,
      losses: appState.losses,
      xp: appState.xp,
      trophyPoints: appState.trophyPoints,
      trophyRank: appState.trophyRank,
      avatar: appState.avatar,
      outfit: appState.outfit,
      effect: appState.effect,
      armband: appState.armband,
      playerName: appState.playerName
    }));
    this.updateGlobalUI();
    if (socket) {
      socket.emit('submitScore', {
        playerId: appState.playerId,
        name: appState.playerName,
        avatar: appState.avatar,
        level: appState.level,
        wpm: appState.wpmRecord,
        gold: appState.credits,
        wins: appState.wins,
        losses: appState.losses,
        trophy: appState.trophyRank
      });
    }
  },

  getTrophyName(rank) {
    const names = ['BEGINNER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER'];
    return names[Math.min(Math.max(rank - 1, 0), 6)];
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
    if (credEl) credEl.innerText = this.formatGold(appState.credits);

    const globCredEl = document.getElementById('global-credits');
    if (globCredEl) globCredEl.innerText = this.formatGold(appState.credits);
    
    const nameEl = document.getElementById('my-name');
    if (nameEl) nameEl.innerText = appState.playerName;
    
    const avEl = document.getElementById('my-avatar');
    if (avEl) avEl.src = this.getAvatarSrc(appState.avatar);
    
    // Update Profile Modal Stats
    const pWins = document.getElementById('profile-stat-wins');
    if (pWins) pWins.innerText = appState.wins;
    const pLoss = document.getElementById('profile-stat-losses');
    if (pLoss) pLoss.innerText = appState.losses;
    const pLvl = document.getElementById('profile-stat-level');
    if (pLvl) pLvl.innerText = appState.level;
    const pWpm = document.getElementById('profile-stat-wpm');
    if (pWpm) pWpm.innerText = appState.wpmRecord + ' WPM';
    
    // Update XP Bar Logic
    const levelBar = document.getElementById('profile-level-bar');
    const levelText = document.getElementById('profile-level-text');
    if (levelBar && levelText) {
      const requiredXP = appState.level + 1;
      const progressPercent = Math.min(100, (appState.xp / requiredXP) * 100);
      
      levelBar.style.width = `${progressPercent}%`;
      levelText.innerText = `${appState.xp} / ${requiredXP} XP`;
    }
    
    // Trophy
    const tRank = Math.min(Math.max(appState.trophyRank, 1), 7);
    const pTrophyImg = document.getElementById('profile-trophy-img');
    if (pTrophyImg) pTrophyImg.src = `assets/trophy_${tRank}.png`;
    const pTrophyName = document.getElementById('profile-trophy-name');
    if (pTrophyName) pTrophyName.innerText = this.getTrophyName(tRank);
    const pTrophyProgress = document.getElementById('profile-trophy-progress');
    if (pTrophyProgress) {
      if (tRank >= 7) {
        pTrophyProgress.innerText = "MAX RANK ACHIEVED";
        pTrophyProgress.style.color = "#ffcc00";
      } else {
        const requiredTrophy = tRank + 2;
        pTrophyProgress.innerText = `${appState.trophyPoints} / ${requiredTrophy} PTS TO NEXT RANK`;
        pTrophyProgress.style.color = "#aaa";
      }
    }

    if (window.lobbyGraphics) {
      window.lobbyGraphics.setConfig(appState.outfit, appState.effect, appState.armband);
    }
  },

  changeScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
    document.getElementById(sceneId).classList.add('active');
    appState.scene = sceneId;
    
    // Show/hide banner ad on lobby and waiting screens
    const bannerWrapper = document.getElementById('cg-banner-wrapper');
    if (bannerWrapper) {
      if (sceneId === 'lobby-screen' || sceneId === 'waiting-screen') {
        bannerWrapper.style.display = 'block';
      } else {
        bannerWrapper.style.display = 'none';
      }
    }
    // Manage lobby stickman rendering
    if (sceneId === 'lobby-screen') {
      if (!window.lobbyGraphics) {
        const c = document.getElementById('lobby-stickman-canvas');
        if (c) window.lobbyGraphics = new LobbyStickmanScene(c);
      }
      if (window.lobbyGraphics) {
        window.lobbyGraphics.setConfig(appState.outfit, appState.effect, appState.armband);
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

  openAvatarSelection() {
    document.getElementById('avatar-selection-panel').classList.add('active');
  },

  closeAvatarSelection() {
    document.getElementById('avatar-selection-panel').classList.remove('active');
  },

  closeLevelUp() {
    if (socket) socket.emit('leaveRoom');
    document.getElementById('level-up-screen').classList.remove('active');
    this.changeScene('lobby-screen');
  },

  viewPlayerProfile(e) {
    if (!e) return;
    
    document.getElementById('opp-profile-name').innerText = e.name || 'ENEMY';
    document.getElementById('opp-profile-level').innerText = e.level || 1;
    document.getElementById('opp-profile-wins').innerText = e.wins || 0;
    document.getElementById('opp-profile-losses').innerText = e.losses || 0;
    document.getElementById('opp-profile-wpm').innerText = (e.wpm || 0) + ' WPM';
    document.getElementById('opp-profile-avatar').src = this.getAvatarSrc(e.avatar || 'hero_pig');
    
    const tRank = Math.min(Math.max(e.trophy || 1, 1), 7);
    document.getElementById('opp-profile-trophy-img').src = `assets/trophy_${tRank}.png`;
    document.getElementById('opp-profile-trophy-name').innerText = this.getTrophyName(tRank);
    
    document.getElementById('opponent-profile-modal').classList.add('active');
  },

  viewOpponentProfile() {
    this.viewPlayerProfile(appState.match.enemyData);
  },

  closeOpponentProfile() {
    document.getElementById('opponent-profile-modal').classList.remove('active');
  },

  saveProfile() {
    const newName = document.getElementById('profile-name-input').value.trim();
    if (newName) {
      let proposedName = newName.substring(0, 15).toUpperCase();
      const lbData = getLeaderboardData();
      
      // Ensure name is unique
      let isTaken = lbData.some(p => p.name === proposedName && !p.isPlayer);
      if (isTaken) {
        const suffix = Math.floor(Math.random() * 900) + 100;
        proposedName = (proposedName.substring(0, 11) + '_' + suffix).toUpperCase();
        alert(`Name was taken! You are now known as: ${proposedName}`);
      }
      appState.playerName = proposedName;
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
    const available = ['avatar_stickman_assassin', 'avatar_stickman_warrior', 'avatar_stickman_elder', 'avatar_stickman_mage', 'avatar_stickman_rogue', 'avatar_stickman_youth'];
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
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 128; // Tiny size to prevent socket disconnects
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          appState.avatar = canvas.toDataURL('image/jpeg', 0.8);
          this.saveGame();
          this.renderProfileAvatars();
          this.updateProfilePreview();
        };
        img.src = e.target.result;
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

  currentLeaderboardSort: 'level',

  setLeaderboardSort(criteria, event) {
    this.currentLeaderboardSort = criteria;
    const tabs = document.querySelectorAll('.lb-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (event && event.target) {
      event.target.classList.add('active');
    }
    this.renderLeaderboard();
  },

  renderLeaderboard() {
    let list = getLeaderboardData();
    
    if (this.currentLeaderboardSort === 'level') {
      list.sort((a, b) => (b.level || 0) - (a.level || 0));
    } else if (this.currentLeaderboardSort === 'wpm') {
      list.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));
    } else if (this.currentLeaderboardSort === 'wins') {
      list.sort((a, b) => (b.wins || 0) - (a.wins || 0));
    }

    const searchInput = document.getElementById('leaderboard-search');
    if (searchInput && searchInput.value) {
      const q = searchInput.value.toUpperCase();
      list = list.filter(p => p.name.toUpperCase().includes(q));
    }

    const podiumEl = document.getElementById('lb-podium');
    const tableEl = document.getElementById('leaderboard-list');

    // Podium Top 3
    const p1 = list[0] || { name: '—', wpm: 0, avatar: 'hero_pig', level: 1 };
    const p2 = list[1] || { name: '—', wpm: 0, avatar: 'hero_cat', level: 1 };
    const p3 = list[2] || { name: '—', wpm: 0, avatar: 'hero_bear', level: 1 };

    if (podiumEl) {
      podiumEl.innerHTML = `
        <div class="podium-card rank-2" onclick="app.viewPlayerProfile({name: '${p2.name}', level: ${p2.level||1}, wins: ${p2.wins||0}, losses: ${p2.losses||0}, wpm: ${p2.wpm||0}, trophy: ${p2.trophy||1}, avatar: '${p2.avatar||'hero_pig'}'})" style="cursor: pointer;" title="View Profile">
          <div class="podium-badge">🥈 #2</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p2.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p2.name} ${p2.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${app.currentLeaderboardSort === 'level' ? 'Lvl. ' + (p2.level||1) : app.currentLeaderboardSort === 'wpm' ? (p2.wpm||0) + ' WPM' : (p2.wins||0) + ' WINS'}</div>
        </div>
        <div class="podium-card rank-1" onclick="app.viewPlayerProfile({name: '${p1.name}', level: ${p1.level||1}, wins: ${p1.wins||0}, losses: ${p1.losses||0}, wpm: ${p1.wpm||0}, trophy: ${p1.trophy||1}, avatar: '${p1.avatar||'hero_pig'}'})" style="cursor: pointer;" title="View Profile">
          <div class="podium-badge">👑 #1</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p1.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p1.name} ${p1.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${app.currentLeaderboardSort === 'level' ? 'Lvl. ' + (p1.level||1) : app.currentLeaderboardSort === 'wpm' ? (p1.wpm||0) + ' WPM' : (p1.wins||0) + ' WINS'}</div>
        </div>
        <div class="podium-card rank-3" onclick="app.viewPlayerProfile({name: '${p3.name}', level: ${p3.level||1}, wins: ${p3.wins||0}, losses: ${p3.losses||0}, wpm: ${p3.wpm||0}, trophy: ${p3.trophy||1}, avatar: '${p3.avatar||'hero_pig'}'})" style="cursor: pointer;" title="View Profile">
          <div class="podium-badge">🥉 #3</div>
          <img class="podium-avatar" src="${this.getAvatarSrc(p3.avatar)}" onerror="this.src='assets/avatar_default.png'">
          <div class="podium-name">${p3.name} ${p3.isPlayer ? '(YOU)' : ''}</div>
          <div class="podium-score">${app.currentLeaderboardSort === 'level' ? 'Lvl. ' + (p3.level||1) : app.currentLeaderboardSort === 'wpm' ? (p3.wpm||0) + ' WPM' : (p3.wins||0) + ' WINS'}</div>
        </div>
      `;
    }

    if (tableEl) {
      tableEl.innerHTML = list.map((item, idx) => {
        const rankNum = idx + 1;
        const rankClass = rankNum <= 3 ? `rank-${rankNum}` : '';
        const myClass = item.isPlayer ? 'my-rank' : '';
        return `
          <div class="lb-row ${rankClass} ${myClass}" onclick="app.viewPlayerProfile({name: '${item.name}', level: ${item.level||1}, wins: ${item.wins||0}, losses: ${item.losses||0}, wpm: ${item.wpm||0}, trophy: ${item.trophy||1}, avatar: '${item.avatar||'hero_pig'}'})" style="cursor: pointer;" title="View Profile">
            <div class="lb-rank-num">#${rankNum}</div>
            <div class="lb-col-player">
              <img class="lb-row-avatar" src="${this.getAvatarSrc(item.avatar)}" onerror="this.src='assets/avatar_default.png'">
              <span>${item.name} ${item.isPlayer ? '<span style="color:#3daeff; font-size:0.85rem; font-weight:900;">(YOU)</span>' : ''}</span>
            </div>
            <div class="lb-col-level">Lvl. ${item.level || 1}</div>
            <div class="lb-col-wpm">${item.wpm || 0} WPM</div>
            <div class="lb-col-gold"><img src="assets/coin.png" style="width:14px; height:14px; vertical-align:middle; margin-right:3px;"> ${app.formatGold(item.gold || 0)}</div>
          </div>
        `;
      }).join('');
    }

    const localPlayerRow = document.getElementById('lb-local-player-row');
    if (localPlayerRow) {
      const myIdx = list.findIndex(p => p.isPlayer);
      if (myIdx !== -1) {
        const item = list[myIdx];
        const rankNum = myIdx + 1;
        const rankClass = rankNum <= 3 ? `rank-${rankNum}` : '';
        localPlayerRow.innerHTML = `
          <div class="lb-row ${rankClass}" onclick="app.viewPlayerProfile({name: '${item.name}', level: ${item.level||1}, wins: ${item.wins||0}, losses: ${item.losses||0}, wpm: ${item.wpm||0}, trophy: ${item.trophy||1}, avatar: '${item.avatar||'hero_pig'}'})" style="cursor: pointer; border: none; background: transparent; padding: 10px 20px;">
            <div class="lb-rank-num">#${rankNum}</div>
            <div class="lb-col-player">
              <img class="lb-row-avatar" src="${this.getAvatarSrc(item.avatar)}" onerror="this.src='assets/avatar_default.png'">
              <span>${item.name} <span style="color:#3daeff; font-size:0.85rem; font-weight:900;">(YOU)</span></span>
            </div>
            <div class="lb-col-level">Lvl. ${item.level || 1}</div>
            <div class="lb-col-wpm">${item.wpm || 0} WPM</div>
            <div class="lb-col-gold">🟡 ${app.formatGold(item.gold || 0)}</div>
          </div>
        `;
      } else {
        localPlayerRow.innerHTML = '';
      }
    }
  },

  openSettings() {
    document.getElementById('settings-panel').classList.add('active');
  },

  closeSettings() {
    document.getElementById('settings-panel').classList.remove('active');
  },

  updateVolume() {
    const slider = document.getElementById('master-vol-slider');
    const audio = document.getElementById('bg-music');
    if (audio && slider) {
      audio.volume = slider.value / 100;
    }
  },

  toggleMusic(btn) {
    const isNowOff = btn.classList.contains('active');
    const audio = document.getElementById('bg-music');
    if (!audio) return;

    if (isNowOff) {
      btn.classList.remove('active');
      btn.innerText = 'OFF';
      audio.pause();
    } else {
      btn.classList.add('active');
      btn.innerText = 'ON';
      audio.play().catch(e => console.log(e));
    }
  },

  openFriendMenu() {
    document.getElementById('friend-panel').classList.add('active');
  },

  closeFriendMenu() {
    document.getElementById('friend-panel').classList.remove('active');
  },

  formatGold(num) {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
  },

  redeemCode() {
    const input = document.getElementById('redeem-code-input');
    const code = input.value.trim().toUpperCase();
    if (code === 'DEV_OVERRIDE_9982_GOLD') {
      appState.credits += 1000000000;
      this.saveGame();
      alert('CODE REDEEMED! +1 BILLION GOLD!');
      input.value = '';
    } else if (code === 'DEVMAX') {
      appState.level = 50;
      appState.xp = 0;
      appState.trophyRank = 7;
      appState.trophyPoints = 0;
      appState.credits += 1000000000;
      appState.wpmRecord = Math.max(appState.wpmRecord, 9999);
      appState.wins += 999;
      this.saveGame();
      this.updateGlobalUI();
      alert('DEVMAX REDEEMED! ALL STATS MAXED OUT!');
      input.value = '';
    } else {
      alert('INVALID CODE');
    }
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

    // Reset enemy UI state from previous matches
    document.getElementById('wait-enemy-side').classList.add('hidden');
    const ticker = document.getElementById('match-ticker');
    if (ticker) ticker.innerText = 'SEARCHING...';
    const enemyNameEl = document.getElementById('wait-enemy-name');
    if (enemyNameEl) enemyNameEl.innerText = '???';
    const enemyAvEl = document.getElementById('wait-enemy-avatar');
    if (enemyAvEl) enemyAvEl.src = 'assets/avatar_default.png';

    if (socket) {
      socket.emit('joinRandom', { 
        name: appState.playerName, 
        avatar: appState.avatar,
        outfit: appState.outfit,
        effect: appState.effect,
        armband: appState.armband,
        level: appState.level,
        wins: appState.wins,
        losses: appState.losses,
        wpm: appState.wpmRecord,
        trophy: appState.trophyRank
      });
    } else {
      alert("Multiplayer server is offline. Please try again later.");
      this.changeScene('lobby-screen');
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
        effect: appState.effect,
        armband: appState.armband,
        level: appState.level,
        wins: appState.wins,
        losses: appState.losses,
        wpm: appState.wpmRecord,
        trophy: appState.trophyRank
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
          effect: appState.effect,
          armband: appState.armband,
          level: appState.level,
          wins: appState.wins,
          losses: appState.losses,
          wpm: appState.wpmRecord,
          trophy: appState.trophyRank
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
      // p1 in SwordCombatEngine is ALWAYS the local player (left), and p2 is ALWAYS the enemy (right).
      // We must not swap them based on server playerNum, otherwise items get put on the wrong stickman!
      graphics.setConfig(
        appState.outfit, appState.effect, appState.armband,
        appState.match.enemyOutfit, appState.match.enemyEffect, appState.match.enemyArmband
      );
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

    const sfx = isWinner ? document.getElementById('sfx-win') : document.getElementById('sfx-lose');
    if (sfx) {
      sfx.currentTime = 0;
      sfx.play().catch(()=>{});
    }

    this.changeScene('game-over-screen');

    const titleEl = document.getElementById('result-title');
    titleEl.innerText = isWinner ? 'VICTORY' : 'DEFEAT';
    titleEl.style.color = isWinner ? '#2ecc71' : '#e74c3c';

    const finalHps = calculateWPM();
    const accuracy = totalAttempts === 0 ? '—'
      : Math.round((totalHits / totalAttempts) * 100) + '%';
    const creditsEarned = isWinner ? 50 : 10;

    document.getElementById('result-words').innerText   = totalHits;
    document.getElementById('result-wpm').innerText     = `${finalHps} WPM`;
    document.getElementById('result-accuracy').innerText = accuracy;
    document.getElementById('result-credits').innerText = `+${creditsEarned}`;

    if (isWinner) {
      appState.wins++;
      
      // Level progression (XP)
      if (appState.level < 50) {
        appState.xp += 1;
        const requiredXP = appState.level + 1;
        if (appState.xp >= requiredXP) {
          appState.xp = 0;
          appState.level++;
          setTimeout(() => {
            document.getElementById('level-up-screen').classList.add('active');
            document.getElementById('level-up-number').innerText = appState.level;
          }, 1000);
        }
      }
      
      // Trophy progression
      if (appState.trophyRank < 7) {
        appState.trophyPoints += 1;
        const requiredTrophy = appState.trophyRank + 2;
        if (appState.trophyPoints >= requiredTrophy) {
          appState.trophyPoints = 0;
          appState.trophyRank++;
        }
      } else {
        appState.trophyPoints = 0; // Max rank reached
      }
      
    } else {
      appState.losses++;
      
      // Trophy loss penalty (-0.5 points)
      appState.trophyPoints -= 0.5;
      
      // Handle deranking
      if (appState.trophyPoints < 0) {
        if (appState.trophyRank > 1) {
          appState.trophyRank--;
          appState.trophyPoints = (appState.trophyRank + 2) - 0.5; // Place near top of previous rank
        } else {
          appState.trophyPoints = 0; // Cannot derank below 1
        }
      }
    }

    appState.credits += creditsEarned;
    if (finalHps > appState.wpmRecord) appState.wpmRecord = finalHps;
    this.saveGame();
  },
  
  returnToLobby() {
    if (socket) socket.emit('leaveRoom');
    this.changeScene('lobby-screen');
  },
  
  showAd(callback) {
    const cb = callback || function() {};
    // Try CrazyGames SDK midgame ad first (Commented out for Itch.io)
    /*
    if (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
      try {
        window.CrazyGames.SDK.ad.requestAd('midgame', {
          adStarted: () => console.log('CrazyGames ad started'),
          adFinished: () => { console.log('CrazyGames ad finished'); cb(); },
          adError: (err) => { console.warn('CrazyGames ad error:', err); cb(); }
        });
        return;
      } catch(e) {
        console.warn('CrazyGames ad request failed:', e);
      }
    }
    */

    // Fallback: show mock ad modal (now displays Adsterra container)
    const modal = document.getElementById('ad-modal');
    if (modal) {
      modal.style.display = 'flex';
      const closeBtn = document.getElementById('ad-close-btn');
      const timerEl = document.getElementById('ad-timer');
      if (closeBtn) { closeBtn.disabled = true; closeBtn.style.opacity = '0.5'; closeBtn.style.cursor = 'not-allowed'; }
      let countdown = 5;
      if (timerEl) timerEl.innerText = `WAIT ${countdown} SECONDS...`;
      this._adCallback = cb;
      const adInterval = setInterval(() => {
        countdown--;
        if (timerEl) timerEl.innerText = countdown > 0 ? `WAIT ${countdown} SECONDS...` : 'AD COMPLETE!';
        if (countdown <= 0) {
          clearInterval(adInterval);
          if (closeBtn) { closeBtn.disabled = false; closeBtn.style.opacity = '1'; closeBtn.style.cursor = 'pointer'; }
        }
      }, 1000);
    } else {
      cb();
    }
  },

  finishAd() {
    const modal = document.getElementById('ad-modal');
    if (modal) modal.style.display = 'none';
    if (this._adCallback) { this._adCallback(); this._adCallback = null; }
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
    appState.match.enemyArmband = data.enemyArmband || null;
    appState.match.enemyData = data.enemyData || {};
    
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

  socket.on('connect', () => {
    console.log("Connected to server! Submitting score...");
    app.saveGame();
  });

  socket.on('leaderboardData', (data) => {
    let list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (data && data.leaderboard) {
      list = data.leaderboard;
      app.seasonEndTime = data.seasonEndTime;
    }
    localStorage.setItem('typing_battle_leaderboard', JSON.stringify(list));
    if (appState.scene === 'leaderboard-screen' || document.getElementById('leaderboard-screen').classList.contains('active')) {
      app.renderLeaderboard();
    }
  });

  socket.on('seasonReset', (newEndTime) => {
    app.seasonEndTime = newEndTime;
    appState.wins = 0;
    appState.losses = 0;
    appState.trophyRank = 1;
    app.saveGame();
    app.updateGlobalUI();
    
    const m = document.getElementById('opponent-profile-modal');
    if (m) {
      document.getElementById('opp-profile-name').innerText = 'SEASON RESET';
      document.getElementById('opp-profile-level').innerText = '0';
      document.getElementById('opp-profile-wins').innerText = '0';
      document.getElementById('opp-profile-losses').innerText = '0';
      document.getElementById('opp-profile-wpm').innerText = 'A new weekly season has started!';
      m.classList.add('active');
    } else {
      alert('A new weekly season has started! Your Wins, Losses, and Trophy Rank have been reset to 0.');
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

  socket.on('nameUpdated', (msg) => {
    // Extract the new name from the message "Your name was taken! You were renamed to NEW_NAME"
    const newName = msg.split('renamed to ')[1];
    if (newName) {
      appState.playerName = newName;
      app.saveGame();
      app.updateGlobalUI();
      // Only alert if we are actively in the profile menu
      if (document.getElementById('profile-panel').classList.contains('active')) {
        alert(msg);
      }
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
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the high-performance combat renderer
  graphics = new DualCombatScene(canvas);
  app.init();
  
  setInterval(() => {
    const cd = document.getElementById('lb-countdown');
    if (cd && app.seasonEndTime) {
      const diff = app.seasonEndTime - Date.now();
      if (diff <= 0) {
        cd.innerText = "TIME UNTIL RESET: --";
      } else {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        cd.innerText = `TIME UNTIL RESET: ${d}D ${h}H ${m}M ${s}S`;
      }
    }
  }, 1000);
});
