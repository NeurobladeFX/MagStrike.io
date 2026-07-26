/**
 * SwordCombatEngine.js (Mage Combat Engine)  v4.0 — MagStrike
 * ─────────────────────────────────────────────────────────────────────────────
 * MAGE SPELL COMBAT ENGINE:
 *  • Stickman Mage bodies: default solid BLACK silhouette.
 *  • Hand Magic Light VFX: Pulsing glowing elemental magic light on both hands.
 *  • Alternating Hand Cast Animations: Attacks alternate between Right & Left hand.
 *  • Word Projectiles: Glowing letter/word projectiles ("K", "S", "T") hurled from hands.
 *  • Arena & Platform: background.jpg arena with black silhouette land platform.
 *  • Interactive Belt UI: Clickable bottom word tiles & keyboard support.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const BELT_SIZE = 6;
const LETTER_POOL = ['K', 'S', 'T', 'A', 'M', 'R', 'P', 'X', 'Z', 'V', 'N', 'B', 'W', 'D'];

// ─── MATH UTILS ───────────────────────────────────────────────────────────────

const L = (a, b, t) => a + (b - a) * t;                           // lerp
const C = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;            // clamp
const R = (lo, hi) => lo + Math.random() * (hi - lo);            // rand
const RI = (lo, hi) => Math.floor(R(lo, hi + 1));                 // rand int

const easeOutQuad = t => t * (2 - t);
const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function vLerp(a, b, t) { return { x: L(a.x, b.x, t), y: L(a.y, b.y, t) }; }

function createPingPongVideo(src) {
  const vid = document.createElement('video');
  vid.src = src;
  vid.autoplay = true;
  vid.muted = true;
  vid.setAttribute('playsinline', '');

  let isReversing = false;

  const playForward = () => {
    isReversing = false;
    vid.playbackRate = 1;
    vid.play().catch(() => { });
  };

  const playReverse = () => {
    isReversing = true;
    try {
      vid.playbackRate = -1;
      vid.play().catch(() => { });
    } catch (e) {
      // Fallback if browser doesn't support negative playbackRate
      vid.currentTime = 0;
      playForward();
    }
  };

  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    if (!isReversing && vid.currentTime >= vid.duration - 0.05) {
      playReverse();
    } else if (isReversing && vid.currentTime <= 0.05) {
      playForward();
    }
  });

  vid.addEventListener('ended', () => {
    playReverse();
  });

  vid.play().catch(e => console.log('Video play error:', e));
  return vid;
}

const ASSETS = { hatCache: {}, effectCache: {} };

function getOutfitHat(id) {
  if (!id || id === 'none') return null;
  if (ASSETS.hatCache[id]) return ASSETS.hatCache[id];
  const img = new Image();
  if (id === 'outfit_mage') img.src = 'assets/mage_hat.png';
  else if (id === 'outfit_samurai') img.src = 'assets/samurai_hat.png';
  else if (id === 'outfit_pirate') img.src = 'assets/pirate_hat.png';
  else if (id === 'outfit_headband') img.src = 'assets/headband.PNG';
  else if (id === 'outfit_handband_ninja') img.src = 'assets/ninja_armband.PNG';
  else if (id === 'outfit_handband_mage') img.src = 'assets/handband_mage.png';
  else if (id === 'outfit_handband_warrior') img.src = 'assets/handband_warrior.png';
  else if (id === 'outfit_handband_shadow') img.src = 'assets/handband_shadow.png';
  ASSETS.hatCache[id] = img;
  return img;
}

function getEffectImg(id) {
  if (!id || id === 'none') return null;
  if (ASSETS.effectCache[id]) return ASSETS.effectCache[id];
  if (id === 'effect_watcher_eye') {
    const cornea = new Image(); cornea.src = 'assets/cornea.png';
    const pupil = new Image(); pupil.src = 'assets/pupil.png';
    const obj = { cornea, pupil, complete: false };
    cornea.onload = () => { if (pupil.complete) obj.complete = true; };
    pupil.onload = () => { if (cornea.complete) obj.complete = true; };
    ASSETS.effectCache[id] = obj;
    return obj;
  }

  const img = new Image();
  if (id === 'effect_dragon') img.src = 'assets/dragon_aura.png';
  ASSETS.effectCache[id] = img;
  return img;
}

// ─── MAGE POSES SYSTEM ────────────────────────────────────────────────────────

const POSES = {
  // ── Clean Upright Standing Rest Position (Arms down) ──
  IdleStance: {
    root: { x: 0, y: 0 },
    head: { x: 0, y: -180 }, neck: { x: 0, y: -160 }, shoulder: { x: 0, y: -145 },
    elbowR: { x: 15, y: -100 }, wristR: { x: 20, y: -50 },
    elbowL: { x: -15, y: -100 }, wristL: { x: -20, y: -50 },
    hipR: { x: 8, y: -80 }, kneeR: { x: 10, y: -40 }, footR: { x: 12, y: 0 },
    hipL: { x: -8, y: -80 }, kneeL: { x: -10, y: -40 }, footL: { x: -12, y: 0 }
  },

  // ── Fight Stance (Fists up, ready) ──
  FightStance: {
    root: { x: 0, y: 15 },
    head: { x: 15, y: -160 }, neck: { x: 5, y: -140 }, shoulder: { x: 0, y: -130 },
    elbowR: { x: 25, y: -100 }, wristR: { x: 65, y: -120 }, // Front arm ready to strike
    elbowL: { x: -25, y: -100 }, wristL: { x: -15, y: -130 }, // Back arm guarding face
    hipR: { x: 15, y: -65 }, kneeR: { x: 25, y: -30 }, footR: { x: 20, y: 15 }, // Wide stance front
    hipL: { x: -15, y: -65 }, kneeL: { x: -25, y: -30 }, footL: { x: -20, y: 15 } // Wide stance back
  },

  // ── Right Hand Letter Throw (Snappy whip forward) ──
  RightHandCast_Windup: {
    root: { x: -5, y: 0 },
    head: { x: -5, y: -180 }, neck: { x: -5, y: -160 }, shoulder: { x: -5, y: -145 },
    elbowR: { x: -10, y: -110 }, wristR: { x: -25, y: -150 }, // Arm pulled back!
    elbowL: { x: -15, y: -100 }, wristL: { x: -20, y: -50 },
    hipR: { x: 8, y: -80 }, kneeR: { x: 10, y: -40 }, footR: { x: 12, y: 0 },
    hipL: { x: -8, y: -80 }, kneeL: { x: -10, y: -40 }, footL: { x: -12, y: 0 }
  },
  RightHandCast_Strike: {
    root: { x: 15, y: 0 },
    head: { x: 25, y: -170 }, neck: { x: 20, y: -155 }, shoulder: { x: 15, y: -145 },
    elbowR: { x: 65, y: -130 }, wristR: { x: 115, y: -130 }, // Thrust arm straight forward, extended
    elbowL: { x: -25, y: -110 }, wristL: { x: -40, y: -70 }, // Pull back other arm for momentum
    hipR: { x: 20, y: -80 }, kneeR: { x: 25, y: -40 }, footR: { x: 30, y: 0 },
    hipL: { x: -15, y: -80 }, kneeL: { x: -20, y: -40 }, footL: { x: -25, y: 0 }
  },

  // ── Left Hand Letter Throw (Snappy whip forward) ──
  LeftHandCast_Windup: {
    root: { x: -5, y: 0 },
    head: { x: -5, y: -180 }, neck: { x: -5, y: -160 }, shoulder: { x: -5, y: -145 },
    elbowR: { x: 15, y: -100 }, wristR: { x: 20, y: -50 },
    elbowL: { x: -10, y: -110 }, wristL: { x: -25, y: -150 }, // Arm pulled back!
    hipR: { x: 8, y: -80 }, kneeR: { x: 10, y: -40 }, footR: { x: 12, y: 0 },
    hipL: { x: -8, y: -80 }, kneeL: { x: -10, y: -40 }, footL: { x: -12, y: 0 }
  },
  LeftHandCast_Strike: {
    root: { x: 15, y: 0 },
    head: { x: 25, y: -170 }, neck: { x: 20, y: -155 }, shoulder: { x: 15, y: -145 },
    elbowR: { x: -25, y: -110 }, wristR: { x: -40, y: -70 }, // Pull back other arm for momentum
    elbowL: { x: 65, y: -130 }, wristL: { x: 115, y: -130 }, // Thrust arm straight forward, extended
    hipR: { x: 20, y: -80 }, kneeR: { x: 25, y: -40 }, footR: { x: 30, y: 0 },
    hipL: { x: -15, y: -80 }, kneeL: { x: -20, y: -40 }, footL: { x: -25, y: 0 }
  },

  // ── Defensive & Reaction Poses ──
  DashRetreat: {
    root: { x: -20, y: 0 },
    head: { x: -10, y: -176 }, neck: { x: -8, y: -156 }, shoulder: { x: -5, y: -142 },
    elbowR: { x: 15, y: -120 }, wristR: { x: 28, y: -130 },
    elbowL: { x: -25, y: -120 }, wristL: { x: -38, y: -130 },
    hipR: { x: 8, y: -78 }, kneeR: { x: 10, y: -39 }, footR: { x: 12, y: 0 },
    hipL: { x: -16, y: -78 }, kneeL: { x: -18, y: -39 }, footL: { x: -20, y: 0 }
  },
  Collapse: {
    root: { x: -30, y: 0 },
    head: { x: -90, y: -16 }, neck: { x: -74, y: -14 }, shoulder: { x: -56, y: -12 },
    elbowR: { x: -20, y: -8 }, wristR: { x: 8, y: -4 },
    elbowL: { x: -40, y: -8 }, wristL: { x: -20, y: -4 },
    hipR: { x: 15, y: -10 }, kneeR: { x: 45, y: -10 }, footR: { x: 75, y: 0 },
    hipL: { x: 8, y: -6 }, kneeL: { x: 32, y: -6 }, footL: { x: 60, y: 0 }
  }
};

// ─── WORD PROJECTILE CLASS ───────────────────────────────────────────────────

class WordProjectile {
  constructor(startX, startY, targetX, targetY, word, color, owner, onHit, id) {
    this.id = id;
    this.startX = startX;
    this.startY = startY;
    this.x = startX;
    this.y = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.word = word;
    this.color = color;
    this.owner = owner;
    this.onHit = onHit;
    this.outfit = null;
    this.outfitImg = null;
    this.effect = null;
    this.effectImg = null; // Travel speed (~0.35s flight time)
    this.progress = 0;
    this.speed = 2.6;
    this.dead = false;
    this.trail = [];
  }

  update(dt) {
    if (this.dead) return;
    this.progress += dt * this.speed;

    if (this.progress >= 1) {
      this.progress = 1;
      this.x = this.targetX;
      this.y = this.targetY;
      this.dead = true;
      if (this.onHit) this.onHit(this.x, this.y);
      return;
    }

    // Straight path
    this.x = L(this.startX, this.targetX, this.progress);
    this.y = L(this.startY, this.targetY, this.progress);

    // Trail particles
    this.trail.unshift({ x: this.x, y: this.y, life: 1.0 });
    if (this.trail.length > 15) this.trail.pop();
    this.trail.forEach(t => t.life -= dt * 3.0);
  }

  draw(ctx) {
    if (this.dead) return;

    // Draw glowing trail
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      if (t.life <= 0) continue;
      ctx.globalAlpha = t.life * 0.65;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 10 * t.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Render word text glowing brightly as the projectile
    ctx.save();
    ctx.translate(this.x, this.y);

    // Add dynamic spinning physics for the letter!
    ctx.rotate(this.progress * Math.PI * 8 * (this.owner === 'p1' ? 1 : -1));

    ctx.shadowColor = this.color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw text with outline for better readability
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.strokeText(this.word, 0, 0);
    ctx.fillText(this.word, 0, 0);

    ctx.restore();
  }
}

// ─── VFX PARTICLES ────────────────────────────────────────────────────────────

class Spark {
  constructor(x, y, color) {
    const a = R(0, Math.PI * 2), s = R(4, 16);
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s - R(1, 4);
    this.life = 1; this.decay = R(.04, .09);
    this.size = R(2, 6);
    this.color = color || '#00d4ff';
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += .3; this.vx *= .92; this.life -= this.decay; }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = C(this.life, 0, 1);
    ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  get dead() { return this.life <= 0; }
}

class ShockwaveRing {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.r = 8; this.life = 1; this.decay = 0.05;
    this.color = color || '#00d4ff';
  }
  update() { this.r += 16; this.life -= this.decay; }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = C(this.life * 0.7, 0, 1);
    ctx.strokeStyle = this.color; ctx.lineWidth = 4 * this.life;
    ctx.shadowColor = this.color; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  get dead() { return this.life <= 0; }
}

class FogParticle {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.life = 1; this.decay = Math.random() * 0.02 + 0.01;
    this.r = Math.random() * 15 + 10;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = -Math.random() * 1.5 - 0.5;
    this.isBlue = Math.random() > 0.5;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.life -= this.decay;
    this.r += 0.2;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life * 0.4);
    ctx.fillStyle = '#0f172a';
    ctx.shadowColor = '#1e3a8a';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  get dead() { return this.life <= 0; }
}

// ─── STICKMAN MAGE ─────────────────────────────────────────────────────────────

class Stickman {
  /**
   * @param {number} rootX
   * @param {number} groundY
   * @param {1|-1}   facing
   * @param {string} bodyColor - default black '#000000'
   * @param {string} mageGlow  - hand light VFX colour (e.g. #00d4ff or #ff3355)
   * @param {HTMLImageElement} vfxImage
   * @param {HTMLImageElement} eyeImage - Ninja eye image
   */
  constructor(rootX, groundY, facing, bodyColor = '#000000', mageGlow = '#00d4ff', vfxImage = null, eyeImage = null) {
    this.rootX = rootX;
    this.groundY = groundY;
    this.facing = facing;
    this.color = bodyColor;
    this.accent = mageGlow;
    this.vfxImage = vfxImage;
    this.eyeImage = eyeImage;

    this.J = this._copy(POSES.IdleStance);

    this._name = 'IdleStance';
    this._src = this._copy(POSES.IdleStance);
    this._dst = POSES.IdleStance;
    this._t = 1;
    this._spd = 5;

    this._breathT = Math.random() * Math.PI * 2;
    this.particles = [];
    this._shakePow = 0;
    this._shake = { x: 0, y: 0 };
    this._flashTimer = 0;
    this.health = 100;
    this._attacking = false;

    // Enemy tracking coords for dynamic effects (like Watcher Eye)
    this.enemyX = null;
    this.enemyY = null;

    // Alternating Hand State: 'RIGHT' -> 'LEFT' -> 'RIGHT'
    this.activeHand = 'RIGHT';
  }

  _copy(src) {
    const o = {};
    for (const k in src) o[k] = { x: src[k].x, y: src[k].y };
    return o;
  }

  _go(poseName, speed) {
    this._src = this._copy(this.J);
    this._dst = POSES[poseName];
    this._name = poseName;
    this._spd = speed;
    this._t = 0;
  }

  /**
   * Cast spell alternating hands!
   * @param {Function} onStrike Callback when the hand actually strikes forward
   */
  attack(onStrike) {
    if (this.health <= 0) return;

    const useRight = (this.activeHand === 'RIGHT');
    const windupPose = useRight ? 'RightHandCast_Windup' : 'LeftHandCast_Windup';
    const strikePose = useRight ? 'RightHandCast_Strike' : 'LeftHandCast_Strike';

    this._attacking = true;

    // Toggle hand state for NEXT click
    this.activeHand = useRight ? 'LEFT' : 'RIGHT';

    // Phase 1: Windup (Smoothly switch hands to prepare)
    // Slower speed for more frames and visible smooth transition
    this._go(windupPose, 5);

    // Phase 2: Forward Spell Thrust
    setTimeout(() => {
      if (this.health <= 0) return;
      this._go(strikePose, 60);
      this._shakePow = 0.65; // harder camera shake

      // Calculate the extended hand position to spawn projectile from
      const jointName = useRight ? 'wristR' : 'wristL';
      const targetJoint = POSES[strikePose][jointName];
      const targetRoot = POSES[strikePose].root;
      const wp = {
        x: this.rootX + (targetRoot.x + targetJoint.x) * this.facing + this._shake.x,
        y: this.groundY + targetRoot.y + targetJoint.y + this._shake.y
      };

      for (let i = 0; i < 8; i++) {
        this.particles.push(new Spark(wp.x, wp.y, this.accent));
      }
      this.particles.push(new ShockwaveRing(wp.x, wp.y, '#ffffff'));

      if (onStrike) onStrike({ hand: useRight ? 'RIGHT' : 'LEFT', handPos: wp });

      // Phase 3: Recovery back to Idle (Slightly slower, for physical weight)
      setTimeout(() => {
        if (this.health <= 0) return;
        this._attacking = false;
        this._go('IdleStance', 15);
      }, 140);
    }, 240); // 240ms duration (added more frames) to let the player clearly SEE the hand switch
  }

  recoil() {
    if (this.health <= 0) return;
    this._shakePow = 0.25;
    this._go('DashRetreat', 18);
    setTimeout(() => { if (this.health > 0) this._go('IdleStance', 5); }, 220);
  }

  takeHit() {
    if (this.health <= 0) return;
    this._flashTimer = 0.25;
    this._shakePow = 0.6;
    this._attacking = false;

    this._go('DashRetreat', 18);
    const pos = this._worldJ('neck');
    for (let i = 0; i < 18; i++) this.particles.push(new Spark(pos.x, pos.y, this.accent));
    this.particles.push(new ShockwaveRing(pos.x, pos.y, this.accent));

    setTimeout(() => { if (this.health > 0) this._go('IdleStance', 5); }, 340);
  }

  die() {
    if (this.health <= 0) return;
    this.health = 0;
    this._attacking = false;
    this._shakePow = 1.0;
    this._flashTimer = 0.5;
    this._go('Collapse', 6);

    const pos = this._worldJ('neck');
    for (let i = 0; i < 30; i++) this.particles.push(new Spark(pos.x, pos.y, this.accent));
    for (let i = 0; i < 3; i++) this.particles.push(new ShockwaveRing(pos.x, pos.y, this.accent));
  }

  update(dt) {
    this._breathT += dt * 1.5;

    if (this._t < 1) {
      this._t = C(this._t + dt * this._spd, 0, 1);
      const easeProgress = easeOutCubic(this._t);
      for (const k in this._dst) {
        if (this._src[k] && this._dst[k]) {
          this.J[k] = vLerp(this._src[k], this._dst[k], easeProgress);
        }
      }
    }

    // Anchor feet
    const rootY = this.J.root.y;
    if (this.J.footR && this.J.footR.y > -rootY) this.J.footR.y = -rootY;
    if (this.J.footL && this.J.footL.y > -rootY) this.J.footL.y = -rootY;

    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);

    if (this._shakePow > 0) {
      this._shakePow = Math.max(0, this._shakePow - dt * 9);
      const m = this._shakePow * 12;
      this._shake.x = R(-m, m); this._shake.y = R(-m, m);
    } else { this._shake.x = 0; this._shake.y = 0; }

    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  draw(ctx) {
    const r = this.J.root;
    const rx = this.rootX + r.x * this.facing + this._shake.x;
    const ry = this.groundY + r.y + this._shake.y;

    // Floor shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.ellipse(rx, this.groundY, 36, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(this.facing, 1);

    // Particles
    this.particles.forEach(p => {
      ctx.save();
      ctx.scale(this.facing, 1);
      ctx.translate(-rx, -ry);
      p.draw(ctx);
      ctx.restore();
    });

    // Render Stickman Mage Body
    this.drawMageCharacter(ctx);

    ctx.restore();
  }

  _worldJ(name) {
    const j = this.J[name];
    const r = this.J.root;
    return {
      x: this.rootX + (r.x + j.x) * this.facing + this._shake.x,
      y: this.groundY + r.y + j.y + this._shake.y,
    };
  }

  /**
   * Draw Stickman Mage: Solid BLACK body + glowing Mage Hand Light VFX on wrists.
   */
  drawMageCharacter(ctx) {
    const J = this.J;
    const fl = this._flashTimer > 0;
    // Stickman body is DEFAULT BLACK
    const bodyColor = fl ? '#ffffff' : '#000000';
    const mageLight = this.accent;

    const bob = this._name === 'IdleStance' ? Math.sin(this._breathT) * 1.5 : 0;

    const headY = J.head.y + bob;
    const neckY = J.neck.y + bob;
    const shoulderY = J.shoulder.y + bob;
    const elbowRy = J.elbowR.y + bob;
    const wristRy = J.wristR.y + bob;
    const elbowLy = J.elbowL.y + bob;
    const wristLy = J.wristL.y + bob;

    const hc = {
      x: (J.hipR.x + J.hipL.x) / 2,
      y: (J.hipR.y + J.hipL.y) / 2
    };

    ctx.save();

    // ── DRAGON AURA EFFECT ──────────────────────────────────────────────────
    if (this.effect === 'effect_dragon' && this.effectImg && this.effectImg.complete) {
      ctx.save();
      ctx.translate(hc.x, hc.y - 40);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.2;
      ctx.scale(this.facing, 1);
      ctx.drawImage(this.effectImg, -80, -100, 160, 160);
      ctx.restore();
    }

    // ── SHADOW FOG EFFECT ───────────────────────────────────────────────────
    if (this.effect === 'effect_shadow') {
      if (Math.random() < 0.25) {
        // Find world coordinates for particles
        const r = J.root;
        const rx = this.rootX + r.x * this.facing;
        const ry = this.groundY + r.y;

        this.particles.push(new FogParticle(
          rx + (Math.random() - 0.5) * 40,
          ry + J.footR.y - Math.random() * 80
        ));
      }
    }

    // ── WATCHER EYE EFFECT ──────────────────────────────────────────────────
    if (this.effect === 'effect_watcher_eye' && this.effectImg && this.effectImg.complete) {
      ctx.save();
      
      const worldEyeX = this.rootX + (J.root.x + J.head.x) * this.facing;
      const worldEyeY = this.groundY + J.root.y + headY - 100;
      
      const time = performance.now();
      const blinkCycle = time % 4000;
      let blinkScale = 1;
      if (blinkCycle < 200) {
        blinkScale = Math.max(0.1, 1 - Math.sin((blinkCycle / 200) * Math.PI));
      }

      ctx.translate(J.head.x, headY - 100);
      ctx.scale(1, blinkScale);

      // Draw the generated Cornea image base (made slightly larger)
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.effectImg.cornea, -50, -50, 100, 100);

      const targetX = this.enemyX !== null ? this.enemyX : this.rootX + (200 * this.facing);
      const targetY = this.enemyY !== null ? this.enemyY : this.groundY - 120;

      const dx = targetX - worldEyeX;
      const dy = targetY - worldEyeY;
      const angle = Math.atan2(dy, dx);

      // The pupil moves within a small radius inside the cornea
      const pupilRadius = 6;
      const px = Math.cos(angle) * pupilRadius;
      const py = Math.sin(angle) * pupilRadius;

      ctx.translate(px * this.facing, py);
      
      // Pupil rotation
      const pupilRotation = (time / 1000) * 0.5;
      ctx.rotate(pupilRotation);

      // Draw the Pupil Image (made slightly larger)
      ctx.drawImage(this.effectImg.pupil, -33, -33, 66, 66);

      ctx.restore();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = bodyColor;
    ctx.shadowBlur = 0; // Removed outline lights

    // Single seamless path for stickman body
    ctx.beginPath();
    ctx.moveTo(hc.x, hc.y);
    ctx.lineTo(J.neck.x, neckY);

    ctx.moveTo(J.shoulder.x, shoulderY);
    ctx.lineTo(J.elbowR.x, elbowRy);
    ctx.lineTo(J.wristR.x, wristRy);

    ctx.moveTo(J.shoulder.x, shoulderY);
    ctx.lineTo(J.elbowL.x, elbowLy);
    ctx.lineTo(J.wristL.x, wristLy);

    ctx.moveTo(hc.x, hc.y);
    ctx.lineTo(J.kneeR.x, J.kneeR.y);
    ctx.lineTo(J.footR.x, J.footR.y);

    ctx.moveTo(hc.x, hc.y);
    ctx.lineTo(J.kneeL.x, J.kneeL.y);
    ctx.lineTo(J.footL.x, J.footL.y);

    ctx.stroke();


    // Solid Black Head
    ctx.beginPath();
    ctx.arc(J.head.x, headY, 19, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();

    // Ninja Eye Image (Without Pupil)
    if (this.eyeImage && this.eyeImage.complete && this.eyeImage.naturalWidth > 0) {
      ctx.save();
      // Move slightly further away from the face outline (closer to center)
      ctx.translate(J.head.x + 1, headY - 1);

      // Use screen composite so the black background of the generated image becomes fully transparent
      ctx.globalCompositeOperation = 'screen';

      // Ninja eyes should face forward depending on stickman scale facing
      // Reduced size slightly while maintaining aspect ratio (~22x30)
      ctx.drawImage(this.eyeImage, -11, -15, 22, 30);
      ctx.restore();
    }

    // ── OUTFITS (HATS) ───────────────────────────────────────────────────────
    if (this.outfitImg && this.outfitImg.complete && this.outfitImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(J.head.x, headY);

      // Flash hat pure white when hit
      if (fl) ctx.filter = "brightness(0) invert(1)";

      // Calculate rotation based on neck to head vector
      const dx = J.head.x - J.neck.x;
      const dy = headY - neckY;
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      ctx.rotate(angle);

      if (this.outfit === 'outfit_mage') {
        ctx.drawImage(this.outfitImg, -60, -78, 100, 90);
      } else if (this.outfit === 'outfit_samurai') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(this.outfitImg, -35, -25, 70, 32);
        ctx.restore();
      } else if (this.outfit === 'outfit_pirate') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(this.outfitImg, -35, -30, 70, 42);
        ctx.restore();
      } else if (this.outfit === 'outfit_headband') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(this.outfitImg, -44, -50, 100, 60);
        ctx.restore();
      }
      ctx.restore();
    }

    // ── ARMBANDS (BOTH WRISTS) ───────────────────────────────────────────────
    if (this.armbandImg && this.armbandImg.complete && this.armbandImg.naturalWidth > 0) {
      // Draw on Right Wrist (Front)
      ctx.save();
      ctx.translate(J.wristR.x, wristRy);
      let armAngleR = Math.atan2(wristRy - elbowRy, J.wristR.x - J.elbowR.x);
      ctx.rotate(armAngleR);
      ctx.globalCompositeOperation = 'source-over';

      // Flash armband pure white when hit
      if (fl) ctx.filter = "brightness(0) invert(1)";

      if (this.armband === 'outfit_handband_ninja') {
        ctx.rotate(-45 * Math.PI / 180);
        ctx.drawImage(this.armbandImg, -40, -40, 55, 55);
      } else if (this.armband) {
        ctx.rotate(-45 * Math.PI / 180);
        ctx.drawImage(this.armbandImg, -40, -40, 55, 55);
      }
      ctx.restore();

      // Draw on Left Wrist (Back)
      ctx.save();
      ctx.translate(J.wristL.x, wristLy);
      let armAngleL = Math.atan2(wristLy - elbowLy, J.wristL.x - J.elbowL.x);
      ctx.rotate(armAngleL);
      ctx.globalCompositeOperation = 'source-over';

      // Flash armband pure white when hit
      if (fl) ctx.filter = "brightness(0) invert(1)";

      if (this.armband === 'outfit_handband_ninja') {
        ctx.rotate(-45 * Math.PI / 180);
        ctx.drawImage(this.armbandImg, -40, -40, 55, 55);
      } else if (this.armband) {
        ctx.rotate(-45 * Math.PI / 180);
        ctx.drawImage(this.armbandImg, -40, -40, 55, 55);
      }
      ctx.restore();
    }



    // ── MAGE HAND LIGHT VFX ─────────────────────────────────────────────────
    // Pulsing glowing elemental light on both right and left hands/wrists!
    this._drawHandLight(ctx, J.wristR.x, wristRy, mageLight);
    this._drawHandLight(ctx, J.wristL.x, wristLy, mageLight);

    ctx.restore();
  }

  _drawHandLight(ctx, x, y, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    const g = ctx.createRadialGradient(x, y, 1, x, y, 8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw the generated magic hand VFX video if loaded (smaller)
    const w = this.vfxImage.naturalWidth || this.vfxImage.videoWidth;
    const h = this.vfxImage.naturalHeight || this.vfxImage.videoHeight;

    if (this.vfxImage && (this.vfxImage.complete || this.vfxImage.readyState >= 2) && w > 0 && h > 0) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.95;

      const aspect = w / h;
      const baseSize = 40;
      let drawW = baseSize;
      let drawH = baseSize;

      if (aspect > 1) {
        drawH = baseSize / aspect; // Adjust height to fix vertical stretching
      } else {
        drawW = baseSize * aspect;
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Date.now() / 150); // fast magical rotation
      ctx.drawImage(this.vfxImage, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    ctx.restore();
  }
}

// ─── LETTER CONVEYOR BELT ─────────────────────────────────────────────────────

const LEFT_HAND = ['A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', 'T', 'V', 'C', 'X', 'Z'];
const RIGHT_HAND = ['Y', 'U', 'I', 'O', 'P', 'H', 'J', 'K', 'L', 'N', 'M'];

class LetterBelt {
  /**
   * Manages the 6-tile DOM conveyor belt in <div id="letter-belt">.
   * Enables clicking directly on bottom word tiles as well as keyboard typing.
   */
  constructor(onCorrect, onWrong) {
    this._belt = document.getElementById('letter-belt');
    this._queue = [];
    this._active = false;
    this._onCB = onCorrect;
    this._offCB = onWrong;
    this._handler = this._onKey.bind(this);
    this._nextHand = 'LEFT';
  }

  start() {
    this._queue = [];
    this._belt.innerHTML = '';
    for (let i = 0; i < BELT_SIZE; i++) this._push();
    this._refreshTiles();
    this._active = true;
    window.addEventListener('keydown', this._handler);
  }

  stop() {
    this._active = false;
    window.removeEventListener('keydown', this._handler);
  }

  _randLetter() {
    let pool = this._nextHand === 'LEFT' ? LEFT_HAND : RIGHT_HAND;
    this._nextHand = this._nextHand === 'LEFT' ? 'RIGHT' : 'LEFT';
    return pool[RI(0, pool.length - 1)];
  }

  _push() {
    const letter = this._randLetter();
    this._queue.push(letter);

    const tile = document.createElement('div');
    tile.className = 'letter-tile entering';
    tile.textContent = letter;
    tile.style.userSelect = 'none';

    // Spell casting is strictly Keyboard Only — mouse click disabled
    this._belt.appendChild(tile);
    setTimeout(() => tile.classList.remove('entering'), 140);
  }

  _shift() {
    this._queue.shift();
    const first = this._belt.firstChild;
    if (first) this._belt.removeChild(first);
  }

  _refreshTiles() {
    const tiles = this._belt.children;
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove('active-target', 'correct-flash', 'wrong-flash');
      if (i === 0) tiles[i].classList.add('active-target');
    }
  }

  _handleInput(pressedLetter, tileElement) {
    if (!this._active || this._queue.length === 0) return;

    const pressed = pressedLetter.toUpperCase();
    const expected = this._queue[0];
    const activeTile = tileElement || this._belt.firstChild;

    if (pressed === expected) {
      if (activeTile) activeTile.classList.add('correct-flash');
      this._shift();
      this._push();
      this._refreshTiles();
      this._onCB(expected);
    } else {
      if (activeTile) {
        activeTile.classList.add('wrong-flash');
        setTimeout(() => activeTile.classList.remove('wrong-flash'), 180);
      }
      this._offCB(expected, pressed);
    }
  }

  _onKey(e) {
    if (!this._active || this._queue.length === 0) return;
    if (e.key.length !== 1) return;
    this._handleInput(e.key, this._belt.firstChild);
  }
}

