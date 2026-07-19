const RENDER_SERVER_URL = window.location.origin; // Set this if hosting frontend separate from backend
const socket = io(RENDER_SERVER_URL);

// --- State ---
const appState = {
  scene: 'LOADING',
  credits: 0,
  level: 1,
  avatar: 'hero_pig',
  wpmRecord: 0,
  match: {
    inMatch: false,
    timer: 0,
    startTime: 0,
    myHealth: 100,
    enemyHealth: 100,
    myDmg: 0,
    enemyDmg: 0,
    myWpm: 0,
    enemyWpm: 0,
    isPlayer1: true
  }
};

const WORDS = [
  "attack", "defend", "strike", "block", "parry", "dodge", "slash", "thrust", 
  "critical", "damage", "health", "mana", "power", "speed", "agility", "strength",
  "warrior", "ninja", "samurai", "assassin", "magic", "fireball", "lightning",
  "shadow", "blade", "sword", "shield", "armor", "helmet", "boots", "gloves",
  "combat", "battle", "fight", "victory", "defeat", "champion", "legend", "epic",
  "combo", "ultimate", "special", "heavy", "light", "quick", "fast", "swift"
];

// --- Typing Engine ---
let currentWord = "";
let typedPortion = "";
let untypedPortion = "";
let combo = 1;
let totalTypedEntries = 0;
let errorsInWord = 0;
let matchStartTime = 0;
let isTypingActive = false;

function getNewWord() {
  currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
  typedPortion = "";
  untypedPortion = currentWord;
  errorsInWord = 0;
  updateTypingUI();
}

function updateTypingUI() {
  document.getElementById('typed-text').innerText = typedPortion;
  document.getElementById('untyped-text').innerText = untypedPortion;
  document.getElementById('combo-count').innerText = combo;
}

function handleTyping(e) {
  if (!isTypingActive) return;
  
  // Ignore modifier keys
  if (e.key.length > 1) return;

  const expectedChar = untypedPortion[0];
  const typedChar = e.key.toLowerCase();

  totalTypedEntries++;

  if (typedChar === expectedChar) {
    typedPortion += expectedChar;
    untypedPortion = untypedPortion.substring(1);
    
    // Word complete
    if (untypedPortion.length === 0) {
      const damage = Math.floor(currentWord.length * (1 + (combo * 0.1)));
      triggerAttack(damage);
      combo = Math.min(combo + 1, 10);
      getNewWord();
    }
    updateTypingUI();
  } else {
    // Mistake
    combo = 1;
    errorsInWord++;
    // Flash red
    document.getElementById('word-display').style.transform = 'translateX(-10px)';
    setTimeout(() => document.getElementById('word-display').style.transform = 'translateX(10px)', 50);
    setTimeout(() => document.getElementById('word-display').style.transform = 'translateX(0)', 100);
    updateTypingUI();
  }
}

window.addEventListener('keydown', handleTyping);
document.getElementById('hidden-typing-input').addEventListener('input', (e) => {
  // Mobile fallback (simplistic)
  if (!isTypingActive) return;
  const val = e.target.value.toLowerCase();
  e.target.value = ''; // clear
  if (val.length > 0) {
    handleTyping({ key: val[val.length-1] });
  }
});

function calculateWPM() {
  if (!isTypingActive || matchStartTime === 0) return 0;
  const minutes = (Date.now() - matchStartTime) / 60000;
  if (minutes < 0.05) return 0; // wait a bit
  // Standard WPM: (characters / 5) / minutes
  const wpm = Math.floor((totalTypedEntries / 5) / minutes);
  return Math.max(0, wpm);
}

function triggerAttack(damage) {
  // Local visual trigger
  graphics.triggerLocalAttack();
  
  // Send to server
  const currentWpm = calculateWPM();
  socket.emit('attack', { damage, wpm: currentWpm });
  
  // Update HUD WPM
  document.getElementById('game-my-wpm').innerText = currentWpm;
}

