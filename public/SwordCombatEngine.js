/**
 * SwordCombatEngine.js  v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *   RealisticWeapon  – loads & draws the katana PNG with ctx.drawImage, handles
 *                      rotation + pivot anchoring + motion-blur trail
 *   Stickman         – solid filled-silhouette character with 10 keyframe poses
 *   DualCombatScene  – master game loop, letter-burst input, VFX orchestration
 *   CombatEngine     – thin single-player wrapper (optional)
 *
 * Letter-Burst Mechanic:
 *   A single random CAPITAL letter appears centre-screen. One keypress resolves
 *   it instantly (no fade). Correct → random attack animation. Wrong → recoil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── MATH HELPERS ────────────────────────────────────────────────────────────

const _lerp  = (a, b, t)  => a + (b - a) * t;
const _clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const _rand  = (lo, hi)   => lo + Math.random() * (hi - lo);
const _rInt  = (lo, hi)   => Math.floor(_rand(lo, hi + 1));
const _easeOut  = t => 1 - (1 - t) * (1 - t);
const _easeInOut = t => t < 0.5 ? 2*t*t : 1 - (-2*t+2)**2/2;

function _vecLerp(a, b, t) {
  return { x: _lerp(a.x, b.x, t), y: _lerp(a.y, b.y, t) };
}

// ─── JOINT / POSE SYSTEM ─────────────────────────────────────────────────────
// All joints are offsets relative to the "root" (hip centre, world-Y-up).
// Positive Y = DOWN on screen.

/** @typedef {{ x:number, y:number }} V2 */
/** @typedef {{ [key:string]: V2 }} Pose */

/**
 * Build a pose object (shorthand).
 * @param {Object} def
 * @returns {Pose}
 */
function mkPose(def) { return def; }

const JOINT_KEYS = [
  'head', 'neck', 'shoulder',
  'elbowR', 'wristR',
  'elbowL', 'wristL',
  'hipR', 'kneeR', 'footR',
  'hipL', 'kneeL', 'footL',
  'swordPivot',   // where the hand grips the sword handle
  'swordTip',     // forward tip direction vector (used for angle)
];

// ─── 10 COMBAT POSE DEFINITIONS ──────────────────────────────────────────────

