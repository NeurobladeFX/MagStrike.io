const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./gameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
let matchmakingQueue = null;

const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbyhqi84HC0lCpGgqNszY21EVL2rug1i3sTEE251BVEmqhu6LJ4R-jrIWcX8sqU8s1Ss/exec';

async function syncToGoogleSheets() {
  if (!GOOGLE_SHEET_URL) return;
  try {
    await fetch(GOOGLE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', leaderboard: globalLeaderboard })
    });
    console.log("Leaderboard synced to Google Sheets");
  } catch(e) {
    console.error("Google Sheets Sync Failed:", e.message);
  }
}

// Global Live Server Leaderboard
let globalLeaderboard = [
  { id: 'bot_1', name: "SHADOWMAGE", avatar: "avatar_stickman_assassin", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_2', name: "GANDALF_BLACK", avatar: "avatar_stickman_elder", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_3', name: "SPELL_KNIGHT", avatar: "avatar_stickman_warrior", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_4', name: "VOID_CASTER", avatar: "avatar_stickman_mage", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_5', name: "RUNEMASTER", avatar: "avatar_stickman_rogue", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_6', name: "NEO_WIZARD", avatar: "avatar_stickman_youth", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_7', name: "NOOB_SPELLER", avatar: "avatar_stickman_assassin", level: 0, wpm: 0, gold: 0, wins: 0 },
  { id: 'bot_8', name: "GUEST_007", avatar: "avatar_stickman_warrior", level: 0, wpm: 0, gold: 0, wins: 0 }
];

let seasonEndTime = Date.now() + 7 * 24 * 60 * 60 * 1000;

