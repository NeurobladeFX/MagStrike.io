class Entity {
  constructor(x, y, radius, mass) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = radius;
    this.mass = mass;
  }
  update(friction) {
    this.vx *= friction;
    this.vy *= friction;
    this.x += this.vx;
    this.y += this.vy;
  }
}

class GameRoom {
  constructor(roomId, io, p1Id, p2Id) {
    this.roomId = roomId;
    this.io = io;
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    
    // Arena dimensions
    this.cw = 1200;
    this.ch = 800;
    
    this.p1 = new Entity(this.cw * 0.2, this.ch / 2, 30, 1.5);
    this.p2 = new Entity(this.cw * 0.8, this.ch / 2, 30, 1.5);
    this.ball = new Entity(this.cw / 2, this.ch / 2, 25, 1);
    
    this.scores = { p1: 0, p2: 0 };
    this.gameState = 'PLAYING';
    
    this.inputs = {
      [this.p1Id]: {},
      [this.p2Id]: {}
    };
    
    this.trails = {
      [this.p1Id]: 'default',
      [this.p2Id]: 'default'
    };
    
    this.usernames = {
      [this.p1Id]: 'Player 1',
      [this.p2Id]: 'Player 2'
    };
    
    this.visualEffects = [];
    this.loopInterval = null;
  }
  
  handleInput(playerId, keys) {
    if (this.inputs[playerId]) {
      this.inputs[playerId] = keys;
    }
  }
  
  setPlayerTrail(playerId, trailId) {
    if (this.trails[playerId] !== undefined) {
      this.trails[playerId] = trailId;
    }
  }

  setPlayerUsername(playerId, username) {
    if (this.usernames[playerId] !== undefined) {
      this.usernames[playerId] = username;
    }
  }

  start() {
    this.scores = { p1: 0, p2: 0 };
    this.resetPositions();
    this.status = 'COUNTDOWN';
    this.countdownValue = 3;
    
    this.loopInterval = setInterval(() => {
      if (this.status === 'COUNTDOWN') {
        this.countdownValue -= 1 / 60;
        if (this.countdownValue <= 0) {
          this.status = 'PLAYING';
        }
      } else {
        this.updatePhysics();
      }
      this.broadcastState();
    }, 1000 / 60);
  }
  
  stop() {
    if (this.loopInterval) clearInterval(this.loopInterval);
  }
  
  resetPositions() {
    this.p1.x = this.cw * 0.2; this.p1.y = this.ch / 2; this.p1.vx = 0; this.p1.vy = 0;
    this.p2.x = this.cw * 0.8; this.p2.y = this.ch / 2; this.p2.vx = 0; this.p2.vy = 0;
    this.ball.x = this.cw / 2; this.ball.y = this.ch / 2; this.ball.vx = 0; this.ball.vy = 0;
  }
  
  applyMagnet(player, ball, isAttract) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const distSq = dx*dx + dy*dy;
    const dist = Math.sqrt(distSq);
    
    if (isAttract && dist < player.radius + ball.radius) return;
    
    const forceMag = 25000 / Math.max(distSq, 2500);
    const force = Math.min(forceMag, 8);
    const sign = isAttract ? -1 : 1;
    
    const nx = dx / dist;
    const ny = dy / dist;
    
    ball.vx += nx * force * sign / ball.mass;
    ball.vy += ny * force * sign / ball.mass;
    
    player.vx -= nx * force * sign / player.mass * 0.4;
    player.vy -= ny * force * sign / player.mass * 0.4;
    