const POSES = {

  // 1 ── IdleReady: neutral guard stance
  IdleReady: mkPose({
    head:        { x:   0, y: -130 },
    neck:        { x:   0, y: -100 },
    shoulder:    { x:   0, y:  -82 },
    elbowR:      { x:  38, y:  -58 },
    wristR:      { x:  58, y:  -32 },
    elbowL:      { x: -28, y:  -60 },
    wristL:      { x: -44, y:  -30 },
    hipR:        { x:  16, y:    0 },
    kneeR:       { x:  22, y:   55 },
    footR:       { x:  28, y:  110 },
    hipL:        { x: -16, y:    0 },
    kneeL:       { x: -20, y:   55 },
    footL:       { x: -24, y:  110 },
    swordPivot:  { x:  58, y:  -32 },
    swordTip:    { x: 105, y:  -55 },
  }),

  // 2 ── LungeAttack: fast horizontal thrust
  LungeAttack: mkPose({
    head:        { x:  60, y: -108 },
    neck:        { x:  48, y:  -84 },
    shoulder:    { x:  30, y:  -70 },
    elbowR:      { x: 100, y:  -72 },
    wristR:      { x: 162, y:  -74 },
    elbowL:      { x:   2, y:  -48 },
    wristL:      { x: -18, y:  -20 },
    hipR:        { x:  38, y:    0 },
    kneeR:       { x:  82, y:   48 },
    footR:       { x: 125, y:   98 },
    hipL:        { x: -22, y:    0 },
    kneeL:       { x: -52, y:   44 },
    footL:       { x: -82, y:   88 },
    swordPivot:  { x: 162, y:  -74 },
    swordTip:    { x: 260, y:  -76 },
  }),

  // 3 ── OverheadSlash: big vertical downswing
  OverheadSlash: mkPose({
    head:        { x:  12, y: -132 },
    neck:        { x:   8, y: -104 },
    shoulder:    { x:   5, y:  -88 },
    elbowR:      { x:  42, y: -155 },
    wristR:      { x:  60, y: -195 },
    elbowL:      { x:  18, y: -135 },
    wristL:      { x:  35, y: -180 },
    hipR:        { x:  22, y:    0 },
    kneeR:       { x:  28, y:   55 },
    footR:       { x:  35, y:  108 },
    hipL:        { x: -18, y:    0 },
    kneeL:       { x: -22, y:   55 },
    footL:       { x: -26, y:  108 },
    swordPivot:  { x:  60, y: -195 },
    swordTip:    { x:  62, y:  -80 },   // blade points downward
  }),

  // 4 ── SpinAttack: arms wide, mid-spin
  SpinAttack: mkPose({
    head:        { x: -10, y: -128 },
    neck:        { x:  -6, y:  -99 },
    shoulder:    { x:  -4, y:  -83 },
    elbowR:      { x:  90, y:  -83 },
    wristR:      { x: 145, y:  -82 },
    elbowL:      { x: -80, y:  -83 },
    wristL:      { x:-130, y:  -80 },
    hipR:        { x:  20, y:    0 },
    kneeR:       { x:  50, y:   60 },
    footR:       { x:  75, y:  105 },
    hipL:        { x: -20, y:    0 },
    kneeL:       { x: -10, y:   65 },
    footL:       { x:   0, y:  112 },
    swordPivot:  { x: 145, y:  -82 },
    swordTip:    { x: 225, y:  -82 },
  }),

  // 5 ── RisingStrike: low-to-high upward slash
  RisingStrike: mkPose({
    head:        { x:  18, y: -124 },
    neck:        { x:  14, y:  -97 },
    shoulder:    { x:  10, y:  -82 },
    elbowR:      { x:  20, y:  -20 },
    wristR:      { x:  30, y:   28 },
    elbowL:      { x: -22, y:  -60 },
    wristL:      { x: -38, y:  -30 },
    hipR:        { x:  25, y:    0 },
    kneeR:       { x:  40, y:   52 },
    footR:       { x:  50, y:  105 },
    hipL:        { x: -18, y:    0 },
    kneeL:       { x: -30, y:   50 },
    footL:       { x: -40, y:  100 },
    swordPivot:  { x:  30, y:   28 },
    swordTip:    { x: 110, y: -110 },   // blade angles up-right
  }),

  // 6 ── ParryHigh: raised defensive block
  ParryHigh: mkPose({
    head:        { x:  -5, y: -128 },
    neck:        { x:  -3, y:  -99 },
    shoulder:    { x:  -2, y:  -83 },
    elbowR:      { x:  50, y: -120 },
    wristR:      { x:  72, y: -152 },
    elbowL:      { x: -20, y: -100 },
    wristL:      { x: -38, y: -130 },
    hipR:        { x:  20, y:    0 },
    kneeR:       { x:  30, y:   55 },
    footR:       { x:  38, y:  108 },
    hipL:        { x: -18, y:    0 },
    kneeL:       { x: -25, y:   55 },
    footL:       { x: -32, y:  108 },
    swordPivot:  { x:  72, y: -152 },
    swordTip:    { x: 100, y: -220 },
  }),

  // 7 ── BlockLow: crouching guard
  BlockLow: mkPose({
    head:        { x:   5, y:  -90 },
    neck:        { x:   3, y:  -68 },
    shoulder:    { x:   2, y:  -55 },
    elbowR:      { x:  40, y:  -38 },
    wristR:      { x:  62, y:  -22 },
    elbowL:      { x: -28, y:  -40 },
    wristL:      { x: -50, y:  -24 },
    hipR:        { x:  30, y:    0 },
    kneeR:       { x:  55, y:   38 },
    footR:       { x:  70, y:   75 },
    hipL:        { x: -26, y:    0 },
    kneeL:       { x: -48, y:   38 },
    footL:       { x: -62, y:   75 },
    swordPivot:  { x:  62, y:  -22 },
    swordTip:    { x: 130, y:   10 },   // blade angled low-forward
  }),

  // 8 ── BackstepDodge: lean back weight shift
  BackstepDodge: mkPose({
    head:        { x: -45, y: -122 },
    neck:        { x: -35, y:  -95 },
    shoulder:    { x: -25, y:  -80 },
    elbowR:      { x:  15, y:  -60 },
    wristR:      { x:  40, y:  -38 },
    elbowL:      { x: -60, y:  -58 },
    wristL:      { x: -82, y:  -35 },
    hipR:        { x: -10, y:    0 },
    kneeR:       { x: -15, y:   55 },
    footR:       { x: -18, y:  108 },
    hipL:        { x:  10, y:    0 },
    kneeL:       { x:  55, y:   50 },
    footL:       { x:  90, y:   98 },
    swordPivot:  { x:  40, y:  -38 },
    swordTip:    { x:  90, y:  -62 },
  }),

  // 9 ── SideRoll: tucked rolling dodge
  SideRoll: mkPose({
    head:        { x:  50, y:  -50 },
    neck:        { x:  35, y:  -35 },
    shoulder:    { x:  20, y:  -22 },
    elbowR:      { x:  15, y:   10 },
    wristR:      { x:  22, y:   35 },
    elbowL:      { x:  -5, y:    5 },
    wristL:      { x:  -8, y:   28 },
    hipR:        { x:  10, y:   18 },
    kneeR:       { x:  -5, y:   55 },
    footR:       { x: -18, y:   80 },
    hipL:        { x:  -8, y:   12 },
    kneeL:       { x:  25, y:   48 },
    footL:       { x:  45, y:   72 },
    swordPivot:  { x:  22, y:   35 },
    swordTip:    { x:  80, y:   30 },
  }),

  // 10 ── HeavyDecapitationSwing: fully extended horizontal mega-swing
  HeavyDecapitationSwing: mkPose({
    head:        { x:  25, y: -118 },
    neck:        { x:  20, y:  -93 },
    shoulder:    { x:  14, y:  -78 },
    elbowR:      { x: 120, y:  -90 },
    wristR:      { x: 195, y:  -92 },
    elbowL:      { x: 105, y:  -86 },
    wristL:      { x: 175, y:  -88 },
    hipR:        { x:  30, y:    0 },
    kneeR:       { x:  60, y:   50 },
    footR:       { x:  90, y:  100 },
    hipL:        { x: -28, y:    0 },
    kneeL:       { x: -50, y:   48 },
    footL:       { x: -80, y:   96 },
    swordPivot:  { x: 195, y:  -92 },
    swordTip:    { x: 320, y:  -94 },   // massive extended reach
  }),
};

