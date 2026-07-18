class GameRoom {
  constructor(roomId, io, p1Id, p2Id) {
    this.roomId = roomId;
    this.io = io;
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    
    // Board is 800x800 logical size.
    // P1 (Blue) starts at bottom. P2 (Red) starts at top.
    this.p1 = { x: 400, y: 750, vx: 0, vy: 0, radius: 20 };
    this.p2 = { x: 400, y: 50, vx: 0, vy: 0, radius: 20 };
    
    this.p1Input = { w: false, a: false, s: false, d: false };
    this.p2Input = { w: false, a: false, s: false, d: false };
    
    this.shiftTimer = 5.0;
    this.invertedPlayer = Math.random() > 0.5 ? 1 : 2;
    
    this.gameState = 'PLAYING';
    
    // Start with a few random maze blocks
    this.maze = [];
    for(let i=0; i<5; i++) {
      this.spawnRandomMazeBlock();
    }
  }

  spawnRandomMazeBlock() {
    const w = Math.random() > 0.5 ? 200 : 40;
    const h = w === 200 ? 40 : 200;
    const x = 50 + Math.random() * (700 - w);
    const y = 150 + Math.random() * (500 - h);
    this.maze.push({ x, y, w, h });
  }

  start() {
    this.lastTime = Date.now();
    this.loop = setInterval(() => this.update(), 1000 / 60);
    
    // Dynamic Maze Loop: Every 1 second, remove a block and spawn a new one
    this.mazeLoop = setInterval(() => {
      if (this.gameState === 'PLAYING') {
        if (this.maze.length > 3) {
          // Remove 1 to 2 random blocks
          const removes = Math.floor(Math.random() * 2) + 1;
          for(let i=0; i<removes; i++) {
            const idx = Math.floor(Math.random() * this.maze.length);
            this.maze.splice(idx, 1);
          }
        }
        
        // Add 1 to 2 new random blocks
        const adds = Math.floor(Math.random() * 2) + 1;
        for(let i=0; i<adds; i++) {
          this.spawnRandomMazeBlock();
        }
      }
    }, 1000);
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
    if (this.mazeLoop) clearInterval(this.mazeLoop);
  }

  handleInput(playerId, keys) {
    if (playerId === this.p1Id) this.p1Input = keys;
    if (playerId === this.p2Id) this.p2Input = keys;
  }

  applyMovement(p, input, isInverted, dt) {
    const speed = 300 * dt;
    
    let dx = 0; let dy = 0;
    if (input.w || input.ArrowUp) dy -= 1;
    if (input.s || input.ArrowDown) dy += 1;
    if (input.a || input.ArrowLeft) dx -= 1;
    if (input.d || input.ArrowRight) dx += 1;
    
    if (isInverted) {
      dx *= -1;
      dy *= -1;
    }
    
    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      dx /= len; dy /= len;
    }
    
    p.vx = dx * speed;
    p.vy = dy * speed;
    
    // Apply velocity and collide with walls
    let nextX = p.x + p.vx;
    let nextY = p.y + p.vy;
    
    // Bounds
    nextX = Math.max(p.radius, Math.min(800 - p.radius, nextX));
    nextY = Math.max(p.radius, Math.min(800 - p.radius, nextY));
    
    // Maze collision (simple AABB vs Circle approximation)
    for (const block of this.maze) {
      // Find closest point on AABB to circle
      let testX = nextX;
      let testY = nextY;
      
      if (nextX < block.x) testX = block.x;
      else if (nextX > block.x + block.w) testX = block.x + block.w;
      
      if (nextY < block.y) testY = block.y;
      else if (nextY > block.y + block.h) testY = block.y + block.h;
      
      let distX = nextX - testX;
      let distY = nextY - testY;
      let distance = Math.sqrt((distX*distX) + (distY*distY));
      
      if (distance <= p.radius) {
        // Collision! Push back
        if (distance === 0) { nextX = p.x; nextY = p.y; } // stuck
        else {
          const push = p.radius - distance;
          nextX += (distX / distance) * push;
          nextY += (distY / distance) * push;
        }
      }
    }
    
    p.x = nextX;
    p.y = nextY;
  }

  update() {
    if (this.gameState !== 'PLAYING') return;
    
    const now = Date.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    
    // Shift Timer
    this.shiftTimer -= dt;
    if (this.shiftTimer <= 0) {
      this.shiftTimer = 5.0;
      this.invertedPlayer = this.invertedPlayer === 1 ? 2 : 1;
      this.io.to(this.roomId).emit('shiftPulse', this.invertedPlayer);
    }
    
    // Movement
    this.applyMovement(this.p1, this.p1Input, this.invertedPlayer === 1, dt);
    this.applyMovement(this.p2, this.p2Input, this.invertedPlayer === 2, dt);
    
    // Player Collision (Bumping)
    let dx = this.p2.x - this.p1.x;
    let dy = this.p2.y - this.p1.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    const minDist = this.p1.radius + this.p2.radius;
    
    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      
      // Push both apart
      this.p1.x -= nx * overlap * 0.5;
      this.p1.y -= ny * overlap * 0.5;
      this.p2.x += nx * overlap * 0.5;
      this.p2.y += ny * overlap * 0.5;
    }
    
    // Win Condition
    // P1 wins if they reach Y < 50
    // P2 wins if they reach Y > 750
    let winner = 0;
    if (this.p1.y < 50) winner = 1;
    if (this.p2.y > 750) winner = 2;
    
    if (winner !== 0) {
      this.gameState = 'GAME_OVER';
      this.io.to(this.roomId).emit('gameOver', { winner });
      this.stop();
    }
    
    // Broadcast State
    this.io.to(this.roomId).emit('gameState', {
      p1: this.p1,
      p2: this.p2,
      timer: this.shiftTimer,
      invertedPlayer: this.invertedPlayer,
      maze: this.maze
    });
  }
}

module.exports = GameRoom;