// --- App Flow / Scene Management ---
const app = {
  init() {
    this.loadSave();
    
    // Simulate loading
    setTimeout(() => {
      this.changeScene('lobby-screen');
    }, 1000);
    
    // Tick loop for match
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
      } catch (e) { console.error('Save corrupt'); }
    }
    this.updateGlobalUI();
  },

  saveGame() {
    localStorage.setItem('typing_battle_save', JSON.stringify({
      credits: appState.credits,
      level: appState.level,
      wpmRecord: appState.wpmRecord,
      avatar: appState.avatar
    }));
    this.updateGlobalUI();
  },

  updateGlobalUI() {
    document.getElementById('my-level').innerText = appState.level;
    document.getElementById('my-wpm').innerText = appState.wpmRecord;
    document.getElementById('shop-credits').innerText = appState.credits;
  },

  changeScene(sceneId) {
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
    document.getElementById(sceneId).classList.add('active');
    appState.scene = sceneId;
  },

  openProfile() {
    // simple alert for now
    alert(`WPM Record: ${appState.wpmRecord}\nCredits: ${appState.credits}`);
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
    document.querySelector('.center-divider .ticker-text').innerText = "SEARCHING FOR OPPONENT...";
    socket.emit('joinRandom', { avatar: appState.avatar });
  },

  cancelMatch() {
    socket.emit('leaveQueue');
    this.changeScene('lobby-screen');
  },
  
  startCountdown(enemyData) {
    document.querySelector('.center-divider .ticker-text').innerText = "OPPONENT FOUND!";
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
    appState.match.myHealth = 100;
    appState.match.enemyHealth = 100;
    appState.match.myDmg = 0;
    appState.match.enemyDmg = 0;
    
    document.getElementById('my-health').style.width = '100%';
    document.getElementById('enemy-health').style.width = '100%';
    
    matchStartTime = Date.now();
    totalTypedEntries = 0;
    combo = 1;
    isTypingActive = true;
    
    getNewWord();
    document.getElementById('hidden-typing-input').focus();
    
    // Start graphics loop
    graphics.start();
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
    graphics.stop();
    
    const isWinner = (winnerNum === 1 && appState.match.isPlayer1) || (winnerNum === 2 && !appState.match.isPlayer1);
    
    this.changeScene('game-over-screen');
    
    document.getElementById('result-title').innerText = isWinner ? "VICTORY" : "DEFEAT";
    document.getElementById('result-title').style.color = isWinner ? "#2ecc71" : "#e74c3c";
    
    const finalWpm = calculateWPM();
    const wordsCount = Math.floor(totalTypedEntries / 5);
    const acc = totalTypedEntries === 0 ? 100 : Math.round(((totalTypedEntries - errorsInWord) / totalTypedEntries) * 100);
    const creditsEarned = isWinner ? 50 : 10;
    
    document.getElementById('result-words').innerText = wordsCount;
    document.getElementById('result-wpm').innerText = finalWpm;
    document.getElementById('result-accuracy').innerText = `${acc}%`;
    document.getElementById('result-credits').innerText = creditsEarned;
    
    appState.credits += creditsEarned;
    if (finalWpm > appState.wpmRecord) appState.wpmRecord = finalWpm;
    this.saveGame();
  },
  
  returnToLobby() {
    this.changeScene('lobby-screen');
  }
};