// Attack name → whether it is high-velocity (triggers screen shake + big VFX)
const HIGH_VELOCITY = {
  SpinAttack: true,
  OverheadSlash: true,
  HeavyDecapitationSwing: true,
  LungeAttack: false,
  RisingStrike: false,
  ParryHigh: false,
  BlockLow: false,
  BackstepDodge: false,
  SideRoll: false,
};

// Ordered list for random selection (indices 0–8 = attack states)
const ATTACK_STATE_NAMES = [
  'LungeAttack',
  'OverheadSlash',
  'SpinAttack',
  'RisingStrike',
  'ParryHigh',
  'BlockLow',
  'BackstepDodge',
  'SideRoll',
  'HeavyDecapitationSwing',
];

// ─── REALISTIC WEAPON ────────────────────────────────────────────────────────

class RealisticWeapon {
  /**
   * @param {string} src  - Path to the sword PNG asset
   * @param {number} totalLen - Full sword length in pixels (at scale 1)
   * @param {number} gripOffset - Pixels from left edge to grip centre
   */
  constructor(src, totalLen = 260, gripOffset = 48) {
    this.totalLen   = totalLen;
    this.gripOffset = gripOffset;
    this.scale      = 1.0;

    this._img    = new Image();
    this._ready  = false;
    this._img.onload  = () => { this._ready = true; };
    this._img.onerror = () => {
      console.warn('[RealisticWeapon] Asset failed to load:', src, '— using canvas fallback');
    };
    this._img.src = src;

    // Motion-blur trail: stores past {pivotX, pivotY, angle, alpha} snapshots
    this._trail = [];
    this._trailMaxLen = 10;
    this._lastAngle = 0;
  }

  /**
   * Call once per frame from the stickman's draw pass.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} pivotX  – world-X of the hand-grip
   * @param {number} pivotY  – world-Y of the hand-grip
   * @param {number} tipX    – world-X of the blade tip (determines angle)
   * @param {number} tipY    – world-Y of the blade tip
   * @param {boolean} showTrail
   * @param {number}  facingDir  1 or -1
   * @param {boolean} isAttacking  – boosted glow while attacking
   */
  draw(ctx, pivotX, pivotY, tipX, tipY, showTrail, facingDir, isAttacking) {
    const angle = Math.atan2(tipY - pivotY, tipX - pivotX);

    // --- Motion blur trail (drawn first, underneath) ---
    if (showTrail) {
      this._trail.unshift({ pivotX, pivotY, angle, alpha: 0.55 });
      if (this._trail.length > this._trailMaxLen) this._trail.pop();
    } else {
      // Decay existing trail
      this._trail.forEach(t => t.alpha *= 0.82);
      this._trail = this._trail.filter(t => t.alpha > 0.02);
    }

    // Draw trail frames (oldest first, most transparent)
    for (let i = this._trail.length - 1; i >= 0; i--) {
      const tr = this._trail[i];
      const trAlpha = tr.alpha * (1 - i / this._trailMaxLen);
      ctx.save();
      ctx.globalAlpha = trAlpha;
      ctx.translate(tr.pivotX, tr.pivotY);
      ctx.rotate(tr.angle);
      if (facingDir === -1) ctx.scale(1, -1);
      this._renderBlade(ctx, isAttacking, 0.35);
      ctx.restore();
    }

    // --- Main sword ---
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    if (facingDir === -1) ctx.scale(1, -1);
    this._renderBlade(ctx, isAttacking, 1.0);
    ctx.restore();

    this._lastAngle = angle;
  }

