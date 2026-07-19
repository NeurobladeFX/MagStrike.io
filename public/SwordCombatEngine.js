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
  IdleStance: {
    root: {x: 0, y: 0},
    head:       {x: 0, y: -240}, neck: {x: 0, y: -210}, shoulder: {x: 0, y: -195},
    elbowR:     {x: 35, y: -170}, wristR: {x: 55, y: -145},
    elbowL:     {x: -30, y: -170}, wristL: {x: -45, y: -140},
    hipR:       {x: 15, y: -110}, kneeR: {x: 20, y: -55}, footR: {x: 25, y: 0},
    hipL:       {x: -15, y: -110}, kneeL: {x: -20, y: -55}, footL: {x: -25, y: 0},
    swordPivot: {x: 55, y: -145}, swordTip: {x: 110, y: -170},
  },
  HorizontalLunge: {
    root: {x: 120, y: 0}, 
    head:       {x: 60, y: -218}, neck: {x: 48, y: -194}, shoulder: {x: 30, y: -180},
    elbowR:     {x: 100, y: -182}, wristR: {x: 162, y: -184},
    elbowL:     {x: 2, y: -158}, wristL: {x: -18, y: -130},
    hipR:       {x: 38, y: -110}, kneeR: {x: 82, y: -62}, footR: {x: 125, y: 0},
    hipL:       {x: -22, y: -110}, kneeL: {x: -52, y: -66}, footL: {x: -82, y: 0},
    swordPivot: {x: 162, y: -184}, swordTip: {x: 280, y: -184},
  },
  OverheadCleave: {
    root: {x: 40, y: 0}, 
    head:       {x: 12, y: -242}, neck: {x: 8, y: -214}, shoulder: {x: 5, y: -198},
    elbowR:     {x: 42, y: -265}, wristR: {x: 60, y: -305},
    elbowL:     {x: 18, y: -245}, wristL: {x: 35, y: -290},
    hipR:       {x: 22, y: -110}, kneeR: {x: 28, y: -55}, footR: {x: 35, y: 0},
    hipL:       {x: -18, y: -110}, kneeL: {x: -22, y: -55}, footL: {x: -26, y: 0},
    swordPivot: {x: 60, y: -305}, swordTip: {x: 62, y: -120},
  },
  SpinSlash: {
    root: {x: 80, y: 0},
    head:       {x: -10, y: -238}, neck: {x: -6, y: -209}, shoulder: {x: -4, y: -193},
    elbowR:     {x: 90, y: -193}, wristR: {x: 145, y: -192},
    elbowL:     {x: -80, y: -193}, wristL: {x: -130, y: -190},
    hipR:       {x: 20, y: -110}, kneeR: {x: 50, y: -50}, footR: {x: 75, y: 0},
    hipL:       {x: -20, y: -110}, kneeL: {x: -10, y: -45}, footL: {x: 0, y: 0},
    swordPivot: {x: 145, y: -192}, swordTip: {x: 245, y: -192},
  },
  RisingCrescent: {
    root: {x: 30, y: 0},
    head:       {x: 18, y: -234}, neck: {x: 14, y: -207}, shoulder: {x: 10, y: -192},
    elbowR:     {x: 20, y: -130}, wristR: {x: 30, y: -82},
    elbowL:     {x: -22, y: -170}, wristL: {x: -38, y: -140},
    hipR:       {x: 25, y: -110}, kneeR: {x: 40, y: -58}, footR: {x: 50, y: 0},
    hipL:       {x: -18, y: -110}, kneeL: {x: -30, y: -60}, footL: {x: -40, y: 0},
    swordPivot: {x: 30, y: -82}, swordTip: {x: 140, y: -220},
  },
  LowBlock: {
    root: {x: 0, y: 0},
    head:       {x: 5, y: -180}, neck: {x: 3, y: -158}, shoulder: {x: 2, y: -145},
    elbowR:     {x: 40, y: -128}, wristR: {x: 62, y: -112},
    elbowL:     {x: -28, y: -130}, wristL: {x: -50, y: -114},
    hipR:       {x: 30, y: -80}, kneeR: {x: 55, y: -42}, footR: {x: 70, y: 0},
    hipL:       {x: -26, y: -80}, kneeL: {x: -48, y: -42}, footL: {x: -62, y: 0},
    swordPivot: {x: 62, y: -112}, swordTip: {x: 140, y: -60},
  },
  HighParry: {
    root: {x: -10, y: 0},
    head:       {x: -5, y: -238}, neck: {x: -3, y: -209}, shoulder: {x: -2, y: -193},
    elbowR:     {x: 50, y: -230}, wristR: {x: 72, y: -262},
    elbowL:     {x: -20, y: -210}, wristL: {x: -38, y: -240},
    hipR:       {x: 20, y: -110}, kneeR: {x: 30, y: -55}, footR: {x: 38, y: 0},
    hipL:       {x: -18, y: -110}, kneeL: {x: -25, y: -55}, footL: {x: -32, y: 0},
    swordPivot: {x: 72, y: -262}, swordTip: {x: 110, y: -320},
  },
  DashRetreat: {
    root: {x: -60, y: 0},
    head:       {x: -45, y: -232}, neck: {x: -35, y: -205}, shoulder: {x: -25, y: -190},
    elbowR:     {x: 15, y: -170}, wristR: {x: 40, y: -148},
    elbowL:     {x: -60, y: -168}, wristL: {x: -82, y: -145},
    hipR:       {x: -10, y: -110}, kneeR: {x: -15, y: -55}, footR: {x: -18, y: 0},
    hipL:       {x: 10, y: -110}, kneeL: {x: 55, y: -60}, footL: {x: 90, y: 0},
    swordPivot: {x: 40, y: -148}, swordTip: {x: 90, y: -172},
  },
  ForwardRoll: {
    root: {x: 150, y: -30}, 
    head:       {x: 50, y: -80}, neck: {x: 35, y: -65}, shoulder: {x: 20, y: -52},
    elbowR:     {x: 15, y: -20}, wristR: {x: 22, y: 5},
    elbowL:     {x: -5, y: -25}, wristL: {x: -8, y: -2},
    hipR:       {x: 10, y: -12}, kneeR: {x: -5, y: 25}, footR: {x: -18, y: 50},
    hipL:       {x: -8, y: -18}, kneeL: {x: 25, y: 18}, footL: {x: 45, y: 42},
    swordPivot: {x: 22, y: 5}, swordTip: {x: 80, y: 0},
  },
  DecapitationSwing: {
    root: {x: 90, y: 0},
    head:       {x: 25, y: -228}, neck: {x: 20, y: -203}, shoulder: {x: 14, y: -188},
    elbowR:     {x: 120, y: -200}, wristR: {x: 195, y: -202},
    elbowL:     {x: 105, y: -196}, wristL: {x: 175, y: -198},
    hipR:       {x: 30, y: -110}, kneeR: {x: 60, y: -60}, footR: {x: 90, y: 0},
    hipL:       {x: -28, y: -110}, kneeL: {x: -50, y: -62}, footL: {x: -80, y: 0},
    swordPivot: {x: 195, y: -202}, swordTip: {x: 320, y: -204},
  },
  Collapse: {
    root: {x: -40, y: 0},
    head:       {x: -120, y: -30}, neck: {x: -100, y: -20}, shoulder: {x: -80, y: -15},
    elbowR:     {x: -40, y: -5}, wristR: {x: -10, y: -2},
    elbowL:     {x: -60, y: -10}, wristL: {x: -30, y: -5},
    hipR:       {x: 20, y: -10}, kneeR: {x: 60, y: -15}, footR: {x: 100, y: 0},
    hipL:       {x: 10, y: -5}, kneeL: {x: 40, y: -10}, footL: {x: 80, y: 0},
    swordPivot: {x: -10, y: -2}, swordTip: {x: 60, y: 5},
  }
};

