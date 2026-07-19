/**
 * SwordCombatEngine.js
 * High-performance Ninja Stickman Combat Engine for MagStrike.io
 * Integrates: Keyframe Pose Animation, WPM-driven speed, Motion Blur,
 *             Slash Arcs, Impact Particles, and Screen Shake.
 * 
 * Usage:
 *   const engine = new SwordCombatEngine(canvas, 1, 'blue');
 *   engine.start();
 *   engine.attack(wpm, wordLength); // called on word completion
 */

// ---------------------------------------------------------------------------
// ─── MATH UTILS ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
function Vec2(x, y) { return { x, y }; }
function vecLerp(a, b, t) { return Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t)); }
function vecDist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function vecAdd(a, b) { return Vec2(a.x + b.x, a.y + b.y); }

// ---------------------------------------------------------------------------
// ─── KEYFRAME POSE DEFINITIONS ──────────────────────────────────────────────
// ---------------------------------------------------------------------------
// All joints relative to a "root" anchor (hips center).
// Keys: head, neck, shoulder, elbowR, wristR, elbowL, wristL,
//       hipR, kneeR, footR, hipL, kneeL, footL, swordTip

const POSES = {
  IDLE: {
    head:      Vec2(0, -130),
    neck:      Vec2(0, -100),
    shoulder:  Vec2(0,  -85),
    elbowR:    Vec2( 35,  -60),
    wristR:    Vec2( 55,  -35),
    elbowL:    Vec2(-30,  -60),
    wristL:    Vec2(-45,  -30),
    hipR:      Vec2( 15,    0),
    kneeR:     Vec2( 20,   55),
    footR:     Vec2( 25,  110),
    hipL:      Vec2(-15,    0),
    kneeL:     Vec2(-20,   55),
    footL:     Vec2(-25,  110),
    swordTip:  Vec2( 90,  -40),
  },

  READY: {
    head:      Vec2(5, -125),
    neck:      Vec2(5,  -97),
    shoulder:  Vec2(5,  -82),
    elbowR:    Vec2( 45,  -90),
    wristR:    Vec2( 70,  -130),
    elbowL:    Vec2(-20,  -70),
    wristL:    Vec2(-35,  -40),
    hipR:      Vec2( 20,    0),
    kneeR:     Vec2( 30,   50),
    footR:     Vec2( 40,  105),
    hipL:      Vec2(-15,    0),
    kneeL:     Vec2(-10,   60),
    footL:     Vec2( -5,  110),
    swordTip:  Vec2(120,  -165),
  },

  LUNGE: {
    head:      Vec2(55, -110),
    neck:      Vec2(45,  -85),
    shoulder:  Vec2(30,  -72),
    elbowR:    Vec2( 95,  -75),
    wristR:    Vec2(160,  -78),
    elbowL:    Vec2(  0,  -50),
    wristL:    Vec2(-20,  -20),
    hipR:      Vec2( 35,    0),
    kneeR:     Vec2( 80,   50),
    footR:     Vec2(120,  100),
    hipL:      Vec2(-20,    0),
    kneeL:     Vec2(-50,   45),
    footL:     Vec2(-80,   90),
    swordTip:  Vec2(250,  -80),
  },

  RECOVER: {
    head:      Vec2(20, -120),
    neck:      Vec2(15,  -95),
    shoulder:  Vec2(10,  -80),
    elbowR:    Vec2( 55,  -65),
    wristR:    Vec2( 75,  -45),
    elbowL:    Vec2(-25,  -65),
    wristL:    Vec2(-40,  -35),
    hipR:      Vec2( 18,    0),
    kneeR:     Vec2( 24,   53),
    footR:     Vec2( 30,  108),
    hipL:      Vec2(-15,    0),
    kneeL:     Vec2(-18,   53),
    footL:     Vec2(-22,  108),
    swordTip:  Vec2(110,  -55),
  },

  HIT: {
    head:      Vec2(-20, -115),
    neck:      Vec2(-15,  -88),
    shoulder:  Vec2(-10,  -75),
    elbowR:    Vec2(-45,  -50),
    wristR:    Vec2(-70,  -25),
    elbowL:    Vec2( 15,  -55),
    wristL:    Vec2( 30,  -25),
    hipR:      Vec2(-10,    0),
    kneeR:     Vec2(-15,   55),
    footR:     Vec2(-20,  110),
    hipL:      Vec2( 10,    0),
    kneeL:     Vec2( 18,   55),
    footL:     Vec2( 22,  110),
    swordTip:  Vec2(-80,  -35),
  },
};