    if (isAttract) {
      this.visualEffects.push({ type: 'line', p1: {x:player.x, y:player.y}, p2: {x:ball.x, y:ball.y}, color: player === this.p1 ? '#45f3ff' : '#ff45a1', width: force*1.5 });
    } else {
      if (Math.random() > 0.7) {
        this.visualEffects.push({ type: 'ring', x: player.x, y: player.y, r: player.radius, color: 'rgba(255, 69, 69, 0.5)' });
      }
    }
  }
  
  circleCollision(e1, e2, restitution=0.8) {
    const dx = e2.x - e1.x;
    const dy = e2.y - e1.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minDist = e1.radius + e2.radius;
    
    if (dist < minDist) {
      const nx = dx / dist;
      const ny = dy / dist;
      const vnx = e1.vx - e2.vx;
      const vny = e1.vy - e2.vy;
      const vNormal = vnx*nx + vny*ny;
      
      if (vNormal > 0) {
        const impulse = (1 + restitution) * vNormal / (1/e1.mass + 1/e2.mass);
        e1.vx -= impulse * nx / e1.mass;
        e1.vy -= impulse * ny / e1.mass;
        e2.vx += impulse * nx / e2.mass;
        e2.vy += impulse * ny / e2.mass;
      }
      
      const overlap = minDist - dist;
      const corr = overlap / (1/e1.mass + 1/e2.mass) * 0.5;
      e1.x -= nx * corr / e1.mass;
      e1.y -= ny * corr / e1.mass;
      e2.x += nx * corr / e2.mass;
      e2.y += ny * corr / e2.mass;
    }
  }

  aabbBounds(e, bounce) {
    if (e.x - e.radius < 0) { e.x = e.radius; e.vx *= -bounce; }
    if (e.x + e.radius > this.cw) { e.x = this.cw - e.radius; e.vx *= -bounce; }
    if (e.y - e.radius < 0) { e.y = e.radius; e.vy *= -bounce; }
    if (e.y + e.radius > this.ch) { e.y = this.ch - e.radius; e.vy *= -bounce; }
  }

  updatePhysics() {
    if (this.gameState !== 'PLAYING') return;
    
    this.visualEffects = [];
    
    const accel = 0.65;
    const maxSpeed = 10;
    const p1Keys = this.inputs[this.p1Id] || {};
    const p2Keys = this.inputs[this.p2Id] || {};
    
    // P1 Movement (WASD)
    if (p1Keys['KeyW']) this.p1.vy -= accel;
    if (p1Keys['KeyS']) this.p1.vy += accel;
    if (p1Keys['KeyA']) this.p1.vx -= accel;
    if (p1Keys['KeyD']) this.p1.vx += accel;
    
    // P2 Movement (Arrows)
    if (p2Keys['ArrowUp']) this.p2.vy -= accel;
    if (p2Keys['ArrowDown']) this.p2.vy += accel;
    if (p2Keys['ArrowLeft']) this.p2.vx -= accel;
    if (p2Keys['ArrowRight']) this.p2.vx += accel;
    
    [this.p1, this.p2].forEach(p => {
      const v = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
      if (v > maxSpeed) { p.vx = p.vx/v*maxSpeed; p.vy = p.vy/v*maxSpeed; }
    });
    
    if (p1Keys['KeyQ']) this.applyMagnet(this.p1, this.ball, true);
    if (p1Keys['KeyE']) this.applyMagnet(this.p1, this.ball, false);
    if (p2Keys['KeyK']) this.applyMagnet(this.p2, this.ball, true);
    if (p2Keys['KeyL']) this.applyMagnet(this.p2, this.ball, false);
    
    this.p1.update(0.92);
    this.p2.update(0.92);
    this.ball.update(0.98);
    
    this.circleCollision(this.p1, this.p2, 0.3);
    this.circleCollision(this.p1, this.ball, 0.9);
    this.circleCollision(this.p2, this.ball, 0.9);
    
    this.aabbBounds(this.p1, 0.5);
    this.aabbBounds(this.p2, 0.5);
    
    const goalH = 400;
    const goalY = (this.ch - goalH)/2;
    if (this.ball.y > goalY && this.ball.y < goalY + goalH) {
      if (this.ball.x - this.ball.radius < 0) this.handleGoal(2);
      else if (this.ball.x + this.ball.radius > this.cw) this.handleGoal(1);
      else this.aabbBounds(this.ball, 0.8);
    } else {
      this.aabbBounds(this.ball, 0.8);
    }
  }
  
  handleGoal(scorer) {
    this.gameState = 'GOAL_SCORED';
    if (scorer === 1) this.scores.p1++;
    else this.scores.p2++;
    
    this.io.to(this.roomId).emit('goalScored', { scorer, scores: this.scores, ball: { x: this.ball.x, y: this.ball.y } });
    
    if (this.scores.p1 >= 5 || this.scores.p2 >= 5) {
      const winner = this.scores.p1 >= 5 ? 1 : 2;
      setTimeout(() => {
        this.io.to(this.roomId).emit('gameOver', { winner });
        this.stop();
      }, 1500);
    } else {
      this.ball.x = -1000;
      setTimeout(() => {
        this.resetPositions();
        this.gameState = 'PLAYING';
      }, 1500);
    }
  }
  
  broadcastState() {
    const state = {
      status: this.status,
      countdown: Math.ceil(this.countdownValue),
      p1: { x: this.p1.x, y: this.p1.y, vx: this.p1.vx, vy: this.p1.vy, trail: this.trails[this.p1Id], username: this.usernames[this.p1Id] },
      p2: { x: this.p2.x, y: this.p2.y, vx: this.p2.vx, vy: this.p2.vy, trail: this.trails[this.p2Id], username: this.usernames[this.p2Id] },
      ball: { x: this.ball.x, y: this.ball.y, radius: this.ball.radius },
      fx: this.visualEffects
    };
    this.io.to(this.roomId).emit('state', state);
  }
}

module.exports = GameRoom;
