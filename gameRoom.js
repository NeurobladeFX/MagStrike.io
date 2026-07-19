class GameRoom {
  constructor(roomId, io, p1Id, p2Id) {
    this.roomId = roomId;
    this.io = io;
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    
    // Typing Battle State
    this.p1 = { health: 100, wpm: 0, dmg: 0, isAttacking: false, attackTimer: 0 };
    this.p2 = { health: 100, wpm: 0, dmg: 0, isAttacking: false, attackTimer: 0 };
    
    this.gameState = 'PLAYING';
    
    this.lastTime = Date.now();
  }

  start() {
    this.loop = setInterval(() => this.update(), 1000 / 30); // 30 tick rate
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
  }

  handleInput(playerId, data) {
    // legacy, now replaced by handleAttack
  }
  
  handleAttack(playerId, data) {
    if (this.gameState !== 'PLAYING') return;
    
    const damage = data.damage || 0;
    const wpm = data.wpm || 0;
    
    if (playerId === this.p1Id) {
      this.p2.health -= damage;
      this.p1.wpm = wpm;
      this.p1.dmg += damage;
      this.p1.isAttacking = true;
      this.p1.attackTimer = 0.3;
    } else if (playerId === this.p2Id) {
      this.p1.health -= damage;
      this.p2.wpm = wpm;
      this.p2.dmg += damage;
      this.p2.isAttacking = true;
      this.p2.attackTimer = 0.3;
    }
  }

  update() {
    if (this.gameState !== 'PLAYING') return;
    
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    
    // Process attack timers
    if (this.p1.isAttacking) {
      this.p1.attackTimer -= dt;
      if (this.p1.attackTimer <= 0) this.p1.isAttacking = false;
    }
    if (this.p2.isAttacking) {
      this.p2.attackTimer -= dt;
      if (this.p2.attackTimer <= 0) this.p2.isAttacking = false;
    }
    
    // Check Win Condition
    let winner = 0;
    if (this.p1.health <= 0 && this.p2.health <= 0) {
      // Tie breaker based on highest dmg
      winner = this.p1.dmg > this.p2.dmg ? 1 : 2;
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