const ATTACK_NAMES = Object.keys(POSES).filter(n => n !== 'IdleStance' && n !== 'Collapse');

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
    this.health  = 100;
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
    if (this.health <= 0) return 'None';

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
      if (this.health <= 0) return;
      const tp = this._worldJ('swordTip');
      const pp = this._worldJ('swordPivot');
      this._spawnVFX(tp, pp, vel);
      if (hv) this._shakePow = vel;
    }, peakMs);

    setTimeout(() => {
      if (this.health <= 0) return;
      this._attacking = false;
      this._go('IdleStance', 4);
    }, recoverMs);

    return name;
  }

  recoil() {
    if (this.health <= 0) return;
    this._flashTimer = 0.2;
    this._shakePow   = 0.3;
    this._go('DashRetreat', 16);
    setTimeout(() => { if (this.health > 0) this._go('IdleStance', 4); }, 220);
  }

  takeHit() {
    if (this.health <= 0) return;
    this._flashTimer = 0.24;
    this._shakePow   = 0.5;
    this._go('DashRetreat', 12);
    setTimeout(() => { if (this.health > 0) this._go('IdleStance', 4); }, 340);
  }

  die() {
    this.health = 0;
    this._attacking = false;
    this._go('Collapse', 8);
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
    const r = this.J.root;
    // Root is offset by r.x, and sits on groundY + r.y
    const rx = this.rootX + r.x * this.facing + this._shake.x;
    const ry = this.groundY + r.y + this._shake.y;

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

    // Don't draw weapon if dead/collapsed
    if (this.health <= 0) return;

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
    const r = this.J.root;
    return {
      x: this.rootX + (r.x + j.x) * this.facing + this._shake.x,
      y: this.groundY + r.y + j.y + this._shake.y,
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

    // Player 1 — left, vibrant blue
    this.p1 = new Stickman(W * 0.26, this.GROUND_Y,  1, '#1e90ff', '#88ccff', katana);
    // Player 2 — right, vibrant red
    this.p2 = new Stickman(W * 0.74, this.GROUND_Y, -1, '#e74c3c', '#ff8888', katana);

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

    if (myPct <= 0 && this.p1.health > 0) this.p1.die();
    if (enemyPct <= 0 && this.p2.health > 0) this.p2.die();

    this.p1.health = myPct;
    this.p2.health = enemyPct;
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
