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

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Random Matchmaking
  socket.on('joinRandom', (data) => {
    socket.hero = data && data.avatar ? data.avatar : 'hero_pig';
    socket.playerName = data && data.name ? data.name : 'SPELLCASTER';
    
    if (matchmakingQueue && matchmakingQueue !== socket) {
      const roomId = `room_${matchmakingQueue.id}_${socket.id}`;
      const p1 = matchmakingQueue;
      const p2 = socket;
      
      const gameRoom = new GameRoom(roomId, io, p1.id, p2.id, p1.hero, p2.hero);
      rooms.set(roomId, gameRoom);
      
      p1.join(roomId);
      p2.join(roomId);
      
      p1.roomId = roomId;
      p2.roomId = roomId;
      
      p1.emit('matchStarted', { roomId, playerNum: 1, enemyHero: p2.hero, enemyName: p2.playerName });
      p2.emit('matchStarted', { roomId, playerNum: 2, enemyHero: p1.hero, enemyName: p1.playerName });
      
      gameRoom.start();
      matchmakingQueue = null;
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
    
    if (typeof data === 'string') {
      code = data.toUpperCase();
    } else if (data && data.code) {
      code = data.code.toUpperCase();
      hero = data.avatar || data.hero || 'hero_pig';
      name = data.name || 'SPELLCASTER';
    } else {
      return;
    }
    
    socket.hero = hero;
    socket.playerName = name;
    
    const room = io.sockets.adapter.rooms.get(code);
    if (room && room.size === 1) {
      const p1Id = [...room][0];
      const p1 = io.sockets.sockets.get(p1Id);
      const p2 = socket;
      
      p2.join(code);
      p2.roomId = code;
      
      const gameRoom = new GameRoom(code, io, p1.id, p2.id, p1.hero, p2.hero);
      rooms.set(code, gameRoom);
      
      p1.emit('matchStarted', { roomId: code, playerNum: 1, enemyHero: p2.hero, enemyName: p2.playerName });
      p2.emit('matchStarted', { roomId: code, playerNum: 2, enemyHero: p1.hero, enemyName: p1.playerName });
      
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

  socket.on('disconnect', () => {
    if (matchmakingQueue === socket) {
      matchmakingQueue = null;
    }
    if (socket.roomId && rooms.has(socket.roomId)) {
      const gameRoom = rooms.get(socket.roomId);
      rooms.delete(socket.roomId);
      io.to(socket.roomId).emit('roomError', 'OPPONENT DISCONNECTED');
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Shadow Grid Server running on http://localhost:${PORT}`);
});