  _renderBlade(ctx, isAttacking, masterAlpha) {
    ctx.globalAlpha = masterAlpha;

    if (this._ready) {
      // Draw real PNG asset
      const w = this.totalLen * this.scale;
      const h = (this._img.naturalHeight / this._img.naturalWidth) * w;
      const x = -this.gripOffset * this.scale;
      const y = -h / 2;

      if (isAttacking) {
        ctx.shadowColor = '#88ccff';
        ctx.shadowBlur  = 22;
      }
      ctx.drawImage(this._img, x, y, w, h);

    } else {
      // Canvas fallback — stylised katana silhouette
      const L = this.totalLen * this.scale;
      const grip = this.gripOffset * this.scale;

      // Handle
      ctx.fillStyle = '#2c1810';
      ctx.beginPath();
      ctx.roundRect(-grip, -5, grip * 0.6, 10, 3);
      ctx.fill();

      // Guard
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.ellipse(-grip * 0.4, 0, 8, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Blade (tapers to tip)
      const bladeStart = -grip * 0.4 + 8;
      const bladeEnd   = L - grip;
      ctx.save();
      const grad = ctx.createLinearGradient(bladeStart, -4, bladeEnd, 1);
      grad.addColorStop(0,   '#cccccc');
      grad.addColorStop(0.5, '#f0f0f0');
      grad.addColorStop(1,   '#e8e8e8');
      ctx.fillStyle = grad;
      if (isAttacking) { ctx.shadowColor = '#aadaff'; ctx.shadowBlur = 18; }
      ctx.beginPath();
      ctx.moveTo(bladeStart, -4);
      ctx.lineTo(bladeEnd,    0);
      ctx.lineTo(bladeStart,  4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }
}

// ─── SLASH ARC PARTICLE ───────────────────────────────────────────────────────

class SlashArc {
  constructor(x, y, angle, power) {
    this.x      = x;
    this.y      = y;
    this.angle  = angle;
    this.power  = power;
    this.r      = _rand(15, 35);
    this.maxR   = _rand(90, 200) * (0.5 + power * 0.5);
    this.arc    = _rand(0.6, 1.4);
    this.life   = 1.0;
    this.decay  = _rand(0.025, 0.055);
    this.thick  = _rand(2, 7) * (0.5 + power * 0.5);
    this.color  = power > 0.65
      ? `hsl(${_rInt(40,60)},100%,75%)`
      : `hsl(${_rInt(190,230)},100%,68%)`;
  }

  update() {
    this.r = _lerp(this.r, this.maxR, 0.14);
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = _clamp(this.life, 0, 1);
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = this.thick * this.life;
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r,
            this.angle - this.arc / 2,
            this.angle + this.arc / 2);
    ctx.stroke();
    ctx.restore();
  }

  get dead() { return this.life <= 0; }
}

// ─── SPARK PARTICLE ──────────────────────────────────────────────────────────

class Spark {
  constructor(x, y, power) {
    const spd   = _rand(3, 11) * (0.5 + power);
    const ang   = _rand(0, Math.PI * 2);
    this.x      = x;   this.y  = y;
    this.vx     = Math.cos(ang) * spd;
    this.vy     = Math.sin(ang) * spd - _rand(1, 4);
    this.life   = 1.0;
    this.decay  = _rand(0.04, 0.08);
    this.size   = _rand(1.5, 4.5) * (0.5 + power * 0.5);
    this.color  = power > 0.7
      ? `hsl(${_rInt(30,55)},100%,70%)`
      : `hsl(${_rInt(0,25)},100%,60%)`;
  }

  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.35;
    this.vx *= 0.95;
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha  = _clamp(this.life, 0, 1);
    ctx.fillStyle    = this.color;
    ctx.shadowColor  = this.color;
    ctx.shadowBlur   = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  get dead() { return this.life <= 0; }
}

// ─── STICKMAN (SOLID FILLED SILHOUETTE) ──────────────────────────────────────

class Stickman {
  /**
   * @param {number} x       – Root world X
   * @param {number} y       – Root world Y
   * @param {number} facing  – 1 = right, -1 = left
   * @param {string} fillColor   – Solid silhouette fill
   * @param {string} accentColor – Glow / accent (headband etc.)
   * @param {RealisticWeapon} weapon
   */
  constructor(x, y, facing, fillColor, accentColor, weapon) {
    this.rootX   = x;
    this.rootY   = y;
    this.facing  = facing;
    this.fill    = fillColor;
    this.accent  = accentColor;
    this.weapon  = weapon;

    // Live interpolated joints
    this.joints  = this._copyPose(POSES.IdleReady);

    // Pose state machine
    this._stateName   = 'IdleReady';
    this._srcPose     = POSES.IdleReady;
    this._dstPose     = POSES.IdleReady;
    this._poseT       = 1.0;
    this._poseSpeed   = 5.0;

    // Idle breathing
    this._breathT   = Math.random() * Math.PI * 2;
    this._breathAmp = 5;

    // VFX
    this.particles   = [];  // SlashArc + Spark
    this._shakePow   = 0;
    this._shake      = { x: 0, y: 0 };
    this._flashTimer = 0;
    this._isAttacking = false;
  }

  // ── Pose helpers ────────────────────────────────────────────────────────

  _copyPose(src) {
    const out = {};
    for (const k in src) out[k] = { x: src[k].x, y: src[k].y };
    return out;
  }

  _transitionTo(poseName, speed) {
    this._srcPose    = this._copyPose(this.joints);
    this._dstPose    = POSES[poseName];
    this._stateName  = poseName;
    this._poseSpeed  = speed;
    this._poseT      = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Trigger a random attack animation immediately.
   * Velocity drives VFX intensity (0..1).
   */
  attack() {
    const idx       = Math.floor(Math.random() * ATTACK_STATE_NAMES.length);
    const stateName = ATTACK_STATE_NAMES[idx];
    const isHV      = HIGH_VELOCITY[stateName] || false;
    const velocity  = isHV ? _rand(0.75, 1.0) : _rand(0.35, 0.65);

    const animSpeed = isHV ? _rand(14, 20) : _rand(7, 12);
    this._transitionTo(stateName, animSpeed);
    this._isAttacking = true;
    this._flashTimer  = 0.12;

    // After animation peaks: VFX + recover
    const peakMs  = (1 / animSpeed) * 700;
    const recoverMs = peakMs + 180;

    setTimeout(() => {
      this._spawnVFX(velocity);
      if (isHV) this._triggerShake(velocity);
    }, peakMs);

    setTimeout(() => {
      this._isAttacking = false;
      this._transitionTo('IdleReady', 4);
    }, recoverMs);

    return stateName;  // caller can log which move
  }

  /** Recoil (wrong key) */
  recoil() {
    this._flashTimer = 0.18;
    this._shakePow   = 0.35;
    // Quick lean-back by interpolating to BackstepDodge briefly
    this._transitionTo('BackstepDodge', 18);
    setTimeout(() => this._transitionTo('IdleReady', 5), 200);
  }

  /** Receive an opponent's hit */
  takeHit() {
    this._flashTimer = 0.22;
    this._shakePow   = 0.5;
    this._transitionTo('BackstepDodge', 12);
    setTimeout(() => this._transitionTo('IdleReady', 4), 320);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  update(dt) {
    // Breathing (only during idle)
    this._breathT += dt * 1.8;
    const bob = this._stateName === 'IdleReady'
      ? Math.sin(this._breathT) * this._breathAmp
      : 0;

    // Pose interpolation (ease-in-out)
    if (this._poseT < 1) {
      this._poseT = _clamp(this._poseT + dt * this._poseSpeed, 0, 1);
      const et = _easeInOut(this._poseT);
      for (const k in this._dstPose) {
        this.joints[k] = _vecLerp(this._srcPose[k], this._dstPose[k], et);
      }
    }

    // Apply breathing offset on top
    if (this._stateName === 'IdleReady') {
      for (const k in this.joints) {
        this.joints[k] = { x: this.joints[k].x, y: this.joints[k].y + bob * 0.35 };
      }
    }

    // Particles
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);

    // Screen shake
    if (this._shakePow > 0) {
      this._shakePow = Math.max(0, this._shakePow - dt * 9);
      const m = this._shakePow * 14;
      this._shake.x = _rand(-m, m);
      this._shake.y = _rand(-m, m);
    } else {
      this._shake.x = 0;
      this._shake.y = 0;
    }

    // Flash decay
    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  // ── Per-frame draw ────────────────────────────────────────────────────────

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    ctx.save();
    ctx.translate(
      this.rootX + this._shake.x,
      this.rootY + this._shake.y
    );
    ctx.scale(this.facing, 1);

    // Particles (world-space, drawn before body)
    this.particles.forEach(p => {
      ctx.save();
      // De-transform so particles are in world space
      ctx.scale(this.facing, 1);
      ctx.translate(-this.rootX, -this.rootY);
      p.draw(ctx);
      ctx.restore();
    });

    // Body
    this._drawSilhouette(ctx);

    // Weapon (on top of body)
    const j  = this.joints;
    const pw = this._worldJ('swordPivot');
    const tw = this._worldJ('swordTip');
    const showTrail = this._isAttacking;
    this.weapon.draw(
      ctx,
      pw.x, pw.y, tw.x, tw.y,
      showTrail,
      this.facing,
      this._isAttacking
    );

    ctx.restore();
  }

  // ── Private: world joint ─────────────────────────────────────────────────

  /** Convert local joint to world (already in root-relative space; facing flips X) */
  _worldJ(name) {
    const j = this.joints[name];
    return {
      x: this.rootX + j.x * this.facing + this._shake.x,
      y: this.rootY + j.y              + this._shake.y,
    };
  }

  // ── Private: solid silhouette drawing ────────────────────────────────────

  _drawSilhouette(ctx) {
    const j     = this.joints;
    const flash = this._flashTimer > 0;
    const fill  = flash ? '#ffffff' : this.fill;
    const glow  = flash ? 35 : 12;

    ctx.shadowColor = this.accent;
    ctx.shadowBlur  = glow;

    // Torso (solid capsule between shoulder and hip-centre)
    const hipCX = (j.hipR.x + j.hipL.x) / 2;
    const hipCY = (j.hipR.y + j.hipL.y) / 2;
    this._capsule(ctx, fill, j.neck, { x: hipCX, y: hipCY }, 14);

    // Arms
    this._capsule(ctx, fill, j.shoulder, j.elbowR, 7);
    this._capsule(ctx, fill, j.elbowR,   j.wristR,  6);
    this._capsule(ctx, fill, j.shoulder, j.elbowL, 7);
    this._capsule(ctx, fill, j.elbowL,   j.wristL,  6);

    // Legs
    this._capsule(ctx, fill, { x: hipCX, y: hipCY }, j.kneeR, 9);
    this._capsule(ctx, fill, j.kneeR, j.footR, 8);
    this._capsule(ctx, fill, { x: hipCX, y: hipCY }, j.kneeL, 9);
    this._capsule(ctx, fill, j.kneeL, j.footL, 8);

    // Foot pads
    this._oval(ctx, fill, j.footR, 14, 6);
    this._oval(ctx, fill, j.footL, 14, 6);

    // Head (filled circle)
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, 22, 0, Math.PI * 2);
    ctx.fillStyle   = fill;
    ctx.shadowBlur  = glow;
    ctx.shadowColor = this.accent;
    ctx.fill();

    // Ninja headband stripe
    ctx.save();
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, 22, -Math.PI * 0.65, -Math.PI * 0.05);
    ctx.lineWidth   = 7;
    ctx.strokeStyle = this.accent;
    ctx.shadowColor = this.accent;
    ctx.shadowBlur  = 20;
    ctx.stroke();
    ctx.restore();

    // Eye glint (two small white dots)
    const ex = j.head.x + 8 * this.facing;
    const ey = j.head.y + 3;
    ctx.save();
    ctx.fillStyle   = '#ffffff';
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draw a rounded rectangle (capsule) between two joints. */
  _capsule(ctx, fill, a, b, radius) {
    const dx  = b.x - a.x;
    const dy  = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;

    const ang = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(0, -radius, len, radius * 2, radius);
    ctx.fill();
    ctx.restore();
  }

  /** Draw a filled ellipse at a joint (for feet). */
  _oval(ctx, fill, p, rx, ry) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + ry * 0.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── VFX ──────────────────────────────────────────────────────────────────

  _spawnVFX(velocity) {
    const tp = this._worldJ('swordTip');
    const pp = this._worldJ('swordPivot');
    const angle = Math.atan2(tp.y - pp.y, tp.x - pp.x);

    const sparkCount = Math.floor(_lerp(8, 30, velocity));
    for (let i = 0; i < sparkCount; i++) {
      this.particles.push(new Spark(tp.x, tp.y, velocity));
    }

    const arcCount = velocity > 0.65 ? (velocity > 0.85 ? 4 : 2) : 1;
    for (let i = 0; i < arcCount; i++) {
      this.particles.push(new SlashArc(tp.x, tp.y, angle, velocity));
    }
  }

  _triggerShake(power) {
    this._shakePow = _clamp(power, 0, 1);
  }
}

// ─── LETTER BURST SYSTEM ─────────────────────────────────────────────────────

class LetterBurst {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Function} onCorrect  – called when correct key pressed
   * @param {Function} onWrong    – called when wrong key pressed
   */
  constructor(canvas, onCorrect, onWrong) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.onCorrect = onCorrect;
    this.onWrong   = onWrong;

    this._letter  = '';
    this._visible = false;
    this._scale   = 1.0;   // used for a tiny pop-in
    this._popT    = 0;

    this._pool    = 'ASDFJKLQWERTYUIOPZXCVBNM'; // home-row biased

    this._boundKeyDown = this._onKey.bind(this);
    window.addEventListener('keydown', this._boundKeyDown);
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
  }

