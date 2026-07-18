class GameRoom {
  constructor(roomId, io, p1Id, p2Id) {
    this.roomId = roomId;
    this.io = io;
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    
    this.gridSize = 8;
    this.p1 = { x: 0, y: 0 };
    this.p2 = { x: 7, y: 7 };
    this.scores = { p1: 0, p2: 0 };
    this.turn = 1; // 1 for p1, 2 for p2
    this.stars = [];
    
    this.gameState = 'PLAYING';
    
    // Initial stars
    for(let i=0; i<3; i++) {
      this.spawnStar();
    }
  }

  spawnStar() {
    let x, y;
    let safe = false;
    while(!safe) {
      x = Math.floor(Math.random() * this.gridSize);
      y = Math.floor(Math.random() * this.gridSize);
      // Don't spawn on players
      if (x === this.p1.x && y === this.p1.y) continue;
      if (x === this.p2.x && y === this.p2.y) continue;
      // Don't spawn on other stars
      if (this.stars.some(s => s.x === x && s.y === y)) continue;
      safe = true;
    }
    this.stars.push({ x, y });
  }

  calculateFog(player) {
    const fog = [];
    for(let x=0; x<this.gridSize; x++) {
      fog[x] = [];
      for(let y=0; y<this.gridSize; y++) {
        // Visible if adjacent (including diagonals) or on the same tile
        const dist = Math.max(Math.abs(player.x - x), Math.abs(player.y - y));
        fog[x][y] = dist <= 1;
      }
    }
    return fog;
  }

  start() {
    this.broadcastState();
  }

  stop() {
    // No loops needed for turn based
  }

  handleMove(playerId, intent) {
    if (this.gameState !== 'PLAYING') return;
    
    const isP1 = playerId === this.p1Id;
    const playerNum = isP1 ? 1 : 2;
    
    if (this.turn !== playerNum) return; // Not their turn
    
    const p = isP1 ? this.p1 : this.p2;
    
    // Verify intent is adjacent orthogonally
    const dist = Math.abs(intent.x - p.x) + Math.abs(intent.y - p.y);
    if (dist === 1) {
      // Valid move
      p.x = intent.x;
      p.y = intent.y;
      
      // Check star capture
      const starIdx = this.stars.findIndex(s => s.x === p.x && s.y === p.y);
      if (starIdx !== -1) {
        this.stars.splice(starIdx, 1);
        if (isP1) this.scores.p1++; else this.scores.p2++;
        this.spawnStar();
      }
      
      // Check win condition
      if (this.scores.p1 >= 3 || this.scores.p2 >= 3) {
        this.gameState = 'GAME_OVER';
        this.io.to(this.roomId).emit('gameOver', {
          winner: this.scores.p1 >= 3 ? 1 : 2
        });
      } else {
        // Next turn
        this.turn = this.turn === 1 ? 2 : 1;
      }
      
      this.broadcastState();
    }
  }

  broadcastState() {
    const state = {
      p1: this.p1,
      p2: this.p2,
      scores: this.scores,
      turn: this.turn,
      stars: this.stars,
      fog1: this.calculateFog(this.p1),
      fog2: this.calculateFog(this.p2)
    };
    this.io.to(this.roomId).emit('gameState', state);
  }
}

module.exports = GameRoom;