setInterval(() => {
  if (Date.now() > seasonEndTime) {
    globalLeaderboard.forEach(p => {
      p.wins = 0;
      p.losses = 0;
      p.trophy = 1;
      p.gold = 0;
    });
    seasonEndTime = Date.now() + 7 * 24 * 60 * 60 * 1000;
    io.emit('seasonReset', seasonEndTime);
    io.emit('leaderboardData', { leaderboard: globalLeaderboard, seasonEndTime });
    syncToGoogleSheets();
  }
}, 60000);

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send current global leaderboard to connected player
  socket.emit('leaderboardData', { leaderboard: globalLeaderboard, seasonEndTime });

  socket.on('getLeaderboard', () => {
    socket.emit('leaderboardData', { leaderboard: globalLeaderboard, seasonEndTime });
  });

  socket.on('submitScore', (data) => {
    if (!data || !data.name || !data.playerId) return;
    
    // Server-side uniqueness check
    let uniqueName = data.name.toUpperCase();
    let collision = globalLeaderboard.find(p => p.name === uniqueName && p.playerId !== data.playerId);
    if (collision) {
      const suffix = Math.floor(Math.random() * 900) + 100; // 100-999
      uniqueName = (uniqueName.substring(0, 11) + '_' + suffix).toUpperCase();
      socket.emit('nameUpdated', `Your name was taken! You were renamed to ${uniqueName}`);
    }
    
    const existingIndex = globalLeaderboard.findIndex(p => p.playerId === data.playerId);
    const prevWpm = existingIndex >= 0 ? (globalLeaderboard[existingIndex].wpm || 0) : 0;
    const entry = {
      playerId: data.playerId,
      id: socket.id,
      name: uniqueName,
      avatar: data.avatar || 'hero_pig',
      level: data.level || 1,
      wpm: Math.max(data.wpm || 0, prevWpm),
      gold: data.gold || 0,
      wins: data.wins || 0,
      losses: data.losses || 0,
      trophy: data.trophy || 1
    };

    if (existingIndex >= 0) {
      globalLeaderboard[existingIndex] = entry;
    } else {
      globalLeaderboard.push(entry);
    }

    // Sort descending by WPM
    globalLeaderboard.sort((a, b) => b.wpm - a.wpm);
    
    // Broadcast updated live leaderboard to all players!
    io.emit('leaderboardData', { leaderboard: globalLeaderboard, seasonEndTime });
    
    // Sync to Google Sheets
    syncToGoogleSheets();
  });

  // Random Matchmaking
  socket.on('joinRandom', (data) => {
    socket.hero = data && data.avatar ? data.avatar : 'hero_pig';
    socket.playerName = data && data.name ? data.name : 'SPELLCASTER';
    socket.outfit = data && data.outfit ? data.outfit : null;
    socket.effect = data && data.effect ? data.effect : null;
    socket.armband = data && data.armband ? data.armband : null;
    socket.level = data && data.level ? data.level : 1;
    socket.wins = data && data.wins ? data.wins : 0;
    socket.losses = data && data.losses ? data.losses : 0;
    socket.wpm = data && data.wpm ? data.wpm : 0;
    socket.trophy = data && data.trophy ? data.trophy : 1;
    
    if (matchmakingQueue && matchmakingQueue.id !== socket.id) {
      const p1 = matchmakingQueue;
      const p2 = socket;
      matchmakingQueue = null;
      
      const roomId = 'room_' + p1.id + '_' + p2.id;
      p1.join(roomId);
      p2.join(roomId);
      p1.roomId = roomId;
      p2.roomId = roomId;

      const gameRoom = new GameRoom(roomId, io, p1.id, p2.id);
      rooms.set(roomId, gameRoom);

      p1.emit('matchStarted', { roomId, playerNum: 1, enemyHero: p2.hero, enemyName: p2.playerName, enemyOutfit: p2.outfit, enemyEffect: p2.effect, enemyArmband: p2.armband, enemyData: { name: p2.playerName, level: p2.level, wins: p2.wins, losses: p2.losses, wpm: p2.wpm, trophy: p2.trophy, avatar: p2.hero } });
      p2.emit('matchStarted', { roomId, playerNum: 2, enemyHero: p1.hero, enemyName: p1.playerName, enemyOutfit: p1.outfit, enemyEffect: p1.effect, enemyArmband: p1.armband, enemyData: { name: p1.playerName, level: p1.level, wins: p1.wins, losses: p1.losses, wpm: p1.wpm, trophy: p1.trophy, avatar: p1.hero } });
      
      gameRoom.start();
    } else {
      matchmakingQueue = socket;
    }
  });

  socket.on('leaveQueue', () => {
    if (matchmakingQueue === socket) {
      matchmakingQueue = null;
    }
  });

  // Friend Rooms
  socket.on('createRoom', (data) => {
    socket.hero = data && data.avatar ? data.avatar : 'hero_pig';
    socket.playerName = data && data.name ? data.name : 'SPELLCASTER';
    socket.outfit = data && data.outfit ? data.outfit : null;
    socket.effect = data && data.effect ? data.effect : null;
    socket.armband = data && data.armband ? data.armband : null;
    socket.level = data && data.level ? data.level : 1;
    socket.wins = data && data.wins ? data.wins : 0;
    socket.losses = data && data.losses ? data.losses : 0;
    socket.wpm = data && data.wpm ? data.wpm : 0;
    socket.trophy = data && data.trophy ? data.trophy : 1;
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = true;
    socket.emit('roomCreated', roomId);
  });

  socket.on('joinRoom', (data) => {
    let code = '';
    let hero = 'hero_pig';
    let name = 'SPELLCASTER';
    let outfit = null;
    let effect = null;
    
    if (typeof data === 'string') {
      code = data.toUpperCase();
    } else if (data && data.code) {
      code = data.code.toUpperCase();
      let pData = data.playerData || data;
      hero = pData.avatar || pData.hero || 'hero_pig';
      name = pData.name || 'SPELLCASTER';
      outfit = pData.outfit || null;
      effect = pData.effect || null;
    } else {
      return;
    }
    
    socket.hero = hero;
    socket.playerName = name;
    socket.outfit = outfit;
    socket.effect = effect;
    socket.armband = data && data.playerData && data.playerData.armband ? data.playerData.armband : null;
    socket.level = data && data.playerData && data.playerData.level ? data.playerData.level : 1;
    socket.wins = data && data.playerData && data.playerData.wins ? data.playerData.wins : 0;
    socket.losses = data && data.playerData && data.playerData.losses ? data.playerData.losses : 0;
    socket.wpm = data && data.playerData && data.playerData.wpm ? data.playerData.wpm : 0;
    socket.trophy = data && data.playerData && data.playerData.trophy ? data.playerData.trophy : 1;
    
    const room = io.sockets.adapter.rooms.get(code);
    if (room && room.size === 1) {
      const p1Id = [...room][0];
      const p1 = io.sockets.sockets.get(p1Id);
      const p2 = socket;
      
      p2.join(code);
      p2.roomId = code;
      
      const gameRoom = new GameRoom(code, io, p1.id, p2.id);
      rooms.set(code, gameRoom);
      
      p1.emit('matchStarted', { roomId: code, playerNum: 1, enemyHero: p2.hero, enemyName: p2.playerName, enemyOutfit: p2.outfit, enemyEffect: p2.effect, enemyArmband: p2.armband, enemyData: { name: p2.playerName, level: p2.level, wins: p2.wins, losses: p2.losses, wpm: p2.wpm, trophy: p2.trophy, avatar: p2.hero } });
      p2.emit('matchStarted', { roomId: code, playerNum: 2, enemyHero: p1.hero, enemyName: p1.playerName, enemyOutfit: p1.outfit, enemyEffect: p1.effect, enemyArmband: p1.armband, enemyData: { name: p1.playerName, level: p1.level, wins: p1.wins, losses: p1.losses, wpm: p1.wpm, trophy: p1.trophy, avatar: p1.hero } });
      
      gameRoom.start();
    } else {
      socket.emit('roomError', 'Invalid or Full Forest');
    }
  });

  // Real-time combat
  socket.on('attack', (data) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).handleAttack(socket.id, data);
    }
  });

  socket.on('spellClash', (data) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).handleClash(data);
    }
  socket.on('leaveRoom', () => {
    if (socket.roomId) {
      socket.leave(socket.roomId);
      if (rooms.has(socket.roomId)) {
        rooms.delete(socket.roomId);
      }
      socket.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    if (matchmakingQueue === socket) {
      matchmakingQueue = null;
    }
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.delete(socket.roomId);
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Shadow Grid Server running on http://localhost:${PORT}`);
});