// ---------------------------------------------------------------------------
// ─── PARTICLE ───────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

class Particle {
  /**
   * @param {number} x
   * @param {number} y
   * @param {'spark'|'slash_arc'} type
   * @param {number} power - 0..1 intensity
   */
  constructor(x, y, type, power = 0.5) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.power = power;
    this.life = 1.0;
    this.decay = rand(0.03, 0.07);

    if (type === 'spark') {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2, 8) * (0.5 + power);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = rand(1.5, 4) * (0.5 + power * 0.5);
      this.color = power > 0.7
        ? `hsl(${randInt(30, 50)}, 100%, 70%)`
        : `hsl(${randInt(0, 20)}, 100%, 60%)`;

    } else if (type === 'slash_arc') {
      this.radius     = rand(20, 50);
      this.maxRadius  = rand(80, 180) * (0.5 + power);
      this.startAngle = rand(0, Math.PI * 2);
      this.arcLength  = rand(0.5, 1.2);
      this.decay      = rand(0.015, 0.04);
      this.thickness  = rand(2, 6) * (0.5 + power);
      this.color = power > 0.7
        ? `hsl(${randInt(40, 60)}, 100%, 75%)`
        : `hsl(${randInt(180, 220)}, 100%, 65%)`;
    }
  }

  update() {
    this.life -= this.decay;

    if (this.type === 'spark') {
      this.x  += this.vx;
      this.y  += this.vy;
      this.vy += 0.3; // gravity
      this.vx *= 0.96;

    } else if (this.type === 'slash_arc') {
      this.radius = lerp(this.radius, this.maxRadius, 0.12);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = clamp(this.life, 0, 1);

    if (this.type === 'spark') {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
      ctx.fill();

    } else if (this.type === 'slash_arc') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.thickness * this.life;
      ctx.shadowColor = this.color;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, this.startAngle, this.startAngle + this.arcLength);
      ctx.stroke();
    }

    ctx.restore();
  }

  get dead() { return this.life <= 0; }
}

// ---------------------------------------------------------------------------
// ─── MOTION BLUR TRAIL ──────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

class SwordTrail {
  constructor() {
    this.points = []; // {x, y, age}
    this.maxLen = 12;
    this.active = false;
    this.color  = '#88ccff';
  }

  push(x, y) {
    this.points.unshift({ x, y, age: 0 });
    if (this.points.length > this.maxLen) this.points.pop();
  }

  update() {
    this.points.forEach(p => p.age++);
  }