// --- Networking (Socket) ---
socket.on('matchStarted', (data) => {
  // data: { roomId, playerNum, enemyAvatar }
  appState.match.isPlayer1 = (data.playerNum === 1);
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
  
  document.getElementById('my-health').style.width = `${Math.max(0, myState.health)}%`;
  document.getElementById('enemy-health').style.width = `${Math.max(0, enemyState.health)}%`;
  
  // Check enemy attacks for animation
  if (enemyState.isAttacking) {
    graphics.triggerEnemyAttack();
  }
  
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

// --- Canvas Graphics Engine ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const graphics = {
  running: false,
  lastTime: 0,
  
  p1: { x: 300, y: 350, state: 'IDLE', animTimer: 0 },
  p2: { x: 980, y: 350, state: 'IDLE', animTimer: 0 },
  
  start() {
    this.running = true;
    this.lastTime = Date.now();
    this.p1.state = 'IDLE';
    this.p2.state = 'IDLE';
    requestAnimationFrame(this.loop.bind(this));
  },
  
  stop() {
    this.running = false;
  },
  
  triggerLocalAttack() {
    const me = appState.match.isPlayer1 ? this.p1 : this.p2;
    me.state = 'ATTACK';
    me.animTimer = 0.3; // seconds
  },
  
  triggerEnemyAttack() {
    const enemy = appState.match.isPlayer1 ? this.p2 : this.p1;
    enemy.state = 'ATTACK';
    enemy.animTimer = 0.3; // seconds
  },
  
  loop() {
    if (!this.running) return;
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update logic
    this.updateStickman(this.p1, dt);
    this.updateStickman(this.p2, dt);
    
    // Draw
    this.drawStickman(this.p1, 1);
    this.drawStickman(this.p2, -1); // flip p2
    
    requestAnimationFrame(this.loop.bind(this));
  },
  
  updateStickman(p, dt) {
    if (p.state === 'ATTACK') {
      p.animTimer -= dt;
      if (p.animTimer <= 0) {
        p.state = 'IDLE';
      }
    }
  },
  
  drawStickman(p, direction) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(direction, 1); // Flip if p2
    
    ctx.strokeStyle = direction === 1 ? '#3498db' : '#e74c3c';
    if (p.state === 'ATTACK') ctx.strokeStyle = '#f1c40f'; // glow on attack
    
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Stickman Body
    ctx.beginPath();
    
    if (p.state === 'IDLE') {
      // Bobbing
      const bob = Math.sin(Date.now() / 200) * 5;
      
      // Head
      ctx.arc(0, -100 + bob, 20, 0, Math.PI * 2);
      // Torso
      ctx.moveTo(0, -80 + bob);
      ctx.lineTo(0, 0 + bob);
      // Arms
      ctx.moveTo(0, -60 + bob);
      ctx.lineTo(40, -40 + bob);
      ctx.moveTo(0, -60 + bob);
      ctx.lineTo(-30, -30 + bob);
      // Legs
      ctx.moveTo(0, 0 + bob);
      ctx.lineTo(20, 50);
      ctx.moveTo(0, 0 + bob);
      ctx.lineTo(-20, 50);
      
      ctx.stroke();
      
      // Idle Weapon (Sword)
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.moveTo(40, -40 + bob);
      ctx.lineTo(60, -90 + bob);
      ctx.stroke();
      
    } else if (p.state === 'ATTACK') {
      // Lunge forward
      ctx.translate(100, 0); // shift forward
      
      // Head
      ctx.arc(20, -90, 20, 0, Math.PI * 2);
      // Torso
      ctx.moveTo(10, -70);
      ctx.lineTo(-10, 10);
      // Arms (Striking)
      ctx.moveTo(0, -50);
      ctx.lineTo(60, -50); // Arm straight out
      ctx.moveTo(0, -50);
      ctx.lineTo(-40, -20);
      // Legs
      ctx.moveTo(-10, 10);
      ctx.lineTo(-40, 50);
      ctx.moveTo(-10, 10);
      ctx.lineTo(30, 50);
      
      ctx.stroke();
      
      // Attack Weapon (Sword)
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.moveTo(60, -50);
      ctx.lineTo(150, -50); // Big stab
      
      // Slash effect
      ctx.moveTo(100, -80);
      ctx.quadraticCurveTo(180, -50, 100, -20);
      
      ctx.stroke();
    }
    
    ctx.restore();
  }
};

// --- Boot ---
window.onload = () => {
  app.init();
};