  /** Spawn the next letter immediately. */
  spawn() {
    this._letter  = this._pool[_rInt(0, this._pool.length - 1)];
    this._visible = true;
    this._popT    = 0;
  }

  update(dt) {
    if (!this._visible) return;
    // Pop-in: fast spring (reaches scale 1 in ~100 ms)
    this._popT = _clamp(this._popT + dt * 18, 0, 1);
    this._scale = _easeOut(this._popT);
  }

  draw() {
    if (!this._visible || this._scale < 0.01) return;
    const { ctx, canvas } = this;
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this._scale, this._scale);

    // Glow halo
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur  = 60;

    // Letter
    ctx.font         = 'bold 160px "Outfit", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.fillText(this._letter, 0, 0);

    // Subtle outline
    ctx.shadowBlur   = 0;
    ctx.strokeStyle  = 'rgba(255,51,51,0.6)';
    ctx.lineWidth    = 3;
    ctx.strokeText(this._letter, 0, 0);

    ctx.restore();
  }

  _onKey(e) {
    if (!this._visible) return;
    if (e.key.length !== 1) return;   // ignore Shift, Enter, etc.

    const pressed = e.key.toUpperCase();
    this._visible = false;            // remove instantly (no fade)

    if (pressed === this._letter) {
      this.onCorrect(this._letter);
    } else {
      this.onWrong(this._letter, pressed);
    }
  }

  get letter() { return this._letter; }
}

