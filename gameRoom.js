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
    this.activeSpells = {};
  }

  start() {
    this.loop = setInterval(() => this.update(), 1000 / 30); // 30 tick rate
    
    if (this.p1Id.startsWith('BOT_')) {
      this.startBot(this.p1Id);
    }
    if (this.p2Id.startsWith('BOT_')) {
      this.startBot(this.p2Id);
    }
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
    if (this.botTimeouts) {
      this.botTimeouts.forEach(t => clearTimeout(t));
      this.botTimeouts = [];
    }
  }

  startBot(botId) {
    if (!this.botTimeouts) this.botTimeouts = [];
    const letters = ['K', 'S', 'T', 'A', 'M', 'R', 'P', 'X', 'Z', 'V', 'N', 'B', 'W', 'D'];
    
    const attackLoop = () => {
      if (this.gameState !== 'PLAYING') return;
      
      const letter = letters[Math.floor(Math.random() * letters.length)];
      this.handleAttack(botId, {
        damage: Math.floor(Math.random() * 5) + 5, // 5 to 9 damage
        wpm: 35 + Math.floor(Math.random() * 20),
        letter: letter,
        spellId: 'BOT_SPELL_' + Math.random().toString(36).substring(2, 8)
      });
      
      const nextDelay = 800 + Math.random() * 700; // 0.8s to 1.5s between attacks
      const timeoutId = setTimeout(attackLoop, nextDelay);
      this.botTimeouts.push(timeoutId);
    };
    
    const timeoutId = setTimeout(attackLoop, 2000);
    this.botTimeouts.push(timeoutId);
  }
  
  handleAttack(playerId, data) {
    if (this.gameState !== 'PLAYING') return;
    
    const damage = data.damage || 10;
    const wpm = data.wpm || 0;
    const letter = data.letter || (data.move ? data.move.replace('Spell_', '') : 'SPELL');
    const spellId = data.spellId || Math.random().toString();
    console.log(`handleAttack by ${playerId}: spellId = ${spellId}`);
    
    if (playerId === this.p1Id) {
      this.p1.wpm = wpm;
      
      // Emit projectile attack event to p2 immediately so they see the spell cast
      const p2Socket = this.io.sockets.sockets.get(this.p2Id);
      if (p2Socket) {
        p2Socket.emit('opponentAttack', { letter, damage, wpm, spellId });
      }

      // Delay damage application until the projectile hits (240ms windup + 385ms travel time)
      const timer = setTimeout(() => {
        if (this.gameState === 'PLAYING') {
          this.p2.health = Math.max(0, this.p2.health - damage);
          this.p1.dmg += damage;
        }
        delete this.activeSpells[spellId];
      }, 625);
      this.activeSpells[spellId] = timer;

    } else if (playerId === this.p2Id) {
      this.p2.wpm = wpm;
      
      // Emit projectile attack event to p1 immediately so they see the spell cast
      const p1Socket = this.io.sockets.sockets.get(this.p1Id);
      if (p1Socket) {
        p1Socket.emit('opponentAttack', { letter, damage, wpm, spellId });
      }

      // Delay damage application until the projectile hits
      const timer = setTimeout(() => {
        if (this.gameState === 'PLAYING') {
          this.p1.health = Math.max(0, this.p1.health - damage);
          this.p2.dmg += damage;
        }
        delete this.activeSpells[spellId];
      }, 625);
      this.activeSpells[spellId] = timer;
    }
  }

  handleClash(data) {
    if (!data) return;
    console.log(`Clash detected for spells: ${data.id1}, ${data.id2}`);
    if (data.id1 && this.activeSpells[data.id1]) {
      console.log(`Clearing timeout for ${data.id1}`);
      clearTimeout(this.activeSpells[data.id1]);
      delete this.activeSpells[data.id1];
    }
    if (data.id2 && this.activeSpells[data.id2]) {
      console.log(`Clearing timeout for ${data.id2}`);
      clearTimeout(this.activeSpells[data.id2]);
      delete this.activeSpells[data.id2];
    }
  }

  handleDisconnect(playerId) {
    if (this.gameState !== 'PLAYING') return;
    
    let winner = 0;
    if (playerId === this.p1Id) {
      winner = 2; // P1 disconnected, P2 wins
    } else if (playerId === this.p2Id) {
      winner = 1; // P2 disconnected, P1 wins
    }
    
    if (winner !== 0) {
      this.gameState = 'GAME_OVER';
      this.io.to(this.roomId).emit('gameOver', { winner, reason: 'disconnect' });
      this.stop();
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
