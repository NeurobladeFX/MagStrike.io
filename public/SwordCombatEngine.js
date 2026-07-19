/**
 * SwordCombatEngine.js  v3.0 — MagStrike
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * KEY FIXES v3:
 *  • Strict GROUND_Y anchoring — feet are always ON the floor line.
 *  • Poses defined as offsets FROM ground upward (foot = 0, head = -H).
 *  • Letter Conveyor Belt driven by DOM <div id="letter-belt"> with CSS tiles.
 *  • Solid filled stickmen — capsule bodies, filled circles for head/joints.
 *  • RealisticWeapon: ctx.drawImage katana PNG with per-frame rotation/pivot.
 *  • 10 named combat animations with grounded foot positions.
 *  • VFX: motion-blur sword trail, spark particles, slash arcs, screen-shake.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const BELT_SIZE   = 6;          // number of tiles in the conveyor belt
const LETTER_POOL = 'ASDFJKLQWERTYUIOPZXCVBNM'; // keyboard-layout biased

// ─── MATH UTILS ───────────────────────────────────────────────────────────────

const L = (a, b, t)  => a + (b - a) * t;                           // lerp
const C = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;            // clamp
const R = (lo, hi)   => lo + Math.random() * (hi - lo);            // rand
const RI = (lo, hi)  => Math.floor(R(lo, hi + 1));                 // rand int
const easeOut  = t   => 1 - (1 - t) * (1 - t);
const easeInOut = t  => t < .5 ? 2*t*t : 1-((-2*t+2)**2)/2;

function vLerp(a, b, t) { return { x: L(a.x,b.x,t), y: L(a.y,b.y,t) }; }

// ─── POSE SYSTEM ──────────────────────────────────────────────────────────────
//
// Coordinates are LOCAL offsets relative to the stickman's root point.
// root = { x: worldX,  y: GROUND_Y }
//
// IMPORTANT: footR.y and footL.y MUST equal 0 in every grounded pose.
// Upward = negative Y.   The root sits exactly on GROUND_Y.
//
// Joint keys:
//   head, neck, shoulder,
//   elbowR, wristR,   elbowL, wristL,
//   hipR, kneeR, footR,
//   hipL, kneeL, footL,
//   swordPivot (= wristR in most poses),
//   swordTip   (direction the blade points from pivot)

const POSES = {

  // 1 IdleStance ── relaxed guard, weight balanced
  IdleStance: {
    head:       { x:  0, y:-130 }, neck:      { x:  0, y:-102 },
    shoulder:   { x:  0, y: -84 },
    elbowR:     { x: 36, y: -60 }, wristR:    { x: 56, y: -33 },
    elbowL:     { x:-28, y: -60 }, wristL:    { x:-44, y: -30 },
    hipR:       { x: 15, y: -28 }, kneeR:     { x: 20, y: -62 }, footR: { x: 26, y:  0 },
    hipL:       { x:-15, y: -28 }, kneeL:     { x:-18, y: -62 }, footL: { x:-22, y:  0 },
    swordPivot: { x: 56, y: -33 }, swordTip:  { x:110, y: -58 },
  },

  // 2 HorizontalLunge ── fast forward thrust, front foot planted
  HorizontalLunge: {
    head:       { x: 58, y:-108 }, neck:      { x: 46, y: -84 },
    shoulder:   { x: 28, y: -70 },
    elbowR:     { x: 96, y: -72 }, wristR:    { x:158, y: -74 },
    elbowL:     { x:  4, y: -48 }, wristL:    { x:-16, y: -22 },
    hipR:       { x: 36, y: -22 }, kneeR:     { x: 80, y: -50 }, footR: { x:120, y:  0 },
    hipL:       { x:-20, y: -22 }, kneeL:     { x:-48, y: -46 }, footL: { x:-76, y:  0 },
    swordPivot: { x:158, y: -74 }, swordTip:  { x:255, y: -76 },
  },

  // 3 OverheadCleave ── both hands raised, blade overhead
  OverheadCleave: {
    head:       { x:  8, y:-132 }, neck:      { x:  5, y:-104 },
    shoulder:   { x:  3, y: -88 },
    elbowR:     { x: 40, y:-155 }, wristR:    { x: 56, y:-198 },
    elbowL:     { x: 16, y:-138 }, wristL:    { x: 32, y:-182 },
    hipR:       { x: 20, y: -24 }, kneeR:     { x: 24, y: -58 }, footR: { x: 30, y:  0 },
    hipL:       { x:-16, y: -24 }, kneeL:     { x:-20, y: -58 }, footL: { x:-24, y:  0 },
    swordPivot: { x: 56, y:-198 }, swordTip:  { x: 58, y: -90 },
  },

  // 4 SpinSlash ── arms wide at peak of rotation
  SpinSlash: {
    head:       { x: -8, y:-128 }, neck:      { x: -4, y:-100 },
    shoulder:   { x: -2, y: -83 },
    elbowR:     { x: 88, y: -83 }, wristR:    { x:142, y: -82 },
    elbowL:     { x:-76, y: -83 }, wristL:    { x:-124,y: -80 },
    hipR:       { x: 18, y: -24 }, kneeR:     { x: 46, y: -58 }, footR: { x: 72, y:  0 },
    hipL:       { x:-18, y: -24 }, kneeL:     { x:-10, y: -65 }, footL: { x:  0, y:  0 },
    swordPivot: { x:142, y: -82 }, swordTip:  { x:222, y: -82 },
  },

  // 5 RisingCrescent ── low start, blade swings up diagonally
  RisingCrescent: {
    head:       { x: 16, y:-124 }, neck:      { x: 12, y: -97 },
    shoulder:   { x:  8, y: -82 },
    elbowR:     { x: 18, y: -22 }, wristR:    { x: 28, y:  -5 },
    elbowL:     { x:-20, y: -60 }, wristL:    { x:-36, y: -30 },
    hipR:       { x: 22, y: -22 }, kneeR:     { x: 38, y: -52 }, footR: { x: 48, y:  0 },
    hipL:       { x:-16, y: -22 }, kneeL:     { x:-28, y: -50 }, footL: { x:-38, y:  0 },
    swordPivot: { x: 28, y:  -5 }, swordTip:  { x:108, y:-114 },
  },

  // 6 LowBlock ── crouching guard, blade angles down-forward
  LowBlock: {
    head:       { x:  4, y: -88 }, neck:      { x:  3, y: -66 },
    shoulder:   { x:  2, y: -54 },
    elbowR:     { x: 38, y: -36 }, wristR:    { x: 60, y: -20 },
    elbowL:     { x:-26, y: -38 }, wristL:    { x:-48, y: -22 },
    hipR:       { x: 28, y: -16 }, kneeR:     { x: 52, y: -42 }, footR: { x: 66, y:  0 },
    hipL:       { x:-24, y: -16 }, kneeL:     { x:-44, y: -42 }, footL: { x:-58, y:  0 },
    swordPivot: { x: 60, y: -20 }, swordTip:  { x:128, y:   8 },
  },

  // 7 HighParry ── arms raised, blade blocks high
  HighParry: {
    head:       { x: -4, y:-128 }, neck:      { x: -2, y: -99 },
    shoulder:   { x: -1, y: -83 },
    elbowR:     { x: 48, y:-120 }, wristR:    { x: 70, y:-152 },
    elbowL:     { x:-18, y:-102 }, wristL:    { x:-36, y:-130 },
    hipR:       { x: 18, y: -24 }, kneeR:     { x: 28, y: -58 }, footR: { x: 36, y:  0 },
    hipL:       { x:-16, y: -24 }, kneeL:     { x:-23, y: -58 }, footL: { x:-30, y:  0 },
    swordPivot: { x: 70, y:-152 }, swordTip:  { x: 98, y:-222 },
  },

  // 8 DashRetreat ── body leans back, weight on back foot
  DashRetreat: {
    head:       { x:-44, y:-122 }, neck:      { x:-34, y: -95 },
    shoulder:   { x:-24, y: -80 },
    elbowR:     { x: 14, y: -60 }, wristR:    { x: 38, y: -38 },
    elbowL:     { x:-58, y: -58 }, wristL:    { x:-80, y: -34 },
    hipR:       { x: -8, y: -20 }, kneeR:     { x:-12, y: -54 }, footR: { x:-16, y:  0 },
    hipL:       { x:  8, y: -20 }, kneeL:     { x: 52, y: -48 }, footL: { x: 86, y:  0 },
    swordPivot: { x: 38, y: -38 }, swordTip:  { x: 88, y: -62 },
  },

  // 9 ForwardRoll ── tucked mid-roll, both feet lifted slightly
  // (brief air moment – feet near 0 to keep it close to ground)
  ForwardRoll: {
    head:       { x: 48, y: -48 }, neck:      { x: 34, y: -34 },
    shoulder:   { x: 20, y: -22 },
    elbowR:     { x: 14, y:  -4 }, wristR:    { x: 20, y:  12 },
    elbowL:     { x: -4, y:  -2 }, wristL:    { x: -6, y:  14 },
    hipR:       { x:  8, y:  -8 }, kneeR:     { x: -4, y: -36 }, footR: { x:-16, y: -14 },
    hipL:       { x: -6, y:  -6 }, kneeL:     { x: 22, y: -34 }, footL: { x: 40, y: -12 },
    swordPivot: { x: 20, y:  12 }, swordTip:  { x: 78, y:   8 },
  },

  // 10 DecapitationSwing ── full horizontal mega reach, max extension
  DecapitationSwing: {
    head:       { x: 24, y:-118 }, neck:      { x: 18, y: -93 },
    shoulder:   { x: 12, y: -78 },
    elbowR:     { x:118, y: -88 }, wristR:    { x:192, y: -90 },
    elbowL:     { x:102, y: -85 }, wristL:    { x:172, y: -86 },
    hipR:       { x: 28, y: -20 }, kneeR:     { x: 58, y: -52 }, footR: { x: 88, y:  0 },
    hipL:       { x:-26, y: -20 }, kneeL:     { x:-48, y: -50 }, footL: { x:-76, y:  0 },
    swordPivot: { x:192, y: -90 }, swordTip:  { x:316, y: -92 },
  },
};

const ATTACK_NAMES = Object.keys(POSES).filter(n => n !== 'IdleStance');

// High-velocity = triggers screen shake + more VFX
const IS_HIGH_VEL = {
  SpinSlash: true, OverheadCleave: true, DecapitationSwing: true,
};

// ─── REALISTIC WEAPON ─────────────────────────────────────────────────────────

class RealisticWeapon {
  /**
   * @param {string}  src        - path to katana PNG
   * @param {number}  bladeLen   - total drawn length (px)
   * @param {number}  gripLen    - distance from image left edge to grip centre
   */
  constructor(src, bladeLen = 260, gripLen = 48) {
    this.bladeLen = bladeLen;
    this.gripLen  = gripLen;

    this._img   = new Image();
    this._ready = false;
    this._img.onload  = () => { this._ready = true; };
    this._img.onerror = () => console.warn('[Weapon] PNG not found – using fallback');
    this._img.src     = src;

    // Trail buffer: array of {px, py, angle, life}
    this._trail    = [];
    this._trailMax = 12;
  }

  /**
   * Draw the weapon each frame.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} px, py    – world coords of grip joint
   * @param {number} tx, ty    – world coords of sword tip direction
   * @param {boolean} trail    – show motion blur trail?
   * @param {boolean} glow     – attack glow?
   */
  draw(ctx, px, py, tx, ty, trail, glow) {
    const angle = Math.atan2(ty - py, tx - px);

    // Push to trail
    if (trail) {
      this._trail.unshift({ px, py, angle, life: 0.7 });
      if (this._trail.length > this._trailMax) this._trail.pop();
    }

    // Decay & draw trail frames (back to front)
    for (let i = this._trail.length - 1; i >= 0; i--) {
      const tr = this._trail[i];
      tr.life *= 0.78;
      if (tr.life < 0.02) { this._trail.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = tr.life * (1 - i / this._trailMax);
      ctx.translate(tr.px, tr.py);
      ctx.rotate(tr.angle);
      this._blade(ctx, false, 0.28);
      ctx.restore();
    }

    // Main sword
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    this._blade(ctx, glow, 1.0);
    ctx.restore();
  }

  _blade(ctx, glow, alpha) {
    ctx.globalAlpha = alpha;
    const w = this.bladeLen;
    const ox = -this.gripLen;   // left offset so grip is at origin

    if (this._ready) {
      const h = (this._img.naturalHeight / this._img.naturalWidth) * w;
      if (glow) { ctx.shadowColor = '#88ccff'; ctx.shadowBlur = 24; }
      ctx.drawImage(this._img, ox, -h / 2, w, h);
    } else {
      // Fallback canvas katana
      const grip = this.gripLen;

      // Handle wrap
      ctx.fillStyle = '#1a0d06';
      ctx.beginPath(); ctx.roundRect(ox, -5, grip * 0.6, 10, 3); ctx.fill();

      // Tsuba guard
      ctx.fillStyle = '#999';
      ctx.beginPath(); ctx.ellipse(ox + grip*0.62, 0, 9, 15, 0, 0, Math.PI*2); ctx.fill();

      // Blade gradient
      ctx.save();
      const g = ctx.createLinearGradient(ox + grip*0.7, -4, ox + w, 0);
      g.addColorStop(0, '#ccc'); g.addColorStop(0.45, '#f4f4f4'); g.addColorStop(1, '#e0e0e0');
      ctx.fillStyle = g;
      if (glow) { ctx.shadowColor = '#b0d8ff'; ctx.shadowBlur = 20; }
      ctx.beginPath();
      ctx.moveTo(ox + grip*0.7, -4);
      ctx.lineTo(ox + w,          0);
      ctx.lineTo(ox + grip*0.7,   4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

// ─── VFX PARTICLES ────────────────────────────────────────────────────────────

class Spark {
  constructor(x, y, power) {
    const a = R(0, Math.PI*2), s = R(3, 12) * (0.5 + power);
    this.x=x; this.y=y;
    this.vx=Math.cos(a)*s; this.vy=Math.sin(a)*s - R(1,4);
    this.life=1; this.decay=R(.04,.09);
    this.size=R(1.5,4.5)*(0.5+power*.5);
    this.color=power>.7?`hsl(${RI(30,55)},100%,70%)`:`hsl(${RI(0,25)},100%,62%)`;
  }
  update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=.35; this.vx*=.95; this.life-=this.decay; }
  draw(ctx){
    ctx.save(); ctx.globalAlpha=C(this.life,0,1);
    ctx.fillStyle=this.color; ctx.shadowColor=this.color; ctx.shadowBlur=9;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.size*this.life,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  get dead(){ return this.life<=0; }
}

class SlashArc {
  constructor(x, y, angle, power){
    this.x=x; this.y=y; this.angle=angle;
    this.r=R(20,40); this.maxR=R(90,200)*(0.5+power*.5);
    this.arc=R(.7,1.5); this.life=1; this.decay=R(.025,.06);
    this.thick=R(2,7)*(0.5+power*.5);
    this.color=power>.65?`hsl(${RI(38,60)},100%,72%)`:`hsl(${RI(190,230)},100%,66%)`;
  }
  update(){ this.r=L(this.r,this.maxR,.15); this.life-=this.decay; }
  draw(ctx){
    ctx.save(); ctx.globalAlpha=C(this.life,0,1);
    ctx.strokeStyle=this.color; ctx.lineWidth=this.thick*this.life;
    ctx.shadowColor=this.color; ctx.shadowBlur=18;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,this.angle-this.arc/2,this.angle+this.arc/2);
    ctx.stroke(); ctx.restore();
  }
  get dead(){ return this.life<=0; }
}

// ─── STICKMAN ─────────────────────────────────────────────────────────────────

class Stickman {
  /**
   * @param {number}          rootX
   * @param {number}          groundY   – the fixed GROUND_Y value
   * @param {1|-1}            facing    – 1=right, -1=left
   * @param {string}          bodyColor – solid fill colour
   * @param {string}          accent    – glow / headband colour
   * @param {RealisticWeapon} weapon
   */
  constructor(rootX, groundY, facing, bodyColor, accent, weapon) {
    this.rootX   = rootX;
    this.groundY = groundY;
    this.facing  = facing;
    this.color   = bodyColor;
    this.accent  = accent;
    this.weapon  = weapon;

    // Live joints (start from IdleStance copy)
    this.J = this._copy(POSES.IdleStance);

    // Pose machine
    this._name  = 'IdleStance';
    this._src   = this._copy(POSES.IdleStance);
    this._dst   = POSES.IdleStance;
    this._t     = 1;
    this._spd   = 5;

    // Idle breathing
    this._breathT = Math.random() * Math.PI * 2;

    // VFX
    this.particles   = [];
    this._shakePow   = 0;
    this._shake      = {x:0, y:0};
    this._flashTimer = 0;
    this._attacking  = false;
  }

  // ── Pose helpers ─────────────────────────────────────────────────────────

  _copy(src) {
    const o = {};
    for (const k in src) o[k] = { x: src[k].x, y: src[k].y };
    return o;
  }

  _go(poseName, speed) {
    this._src  = this._copy(this.J);
    this._dst  = POSES[poseName];
    this._name = poseName;
    this._spd  = speed;
    this._t    = 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Randomly pick one of the 9 attack animations.
   * @returns {string} animation name
   */
  attack() {
    const idx  = Math.floor(Math.random() * ATTACK_NAMES.length);
    const name = ATTACK_NAMES[idx];
    const hv   = IS_HIGH_VEL[name] || false;
    const vel  = hv ? R(0.76,1.0) : R(0.38,0.68);
    const spd  = hv ? R(14,20)    : R(8,13);

    this._go(name, spd);
    this._attacking  = true;
    this._flashTimer = 0.12;

    const peakMs    = (1/spd) * 680;
    const recoverMs = peakMs + 190;

    setTimeout(() => {
      const tp = this._worldJ('swordTip');
      const pp = this._worldJ('swordPivot');
      this._spawnVFX(tp, pp, vel);
      if (hv) this._shakePow = vel;
    }, peakMs);

    setTimeout(() => {
      this._attacking = false;
      this._go('IdleStance', 4);
    }, recoverMs);

    return name;
  }

  recoil() {
    this._flashTimer = 0.2;
    this._shakePow   = 0.3;
    this._go('DashRetreat', 16);
    setTimeout(() => this._go('IdleStance', 4), 220);
  }

  takeHit() {
    this._flashTimer = 0.24;
    this._shakePow   = 0.5;
    this._go('DashRetreat', 12);
    setTimeout(() => this._go('IdleStance', 4), 340);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    // Breathing offset (idle only)
    this._breathT += dt * 1.7;
    const bob = this._name === 'IdleStance'
      ? Math.sin(this._breathT) * 4 : 0;

    // Pose interpolation
    if (this._t < 1) {
      this._t = C(this._t + dt * this._spd, 0, 1);
      const et = easeInOut(this._t);
      for (const k in this._dst) {
        this.J[k] = vLerp(this._src[k], this._dst[k], et);
      }
    }

    // Apply breathing
    if (this._name === 'IdleStance') {
      for (const k in this.J) this.J[k] = { x: this.J[k].x, y: this.J[k].y + bob * .35 };
    }

    // Particles
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);

    // Shake decay
    if (this._shakePow > 0) {
      this._shakePow = Math.max(0, this._shakePow - dt * 9);
      const m = this._shakePow * 14;
      this._shake.x = R(-m, m); this._shake.y = R(-m, m);
    } else { this._shake.x = 0; this._shake.y = 0; }

    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw(ctx) {
    // Root is exactly at (rootX, groundY)
    const rx = this.rootX + this._shake.x;
    const ry = this.groundY + this._shake.y;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(this.facing, 1);   // mirror for left-facing

    // Particles (world space)
    this.particles.forEach(p => {
      ctx.save();
      ctx.scale(this.facing, 1);
      ctx.translate(-rx, -ry);
      p.draw(ctx);
      ctx.restore();
    });

    this._drawBody(ctx);

    // Weapon (world-space coords converted to local)
    ctx.restore();   // restore before drawing weapon in world space

    const pp = this._worldJ('swordPivot');
    const tp = this._worldJ('swordTip');
    this.weapon.draw(
      ctx, pp.x, pp.y, tp.x, tp.y,
      this._attacking, this._attacking
    );
  }

  // ── Private: world joint ──────────────────────────────────────────────────

  _worldJ(name) {
    const j = this.J[name];
    return {
      x: this.rootX + j.x * this.facing + this._shake.x,
      y: this.groundY + j.y + this._shake.y,
    };
  }

  // ── Private: filled silhouette ────────────────────────────────────────────

  _drawBody(ctx) {
    const J   = this.J;
    const fl  = this._flashTimer > 0;
    const col = fl ? '#ffffff' : this.color;
    const gl  = fl ? 30 : 10;
    const acc = this.accent;

    ctx.shadowColor = acc;
    ctx.shadowBlur  = gl;

    // Hip centre (average of both hips)
    const hx = (J.hipR.x + J.hipL.x) / 2;
    const hy = (J.hipR.y + J.hipL.y) / 2;
    const hc = { x: hx, y: hy };

    // ── Torso ──
    this._pill(ctx, col, J.neck, hc, 13);

    // ── Arms ──
    this._pill(ctx, col, J.shoulder, J.elbowR, 7);
    this._pill(ctx, col, J.elbowR,   J.wristR,  6);
    this._pill(ctx, col, J.shoulder, J.elbowL, 7);
    this._pill(ctx, col, J.elbowL,   J.wristL,  6);

    // ── Legs ──
    this._pill(ctx, col, hc,       J.kneeR, 9);
    this._pill(ctx, col, J.kneeR, J.footR, 8);
    this._pill(ctx, col, hc,       J.kneeL, 9);
    this._pill(ctx, col, J.kneeL, J.footL, 8);

    // ── Foot pads ──
    this._ellipse(ctx, col, J.footR, 16, 5);
    this._ellipse(ctx, col, J.footL, 16, 5);

    // ── Head ──
    ctx.beginPath();
    ctx.arc(J.head.x, J.head.y, 22, 0, Math.PI * 2);
    ctx.fillStyle   = col;
    ctx.shadowBlur  = gl; ctx.shadowColor = acc;
    ctx.fill();

    // ── Headband ── (flowing arc on upper-half of head)
    ctx.save();
    ctx.strokeStyle = acc;
    ctx.lineWidth   = 7;
    ctx.shadowColor = acc; ctx.shadowBlur = 22;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(J.head.x, J.head.y, 22, -2.2, -0.5);
    ctx.stroke();
    // Trailing scarf end
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(J.head.x + 18, J.head.y - 10);
    ctx.bezierCurveTo(
      J.head.x + 34, J.head.y - 5,
      J.head.x + 42, J.head.y + 8,
      J.head.x + 36, J.head.y + 20
    );
    ctx.stroke();
    ctx.restore();

    // ── Eye glint ──
    ctx.save();
    ctx.fillStyle   = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur  = 7;
    ctx.beginPath();
    ctx.arc(J.head.x + 9, J.head.y + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Filled rounded pill between two points (capsule shape). */
  _pill(ctx, color, a, b, r) {
    const dx  = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, -r, len, r * 2, r);
    ctx.fill();
    ctx.restore();
  }

  _ellipse(ctx, color, p, rx, ry) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + ry * .5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── VFX ──────────────────────────────────────────────────────────────────

  _spawnVFX(tipW, pivotW, vel) {
    const angle = Math.atan2(tipW.y - pivotW.y, tipW.x - pivotW.x);
    const count = Math.floor(L(8, 32, vel));
    for (let i = 0; i < count; i++) this.particles.push(new Spark(tipW.x, tipW.y, vel));
    const arcs = vel > .65 ? (vel > .85 ? 4 : 2) : 1;
    for (let i = 0; i < arcs; i++) this.particles.push(new SlashArc(tipW.x, tipW.y, angle, vel));
  }
}

// ─── LETTER CONVEYOR BELT ─────────────────────────────────────────────────────

class LetterBelt {
  /**
   * Manages the 6-tile DOM conveyor belt in <div id="letter-belt">.
   * @param {Function} onCorrect(letter) – called on successful match
   * @param {Function} onWrong(expected, actual) – called on mismatch
   */
  constructor(onCorrect, onWrong) {
    this._belt    = document.getElementById('letter-belt');
    this._queue   = [];
    this._active  = false;
    this._onCB    = onCorrect;
    this._offCB   = onWrong;
    this._handler = this._onKey.bind(this);
  }

  /** Fill belt with BELT_SIZE random letters and start listening. */
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
    return LETTER_POOL[RI(0, LETTER_POOL.length - 1)];
  }

  /** Add a letter to the right of the queue (DOM + data). */
  _push() {
    const letter = this._randLetter();
    this._queue.push(letter);

    const tile = document.createElement('div');
    tile.className   = 'letter-tile entering';
    tile.textContent = letter;
    this._belt.appendChild(tile);

    // Remove entering class after animation
    setTimeout(() => tile.classList.remove('entering'), 140);
  }

  /** Remove the leftmost tile instantly (zero delay). */
  _shift() {
    this._queue.shift();
    const first = this._belt.firstChild;
    if (first) this._belt.removeChild(first);
  }

  /** Mark first tile as active target. */
  _refreshTiles() {
    const tiles = this._belt.children;
    for (let i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove('active-target', 'correct-flash', 'wrong-flash');
      if (i === 0) tiles[i].classList.add('active-target');
    }
  }

  _onKey(e) {
    if (!this._active || this._queue.length === 0) return;
    if (e.key.length !== 1) return;   // skip Shift, Enter, etc.

    const pressed  = e.key.toUpperCase();
    const expected = this._queue[0];
    const tile     = this._belt.firstChild;

    if (pressed === expected) {
      // ── CORRECT ──────────────────────────────────────────
      if (tile) { tile.classList.add('correct-flash'); }

      // Instant remove + inject — zero delay
      this._shift();
      this._push();
      this._refreshTiles();

      this._onCB(expected);

    } else {
      // ── WRONG ────────────────────────────────────────────
      if (tile) {
        tile.classList.add('wrong-flash');
        setTimeout(() => {
          tile.classList.remove('wrong-flash');
        }, 180);
      }
      this._offCB(expected, pressed);
    }
  }
}

// ─── DUAL COMBAT SCENE ────────────────────────────────────────────────────────

class DualCombatScene {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.running = false;
    this._raf    = null;
    this._last   = 0;

    const W = canvas.width;
    const H = canvas.height;

    // ── GROUND_Y ── strict floor baseline
    this.GROUND_Y = H * 0.75;

    const katana = new RealisticWeapon('assets/katana.png', 260, 50);

    // Player 1 — left, dark navy
    this.p1 = new Stickman(W * 0.26, this.GROUND_Y,  1, '#0d0d1a', '#3daeff', katana);
    // Player 2 — right, dark crimson
    this.p2 = new Stickman(W * 0.74, this.GROUND_Y, -1, '#1a0000', '#c0392b', katana);

    // Letter belt
    this._belt = new LetterBelt(
      (letter)         => this._onCorrect(letter),
      (exp, got)       => this._onWrong(exp, got)
    );

    // Public stats
    this.stats = { hits: 0, misses: 0, lastMove: '—' };
  }

  start() {
    this.running = true;
    this._last   = performance.now();
    this._belt.start();
    requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this.running = false;
    this._belt.stop();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  // ── Letter callbacks ───────────────────────────────────────────────────────

  _onCorrect(letter) {
    this.stats.hits++;
    const moveName = this.p1.attack();
    this.stats.lastMove = moveName;

    // Notify game.js
    if (typeof onLetterCorrect === 'function') onLetterCorrect(moveName);

    // Enemy reacts after travel time
    const delay = moveName === 'HorizontalLunge' ? 110
                : moveName === 'DecapitationSwing' ? 370 : 200;
    setTimeout(() => this.p2.takeHit(), delay);
  }

  _onWrong(expected, got) {
    this.stats.misses++;
    this.p1.recoil();
    if (typeof onLetterWrong === 'function') onLetterWrong();
  }

  // ── External API (game.js / server) ───────────────────────────────────────

  triggerLocalAttack(wpm, wordLen) { this.p1.attack(); setTimeout(() => this.p2.takeHit(), 200); }
  triggerEnemyAttack()             { this.p2.attack(); setTimeout(() => this.p1.takeHit(), 200); }

  updateHealthBars(myPct, enemyPct) {
    const m = document.getElementById('my-health');
    const e = document.getElementById('enemy-health');
    if (m) m.style.width = `${Math.max(0, myPct)}%`;
    if (e) e.style.width = `${Math.max(0, enemyPct)}%`;
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  _loop(now) {
    if (!this.running) return;
    const dt = C((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    this.p1.update(dt);
    this.p2.update(dt);
    this._draw();

    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _draw() {
    const { ctx, canvas, GROUND_Y } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── Background ──────────────────────────────────────────────────────────
    const bg = ctx.createRadialGradient(W/2, H*.55, 30, W/2, H*.55, W*.72);
    bg.addColorStop(0, '#1c0404');
    bg.addColorStop(1, '#040000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*.3, W/2, H/2, W*.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ── Ground floor ────────────────────────────────────────────────────────

    // Below-floor shadow fill
    const floor = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 60);
    floor.addColorStop(0, 'rgba(192,57,43,.14)');
    floor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, GROUND_Y, W, 60);

    // Floor glow line
    ctx.save();
    ctx.strokeStyle = 'rgba(192,57,43,.55)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#c0392b'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
    ctx.restore();

    // Floor grid lines (perspective illusion)
    ctx.save();
    ctx.strokeStyle = 'rgba(192,57,43,.08)';
    ctx.lineWidth   = 1;
    for (let gx = 0; gx <= W; gx += 80) {
      ctx.beginPath(); ctx.moveTo(gx, GROUND_Y); ctx.lineTo(W/2, H + 80); ctx.stroke();
    }
    for (let d = 0; d < 5; d++) {
      const py = GROUND_Y + d * 20;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
    ctx.restore();

    // Centre dash divider
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.03)';
    ctx.setLineDash([8, 18]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.restore();

    // ── Stickmen ────────────────────────────────────────────────────────────
    this.p2.draw(ctx);
    this.p1.draw(ctx);
  }
}

// ─── COMBAT ENGINE (thin wrapper) ─────────────────────────────────────────────

class CombatEngine {
  constructor(canvas) {
    this._scene = new DualCombatScene(canvas);
  }
  start()                        { this._scene.start(); }
  stop()                         { this._scene.stop();  }
  get stats()                    { return this._scene.stats; }
  triggerLocalAttack(wpm, wl)    { this._scene.triggerLocalAttack(wpm, wl); }
  triggerEnemyAttack()           { this._scene.triggerEnemyAttack(); }
  updateHealthBars(my, en)       { this._scene.updateHealthBars(my, en); }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
window.CombatEngine    = CombatEngine;
window.DualCombatScene = DualCombatScene;
window.Stickman        = Stickman;
window.RealisticWeapon = RealisticWeapon;
window.LetterBelt      = LetterBelt;