// ─── DUAL COMBAT SCENE (MASTER ORCHESTRATOR) ─────────────────────────────────

class DualCombatScene {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.running = false;
    this._raf    = null;
    this._last   = 0;

    const W = canvas.width;
    const H = canvas.height;

    // Shared realistic katana asset
    const katana = new RealisticWeapon('assets/katana.png', 260, 50);

    // Player 1 – left side, blue-accented
    this.p1 = new Stickman(
      W * 0.26, H * 0.72,
       1,
      '#1a1a2e',   // dark navy silhouette
      '#3498db',   // blue accent glow
      katana
    );

    // Player 2 – right side, red-accented (shares same asset instance)
    this.p2 = new Stickman(
      W * 0.74, H * 0.72,
      -1,
      '#1a0000',   // dark crimson silhouette
      '#e74c3c',   // red accent glow
      katana
    );

    this._floorY = H * 0.78;

    // Letter burst
    this._burst = new LetterBurst(
      canvas,
      (letter) => this._onCorrect(letter),
      (letter, pressed) => this._onWrong(letter, pressed)
    );

    // Global VFX
    this._globalParticles = [];

    // Stats exposed for HUD
    this.stats = {
      p1Correct: 0, p1Wrong: 0,
      p2Correct: 0, p2Wrong: 0,
      lastMove: '—',
    };
  }

  start() {
    this.running = true;
    this._last   = performance.now();
    this._burst.spawn();
    requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this.running = false;
    this._burst.destroy();
  }

  // ── Letter burst callbacks ─────────────────────────────────────────────

  _onCorrect(letter) {
    const moveName = this.p1.attack();
    this.stats.p1Correct++;
    this.stats.lastMove = moveName;

    // Notify game.js for server sync & HUD update
    if (typeof onLetterCorrect === 'function') onLetterCorrect(moveName);

    // Enemy takes hit after a short delay (travel time illusion)
    const delay = moveName === 'LungeAttack' ? 120
                : moveName === 'HeavyDecapitationSwing' ? 380 : 210;
    setTimeout(() => this.p2.takeHit(), delay);

    // Spawn next letter after a brief pause (snappy feel)
    setTimeout(() => this._burst.spawn(), 310);
  }

  _onWrong(letter, pressed) {
    this.p1.recoil();
    this.stats.p1Wrong++;

    // Notify game.js for combo reset
    if (typeof onLetterWrong === 'function') onLetterWrong();

    // Spawn next letter quickly
    setTimeout(() => this._burst.spawn(), 250);
  }

  // ── External API (for multiplayer / server sync) ────────────────────────

  /** Called when server says the enemy has attacked */
  triggerEnemyAttack() {
    this.p2.attack();
    setTimeout(() => this.p1.takeHit(), 200);
  }

  updateHealthBars(myPct, enemyPct) {
    // DOM bars are still driven by game.js / server state
    const myEl = document.getElementById('my-health');
    const enEl = document.getElementById('enemy-health');
    if (myEl) myEl.style.width = `${Math.max(0, myPct)}%`;
    if (enEl) enEl.style.width = `${Math.max(0, enemyPct)}%`;
  }

  /** game.js compatibility shim — triggers p1 attack */
  triggerLocalAttack(wpm, wordLength) {
    this.p1.attack();
    setTimeout(() => this.p2.takeHit(), 180);
  }

  // ── Game Loop ──────────────────────────────────────────────────────────

  _loop(now) {
    if (!this.running) return;
    const dt = _clamp((now - this._last) / 1000, 0, 0.05);
    this._last = now;

    this.p1.update(dt);
    this.p2.update(dt);
    this._burst.update(dt);

    this._globalParticles.forEach(p => p.update());
    this._globalParticles = this._globalParticles.filter(p => !p.dead);

    this._draw();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Atmospheric background
    const bg = ctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.5, 40,
      canvas.width / 2, canvas.height * 0.5, canvas.width * 0.75
    );
    bg.addColorStop(0, 'rgba(28, 4, 4, 0.96)');
    bg.addColorStop(1, 'rgba(4, 0, 0, 0.99)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor glow
    const floorGrad = ctx.createLinearGradient(0, this._floorY - 30, 0, this._floorY + 50);
    floorGrad.addColorStop(0, 'rgba(255, 51, 51, 0.18)');
    floorGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, this._floorY - 30, canvas.width, 80);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 51, 51, 0.45)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.moveTo(0, this._floorY);
    ctx.lineTo(canvas.width, this._floorY);
    ctx.stroke();
    ctx.restore();

    // Centre dashed divider
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([8, 18]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.restore();

    // Stickmen (drawn in world Z-order: p2 behind, p1 front when facing each other)
    this.p2.draw(ctx);
    this.p1.draw(ctx);

    // Global particles
    this._globalParticles.forEach(p => p.draw(ctx));

    // Letter burst (drawn last — always on top)
    this._burst.draw();
  }
}

// ─── SINGLE-PLAYER COMBAT ENGINE WRAPPER ─────────────────────────────────────

class CombatEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} playerSide – 1 = local player; used for future multiplayer
   */
  constructor(canvas, playerSide = 1) {
    this._scene = new DualCombatScene(canvas);
  }

  start()  { this._scene.start(); }
  stop()   { this._scene.stop();  }

  get stats() { return this._scene.stats; }

  // Passthrough for game.js compatibility
  triggerLocalAttack(wpm, wordLength) { this._scene.triggerLocalAttack(wpm, wordLength); }
  triggerEnemyAttack()                 { this._scene.triggerEnemyAttack(); }
  updateHealthBars(my, enemy)          { this._scene.updateHealthBars(my, enemy); }
}

// ─── GLOBAL EXPORTS ──────────────────────────────────────────────────────────

window.CombatEngine      = CombatEngine;
window.DualCombatScene   = DualCombatScene;
window.Stickman          = Stickman;
window.RealisticWeapon   = RealisticWeapon;
window.LetterBurst       = LetterBurst;