// ─── DUAL COMBAT SCENE (MAGE ARENA) ───────────────────────────────────────────

class DualCombatScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this._raf = null;
    this._last = 0;

    const W = canvas.width;
    const H = canvas.height;

    // GROUND_Y baseline
    this.GROUND_Y = H * 0.76;

    // Load a random background image for the arena
    const backgrounds = ['assets/background.jpg', 'assets/background2.jpg'];
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    this.bgImage = new Image();
    this.bgImage.src = randomBg;

    // Load VFX video with ping-pong loop
    this.handVfxImage = createPingPongVideo('assets/hand-vfx.webm');

    // Load Ninja Eye image
    this.ninjaEyeImage = new Image();
    this.ninjaEyeImage.src = 'assets/ninja_eye.png';

    // Player 1 — Left Mage (Cyan/Blue Hand Light)
    this.p1 = new Stickman(W * 0.30, this.GROUND_Y, 1, '#000000', '#00d4ff', this.handVfxImage, this.ninjaEyeImage);
    // Player 2 — Right Mage (Crimson/Red Hand Light)
    this.p2 = new Stickman(W * 0.70, this.GROUND_Y, -1, '#000000', '#ff3355', this.handVfxImage, this.ninjaEyeImage);

    this.projectiles = [];

    // Interactive Letter Belt
    this._belt = new LetterBelt(
      (letter) => this._onCorrect(letter),
      (exp, got) => this._onWrong(exp, got)
    );

    this.stats = { hits: 0, misses: 0, lastMove: '—' };
    this._localEnemyHp = 100;
    this.hitStop = 0; // Added for hit freeze frame effect
  }

  setConfig(p1Outfit, p1Effect, p1Armband, p2Outfit, p2Effect, p2Armband) {
    this.p1.outfit = p1Outfit;
    this.p1.effect = p1Effect;
    this.p1.armband = p1Armband;
    this.p1.outfitImg = getOutfitHat(p1Outfit);
    this.p1.effectImg = getEffectImg(p1Effect);
    this.p1.armbandImg = getOutfitHat(p1Armband);

    this.p2.outfit = p2Outfit;
    this.p2.effect = p2Effect;
    this.p2.armband = p2Armband;
    this.p2.outfitImg = getOutfitHat(p2Outfit);
    this.p2.effectImg = getEffectImg(p2Effect);
    this.p2.armbandImg = getOutfitHat(p2Armband);
  }

  start() {
    this.running = true;
    this._last = performance.now();
    this.projectiles = [];
    this._belt.start();
    requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this.running = false;
    this._belt.stop();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _onCorrect(letter) {
    this.stats.hits++;
    this.stats.lastMove = `SPELL: ${letter}`;

    const spellId = 'spell_' + Math.random().toString(36).substring(2);

    // Cast spell with alternating hand, spawn projectile exactly on strike
    this.p1.attack((castInfo) => {
      const handPos = castInfo.handPos;
      const targetPos = this.p2._worldJ('neck');

      // Spawn flying Word Projectile ("K", "S", "T", etc.)
      const proj = new WordProjectile(
        handPos.x, handPos.y,
        targetPos.x, targetPos.y,
        letter,
        '#00d4ff',
        'p1', // owner
        (hitX, hitY) => {
          this.hitStop = 0.08;
          this.p2.takeHit();
        },
        spellId
      );
      this.projectiles.push(proj);
    });

    if (typeof onLetterCorrect === 'function') onLetterCorrect(letter, spellId);
  }

  _onWrong(expected, got) {
    this.stats.misses++;
    this.p1.recoil();
    if (typeof onLetterWrong === 'function') onLetterWrong();
  }

  triggerLocalAttack(wpm, wordLen, letter) {
    this.p1.attack((castInfo) => {
      const proj = new WordProjectile(
        castInfo.handPos.x, castInfo.handPos.y,
        this.p2._worldJ('neck').x, this.p2._worldJ('neck').y,
        letter || 'SPELL', '#00d4ff',
        'p1',
        () => this.p2.takeHit()
      );
      this.projectiles.push(proj);
    });
  }

  triggerEnemyAttack(letter, spellId) {
    const spellText = letter || 'SPELL';
    this.p2.attack((castInfo) => {
      const proj = new WordProjectile(
        castInfo.handPos.x, castInfo.handPos.y,
        this.p1._worldJ('neck').x, this.p1._worldJ('neck').y,
        spellText, '#ff3355',
        'p2',
        () => this.p1.takeHit(),
        spellId
      );
      this.projectiles.push(proj);
    });
  }

  updateHealthBars(myPct, enemyPct) {
    const m = document.getElementById('my-health');
    const e = document.getElementById('enemy-health');
    if (m) m.style.width = `${Math.max(0, myPct)}%`;
    if (e) e.style.width = `${Math.max(0, enemyPct)}%`;

    if (myPct <= 0 && this.p1.health > 0) this.p1.die();
    if (enemyPct <= 0 && this.p2.health > 0) this.p2.die();

    this.p1.health = myPct;
    this.p2.health = enemyPct;
  }

  _loop(now) {
    if (!this.running) return;
    let dt = C((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    // Apply Hitstop Effect (pauses world updates briefly)
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      if (this.hitStop > 0) dt = 0;
    }

    this.p1.update(dt);
    this.p2.update(dt);

    // Update enemy tracking coordinates for dynamic effects!
    this.p1.enemyX = this.p2._worldJ('head').x;
    this.p1.enemyY = this.p2._worldJ('head').y;
    this.p2.enemyX = this.p1._worldJ('head').x;
    this.p2.enemyY = this.p1._worldJ('head').y;

    // Collision detection between projectiles
    for (let i = 0; i < this.projectiles.length; i++) {
      let pA = this.projectiles[i];
      if (pA.dead) continue;
      for (let j = i + 1; j < this.projectiles.length; j++) {
        let pB = this.projectiles[j];
        if (pB.dead) continue;
        if (pA.owner !== pB.owner) {
          let dx = pA.x - pB.x;
          let dy = pA.y - pB.y;
          // Collision distance: ~40px radius (1600 squared)
          if (dx * dx + dy * dy < 2500) {
            pA.dead = true;
            pB.dead = true;
            let mx = (pA.x + pB.x) / 2;
            let my = (pA.y + pB.y) / 2;
            // Explosion VFX at point of collision
            for (let k = 0; k < 20; k++) this.p1.particles.push(new Spark(mx, my, '#ffffff'));
            this.p1.particles.push(new ShockwaveRing(mx, my, pA.color));
            this.p1.particles.push(new ShockwaveRing(mx, my, pB.color));
            this._shakePow = 0.4;

            if (typeof window.onSpellClash === 'function') window.onSpellClash(pA.id, pB.id);
          }
        }
      }
    }

    // Update projectiles
    this.projectiles.forEach(p => p.update(dt));
    this.projectiles = this.projectiles.filter(p => !p.dead);

    this._draw();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _draw() {
    const { ctx, canvas, GROUND_Y } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── 1. Background Arena Image (assets/background.jpg) ───────────────────
    if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      ctx.drawImage(this.bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);
    }

    // Dark moody overlay vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, W * .7);
    vig.addColorStop(0, 'rgba(0,0,0,0.1)');
    vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ── 2. Silhouette Black Land Platform ──────────────────────────────────
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // Platform edge glowing magic rim
    ctx.save();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.restore();

    // ── 3. Stickman Mages ──────────────────────────────────────────────────
    this.p2.draw(ctx);
    this.p1.draw(ctx);

    // ── 4. Word Projectiles ────────────────────────────────────────────────
    this.projectiles.forEach(p => p.draw(ctx));
  }
}

// ─── COMBAT ENGINE WRAPPER ────────────────────────────────────────────────────

class CombatEngine {
  constructor(canvas) {
    this._scene = new DualCombatScene(canvas);
  }
  start() { this._scene.start(); }
  stop() { this._scene.stop(); }
  get stats() { return this._scene.stats; }
  triggerLocalAttack(wpm, wl) { this._scene.triggerLocalAttack(wpm, wl); }
  triggerEnemyAttack() { this._scene.triggerEnemyAttack(); }
  updateHealthBars(my, en) { this._scene.updateHealthBars(my, en); }
}

// ─── LOBBY STICKMAN SCENE ──────────────────────────────────────────────────
class LobbyStickmanScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this._raf = null;
    this._last = 0;

    this.handVfxImage = createPingPongVideo('assets/hand-vfx.webm');

    this.ninjaEyeImage = new Image();
    this.ninjaEyeImage.src = 'assets/ninja_eye.png';

    // Place stickman in center of the large canvas
    this.stickman = new Stickman(this.canvas.width / 2, this.canvas.height - 40, 1, '#000000', '#00d4ff', this.handVfxImage, this.ninjaEyeImage);

    // Set to a fighting pose for the base pose so it breathes naturally!
    this.stickman.pose = POSES.FightStance;
    this.stickman.activeHand = 'RIGHT';
  }

  setConfig(outfit, effect, armband) {
    this.stickman.outfit = outfit;
    this.stickman.effect = effect;
    this.stickman.armband = armband;
    this.stickman.outfitImg = getOutfitHat(outfit);
    this.stickman.effectImg = getEffectImg(effect);
    this.stickman.armbandImg = getOutfitHat(armband);
  }

  start() {
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _loop(now) {
    if (!this.running) return;
    const dt = C((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    this.stickman.update(dt);
    this._draw();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale stickman up to be huge in the lobby, perfectly centered
    ctx.save();
    // Translate to center, scale, translate back so he remains centered!
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(1.25, 1.25);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    this.stickman.draw(ctx);
    ctx.restore();
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
window.CombatEngine = CombatEngine;
window.DualCombatScene = DualCombatScene;
window.LobbyStickmanScene = LobbyStickmanScene;
window.Stickman = Stickman;
window.WordProjectile = WordProjectile;
window.LetterBelt = LetterBelt;
