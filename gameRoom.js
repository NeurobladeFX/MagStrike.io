class GameRoom {
  constructor(roomId, io, p1Id, p2Id) {
    this.roomId = roomId;
    this.io = io;
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    
    // Typing Battle State
    this.p1 = { health: 100, wpm: 0, dmg: 0 };
    this.p2 = { health: 100, wpm: 0, dmg: 0 };
    
    this.gameState = 'PLAYING';
    this.lastTime = Date.now();
  }

  start() {
    this.loop = setInterval(() => this.update(), 1000 / 30); // 30 tick rate
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
  }
  
  handleAttack(playerId, data) {
    if (this.gameState !== 'PLAYING') return;
    
    const damage = data.damage || 10;
    const wpm = data.wpm || 0;
    const letter = data.letter || (data.move ? data.move.replace('Spell_', '') : 'SPELL');
    
    if (playerId === this.p1Id) {
      this.p2.health = Math.max(0, this.p2.health - damage);
      this.p1.wpm = wpm;
      this.p1.dmg += damage;
      
      // Emit projectile attack event to p2
      const p2Socket = this.io.sockets.sockets.get(this.p2Id);
      if (p2Socket) {
        p2Socket.emit('opponentAttack', { letter, damage, wpm });
      }
    } else if (playerId === this.p2Id) {
      this.p1.health = Math.max(0, this.p1.health - damage);
      this.p2.wpm = wpm;
      this.p2.dmg += damage;
      
      // Emit projectile attack event to p1
      const p1Socket = this.io.sockets.sockets.get(this.p1Id);
      if (p1Socket) {
        p1Socket.emit('opponentAttack', { letter, damage, wpm });
      }
    }
  }

  update() {
    if (this.gameState !== 'PLAYING') return;
    
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    
    // Check Win Condition
    let winner = 0;
    if (this.p1.health <= 0 && this.p2.health <= 0) {
      winner = this.p1.dmg >= this.p2.dmg ? 1 : 2;
    } else if (this.p1.health <= 0) {
      winner = 2;
    } else if (this.p2.health <= 0) {
      winner = 1;
    }
    
    if (winner !== 0) {
      this.gameState = 'GAME_OVER';
      this.io.to(this.roomId).emit('gameOver', { winner });
      this.stop();
    }
    
    // Broadcast State
    this.io.to(this.roomId).emit('gameState', {
      p1: this.p1,
      p2: this.p2
    });
  }
}

module.exports = GameRoom;
