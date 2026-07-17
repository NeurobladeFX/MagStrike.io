const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./gameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms
const rooms = new Map();
// Queue for random matchmaking
let matchmakingQueue = null;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Random Matchmaking
  socket.on('joinRandom', () => {
    if (matchmakingQueue && matchmakingQueue !== socket) {
      // Match found
      const roomId = `room_${matchmakingQueue.id}_${socket.id}`;
      const p1 = matchmakingQueue;
      const p2 = socket;
      
      const gameRoom = new GameRoom(roomId, io, p1.id, p2.id);
      rooms.set(roomId, gameRoom);
      
      p1.join(roomId);
      p2.join(roomId);
      
      p1.roomId = roomId;
      p2.roomId = roomId;
      
      p1.emit('matchFound', { roomId, playerNum: 1 });
      p2.emit('matchFound', { roomId, playerNum: 2 });
      
      gameRoom.start();
      matchmakingQueue = null;
    } else {
      // Join queue
      matchmakingQueue = socket;
      socket.emit('waitingForMatch');
    }
  });

  // Friend Rooms
  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = true;
    socket.emit('roomCreated', roomId);
  });

  socket.on('joinRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    const roomClients = io.sockets.adapter.rooms.get(roomId);
    
    if (roomClients && roomClients.size === 1) {
      socket.join(roomId);
      socket.roomId = roomId;
      
      const p1Id = [...roomClients][0];
      const p2Id = socket.id;
      
      const gameRoom = new GameRoom(roomId, io, p1Id, p2Id);
      rooms.set(roomId, gameRoom);
      
      io.to(p1Id).emit('matchFound', { roomId, playerNum: 1 });
      io.to(p2Id).emit('matchFound', { roomId, playerNum: 2 });
      
      gameRoom.start();
    } else {
      socket.emit('roomError', 'Room not found or full.');
    }
  });

  // Receive input from client
  socket.on('input', (keys) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).handleInput(socket.id, keys);
    }
  });
  
  // Equip trail
  socket.on('equipTrail', (trailId) => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.get(socket.roomId).setPlayerTrail(socket.id, trailId);
    }
  });

  socket.on('disconnect', () => {
    if (matchmakingQueue === socket) {
      matchmakingQueue = null;
    }
    if (socket.roomId && rooms.has(socket.roomId)) {
      const gameRoom = rooms.get(socket.roomId);
      gameRoom.stop();
      rooms.delete(socket.roomId);
      io.to(socket.roomId).emit('opponentDisconnected');
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