  draw(ctx) {
    if (this.points.length < 2) return;
    ctx.save();
    for (let i = 1; i < this.points.length; i++) {
      const prev  = this.points[i - 1];
      const curr  = this.points[i];
      const alpha = (1 - i / this.points.length) * 0.6;
      const width = (1 - i / this.points.length) * 6;

      ctx.globalAlpha  = alpha;
      ctx.strokeStyle  = this.color;
      ctx.lineWidth    = width;
      ctx.shadowColor  = this.color;
      ctx.shadowBlur   = 15;
      ctx.lineCap      = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  clear() { this.points = []; }
}

// ---------------------------------------------------------------------------
// ─── STICKMAN ───────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

class Stickman {
  /**
   * @param {number} x - World X of stickman root (hips)
   * @param {number} y - World Y of stickman root
   * @param {-1|1} facingDir - 1 = faces right, -1 = faces left
   * @param {string} accentColor - Main outline color
   */
  constructor(x, y, facingDir = 1, accentColor = '#3498db') {
    this.x          = x;
    this.y          = y;
    this.facing     = facingDir;
    this.color      = accentColor;
    this.headRadius = 22;

    // Current interpolated pose (copy of IDLE)
    this.joints = this._copyPose(POSES.IDLE);

    // Animation state machine
    this._poseState   = 'IDLE';
    this._targetPose  = POSES.IDLE;
    this._sourcePose  = POSES.IDLE;
    this._poseT       = 1.0;   // 0..1 interpolation progress
    this._poseSpeed   = 6.0;   // progress units per second
    this._pendingIdle = false;

    // WPM-driven dynamics
    this.wpm = 0;           // last known WPM
    this._idleBob = 0;      // idle bob time accumulator
    this._bobAmp  = 6;      // pixels

    // VFX sub-systems
    this.trail     = new SwordTrail();
    this.particles = [];

    // Screen shake
    this._shake     = { x: 0, y: 0 };
    this._shakePow  = 0;

    // Health (cosmetic only here – game.js owns authoritative health)
    this.health      = 100;
    this._flashTimer = 0;
  }

  // ── Pose helpers ──

  _copyPose(src) {
    const out = {};
    for (const k in src) out[k] = Vec2(src[k].x, src[k].y);
    return out;
  }

  _transitionTo(poseName, speed) {
    this._sourcePose = this._copyPose(this.joints);
    this._targetPose = POSES[poseName];
    this._poseState  = poseName;
    this._poseSpeed  = speed;
    this._poseT      = 0;
  }

  // ── Public API ──

  /**
   * Trigger an attack animation driven by WPM and word length.
   * @param {number} wpm
   * @param {number} wordLength
   */
  attack(wpm, wordLength) {
    this.wpm = wpm;

    // WPM-driven animation speed: 60 WPM → 3.5x, 120+ WPM → 7x
    const speedMult = clamp(wpm / 30, 1, 8);
    const power     = clamp((wpm * wordLength) / 600, 0, 1);

    // 1. READY pose (wind-up)
    this._transitionTo('READY', speedMult * 6);
    this.trail.active = true;
    this.trail.color  = power > 0.7 ? '#ffd700' : '#88ccff';

    // 2. After wind-up: LUNGE
    const readyDuration = 200 / speedMult;
    setTimeout(() => {
      this._transitionTo('LUNGE', speedMult * 14);
      this._pendingIdle = false;

      // 3. At lunge peak: VFX
      setTimeout(() => {
        const tipWorld = this._worldJoint('swordTip');
        this._spawnImpact(tipWorld.x, tipWorld.y, power, wpm);
        if (power > 0.55) this._triggerShake(power);
        this._flashTimer = 0.12;

        // 4. RECOVER → IDLE
        const recoverDelay = 120 / speedMult;
        setTimeout(() => {
          this._transitionTo('RECOVER', speedMult * 5);
          setTimeout(() => {
            this.trail.active = false;
            this.trail.clear();
            this._transitionTo('IDLE', 3.5);
          }, recoverDelay * 1.5);
        }, recoverDelay);

      }, 140 / speedMult);
    }, readyDuration);
  }

  /**
   * Play the hit-reaction animation when receiving damage.
   */
  takeHit() {
    this._transitionTo('HIT', 10);
    this._flashTimer = 0.2;
    setTimeout(() => this._transitionTo('IDLE', 3.5), 300);
  }

  // ── Per-frame update ──

  /**
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Idle bob
    this._idleBob += dt;
    const bobOffset = this._poseState === 'IDLE'
      ? Math.sin(this._idleBob * 3.5) * this._bobAmp
      : 0;

    // Pose interpolation (ease-out quad)
    if (this._poseT < 1.0) {
      this._poseT = clamp(this._poseT + dt * this._poseSpeed, 0, 1);
      const et = 1 - (1 - this._poseT) * (1 - this._poseT); // ease-out

      for (const k in this._targetPose) {
        this.joints[k] = vecLerp(this._sourcePose[k], this._targetPose[k], et);
      }
    }

    // Apply bob on top of interpolated pose
    if (this._poseState === 'IDLE') {
      for (const k in this.joints) {
        this.joints[k] = Vec2(this.joints[k].x, this.joints[k].y + bobOffset * 0.5);
      }
    }

    // Sword trail
    if (this.trail.active) {
      const tip = this._worldJoint('swordTip');
      this.trail.push(tip.x, tip.y);
    }
    this.trail.update();

    // Particles
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);

    // Screen shake decay
    if (this._shakePow > 0) {
      this._shakePow = Math.max(0, this._shakePow - dt * 8);
      const mag = this._shakePow * 12;
      this._shake.x = rand(-mag, mag);
      this._shake.y = rand(-mag, mag);
    } else {
      this._shake.x = 0;
      this._shake.y = 0;
    }

    // Flash timer
    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  // ── Per-frame draw ──

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this._shake.x, this.y + this._shake.y);
    ctx.scale(this.facing, 1);

    // Flash effect on hit / attack contact
    const isFlash = this._flashTimer > 0;

    // Draw sword trail (behind body)
    this.trail.draw(ctx);

    // Draw particles (behind body)
    this.particles.forEach(p => {
      // Translate back to screen space for abs-positioned particles
      ctx.save();
      ctx.translate(-this.x, -this.y);
      p.draw(ctx);
      ctx.restore();
    });

    this._drawBody(ctx, isFlash);

    ctx.restore();
  }

  // ── Private drawing ──

  _drawBody(ctx, isFlash) {
    const j  = this.joints;
    const c  = isFlash ? '#ffffff' : this.color;
    const lw = 7;

    ctx.shadowColor  = c;
    ctx.shadowBlur   = isFlash ? 30 : 10;
    ctx.strokeStyle  = c;
    ctx.lineWidth    = lw;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';

    // Torso
    this._line(ctx, j.neck, j.shoulder);

    // Spine (shoulder to hip center)
    const hipsCenter = Vec2(
      (j.hipR.x + j.hipL.x) / 2,
      (j.hipR.y + j.hipL.y) / 2
    );
    this._line(ctx, j.shoulder, hipsCenter);

    // Arms
    this._line(ctx, j.shoulder, j.elbowR);
    this._line(ctx, j.elbowR,   j.wristR);
    this._line(ctx, j.shoulder, j.elbowL);
    this._line(ctx, j.elbowL,   j.wristL);

    // Legs
    this._line(ctx, hipsCenter, j.kneeR);
    this._line(ctx, j.kneeR,    j.footR);
    this._line(ctx, hipsCenter, j.kneeL);
    this._line(ctx, j.kneeL,    j.footL);

    // Head
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, this.headRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Ninja Headband
    const band_y = j.head.y - 5;
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth   = 4;
    ctx.shadowColor = '#ff3333';
    ctx.beginPath();
    ctx.moveTo(j.head.x - this.headRadius, band_y);
    ctx.lineTo(j.head.x + this.headRadius, band_y);
    ctx.stroke();
    // Headband tail
    ctx.beginPath();
    ctx.moveTo(j.head.x + this.headRadius, band_y);
    ctx.lineTo(j.head.x + this.headRadius + 18, band_y + 20);
    ctx.stroke();

    // Eyes
    ctx.fillStyle   = c;
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.arc(j.head.x + 8, j.head.y + 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Sword (drawn from wristR → swordTip)
    this._drawSword(ctx, j.wristR, j.swordTip, isFlash);
  }

  _drawSword(ctx, handlePos, tipPos, isFlash) {
    // Blade glow layers (multi-pass for radiant effect)
    const passes = [
      { width: 18, alpha: 0.06, blur: 25 },
      { width: 10, alpha: 0.15, blur: 15 },
      { width:  4, alpha: 0.90, blur:  5 },
    ];

    const bladeColor = this._poseState === 'LUNGE'
      ? (this.wpm > 80 ? '#ffd700' : '#88ccff')
      : this.color;

    passes.forEach(({ width, alpha, blur }) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = bladeColor;
      ctx.lineWidth   = width;
      ctx.shadowColor = bladeColor;
      ctx.shadowBlur  = blur;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(handlePos.x, handlePos.y);
      ctx.lineTo(tipPos.x,    tipPos.y);
      ctx.stroke();
      ctx.restore();
    });

    // Sword guard (crossguard)
    const guardFrac = 0.15;
    const guardX    = lerp(handlePos.x, tipPos.x, guardFrac);
    const guardY    = lerp(handlePos.y, tipPos.y, guardFrac);
    const perpX     = -(tipPos.y - handlePos.y);
    const perpY     =   tipPos.x - handlePos.x;
    const perpLen   = Math.hypot(perpX, perpY) || 1;
    const gLen      = 14;

    ctx.save();
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth   = 5;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 8;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(guardX - (perpX / perpLen) * gLen, guardY - (perpY / perpLen) * gLen);
    ctx.lineTo(guardX + (perpX / perpLen) * gLen, guardY + (perpY / perpLen) * gLen);
    ctx.stroke();
    ctx.restore();

    // Blade tip accent
    ctx.save();
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = bladeColor;
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(tipPos.x, tipPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _line(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // ── VFX Helpers ──

  _worldJoint(name) {
    const j = this.joints[name];
    return Vec2(
      this.x + j.x * this.facing,
      this.y + j.y
    );
  }

  _spawnImpact(worldX, worldY, power, wpm) {
    // Spark burst
    const sparkCount = Math.floor(lerp(8, 28, power));
    for (let i = 0; i < sparkCount; i++) {
      this.particles.push(new Particle(worldX, worldY, 'spark', power));
    }

    // Slash arcs (more for high power)
    const arcCount = power > 0.5 ? (power > 0.8 ? 4 : 2) : 1;
    for (let i = 0; i < arcCount; i++) {
      this.particles.push(new Particle(worldX, worldY, 'slash_arc', power));
    }
  }

  _triggerShake(power) {
    this._shakePow = clamp(power, 0, 1);
  }
}

// ---------------------------------------------------------------------------
// ─── SWORD COMBAT ENGINE ────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

class SwordCombatEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} playerSide - 1 = local player (left), 2 = enemy (right)
   * @param {string} accentColor - Stickman color
   */
  constructor(canvas, playerSide = 1, accentColor = '#3498db') {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.side    = playerSide;
    this._raf    = null;
    this._last   = 0;

    const isLeft  = (playerSide === 1);
    const rootX   = isLeft ? canvas.width * 0.28 : canvas.width * 0.72;
    const rootY   = canvas.height * 0.72;
    const facing  = isLeft ? 1 : -1;

    this.stickman = new Stickman(rootX, rootY, facing, accentColor);

    // Floor line Y
    this._floorY = canvas.height * 0.78;
  }

  start() {
    this._running = true;
    this._last    = performance.now();
    this._raf     = requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  // Called on word completion; wpm and wordLength drive animation speed + VFX power
  attack(wpm, wordLength) {
    this.stickman.attack(wpm, wordLength);
  }

  receiveHit() {
    this.stickman.takeHit();
  }

  updateHealth(pct) {
    this.stickman.health = clamp(pct, 0, 100);
  }

  _loop(now) {
    if (!this._running) return;

    const dt = clamp((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    this._update(dt);
    this._draw();

    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _update(dt) {
    this.stickman.update(dt);
  }

  _draw() {
    const { ctx, canvas } = this;

    // Background — let the surrounding page handle the bg;
    // only clear the local stickman region via clearRect so both
    // engines can share the same canvas safely.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Floor glow
    const grad = ctx.createLinearGradient(0, this._floorY - 20, 0, this._floorY + 10);
    grad.addColorStop(0, 'rgba(255,51,51,0.25)');
    grad.addColorStop(1, 'rgba(255,51,51,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, this._floorY - 20, canvas.width, 30);

    // Stickman
    this.stickman.draw(ctx);
  }
}

// ---------------------------------------------------------------------------
// ─── DUAL ENGINE MANAGER ────────────────────────────────────────────────────
// (Replaces the old monolithic graphics object in game.js)
// ---------------------------------------------------------------------------

class DualCombatScene {
  /**
   * Orchestrates both stickmen on ONE canvas.
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this._raf    = null;
    this._last   = 0;
    this.running = false;

    const W = canvas.width;
    const H = canvas.height;

    // Player 1 = left, blue
    this.p1 = new Stickman(W * 0.28, H * 0.72,  1, '#3498db');
    // Player 2 = right, red
    this.p2 = new Stickman(W * 0.72, H * 0.72, -1, '#e74c3c');

    this._floorY = H * 0.78;
  }

  start() {
    this.running = true;
    this._last   = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  stop() { this.running = false; }

  /** Called from game.js: local player completed a word */
  triggerLocalAttack(wpm, wordLength) {
    // isPlayer1 comes from appState which is declared in game.js
    if (typeof appState !== 'undefined' && appState.match.isPlayer1) {
      this.p1.attack(wpm, wordLength);
      this.p2.takeHit();
    } else {
      this.p2.attack(wpm, wordLength);
      this.p1.takeHit();
    }
  }

  /** Called from game.js: server notified that enemy attacked */
  triggerEnemyAttack() {
    if (typeof appState !== 'undefined' && appState.match.isPlayer1) {
      this.p2.attack(60, 5);  // generic anim since we don't have enemy WPM here
      this.p1.takeHit();
    } else {
      this.p1.attack(60, 5);
      this.p2.takeHit();
    }
  }

  updateHealthBars(myHealthPct, enemyHealthPct) {
    if (typeof appState !== 'undefined' && appState.match.isPlayer1) {
      this.p1.health = myHealthPct;
      this.p2.health = enemyHealthPct;
    } else {
      this.p2.health = myHealthPct;
      this.p1.health = enemyHealthPct;
    }
  }

  _loop(now) {
    if (!this.running) return;
    const dt = clamp((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    this.p1.update(dt);
    this.p2.update(dt);

    this._draw();
    requestAnimationFrame(this._loop.bind(this));
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Atmospheric background gradient
    const bg = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 50,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    bg.addColorStop(0, 'rgba(30,0,0,0.9)');
    bg.addColorStop(1, 'rgba(5,0,0,0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,51,51,0.4)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur  = 15;
    ctx.beginPath();
    ctx.moveTo(0,           this._floorY);
    ctx.lineTo(canvas.width, this._floorY);
    ctx.stroke();

    // Floor glow
    const floorGrad = ctx.createLinearGradient(0, this._floorY - 30, 0, this._floorY + 40);
    floorGrad.addColorStop(0, 'rgba(255,51,51,0.12)');
    floorGrad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, this._floorY - 30, canvas.width, 70);
    ctx.restore();

    // Center divider (faint)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.setLineDash([10, 20]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.restore();

    // Stickmen
    this.p1.draw(ctx);
    this.p2.draw(ctx);
  }
}

// ---------------------------------------------------------------------------
// ─── EXPORT ─────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

// Make available globally (no bundler required)
window.SwordCombatEngine  = SwordCombatEngine;
window.DualCombatScene    = DualCombatScene;
window.Stickman           = Stickman;
