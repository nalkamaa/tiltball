export const BALL_R = 0.5;

const G = 22;
const ACCEL = 15;
const AIR_CONTROL = 0.5;
const ROLL_DAMP = 0.4;
const AIR_DAMP = 0.05;
const MAX_SPEED = 16;
const MAX_FALL = 30;
// A surface up to this far above the ball's bottom can still be stepped onto.
const STEP_UP = 0.3;
// While rolling, stay glued to surfaces that drop away by less than this per step.
const STICK = 0.15;
// Box sides only act as walls when their top is at least this far above the ball's bottom.
const WALL_MIN = 0.25;
const BUMPER_KICK = 9;
const BAR_R = 0.2;
const POST_R = 0.3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createBall(start) {
  return {
    pos: { x: start.x, y: start.y + BALL_R, z: start.z },
    vel: { x: 0, y: 0, z: 0 },
    ground: null,
    slope: { gx: 0, gz: 0 },
    support: null,
  };
}

export class World {
  constructor(level) {
    this.level = level;
    this.surfaces = [];
    this.bumpers = [];
    this.sweepers = [];
    this.time = 0;
    let minY = Infinity;
    for (const p of level.parts) {
      if (p.type === 'box') {
        const thick = p.thick ?? 1;
        this.surfaces.push({
          kind: 'box', p, w: p.w, d: p.d, top: p.y, bottom: p.y - thick,
          cx: p.x, cz: p.z, dx: 0, dz: 0, move: p.move || null, rail: !!p.rail,
        });
        minY = Math.min(minY, p.y - thick);
      } else if (p.type === 'ramp') {
        this.surfaces.push({
          kind: 'ramp', p, w: p.w, d: p.d, cx: p.x, cz: p.z,
          y0: p.y0, y1: p.y1, axis: p.axis, dx: 0, dz: 0,
        });
        minY = Math.min(minY, p.y0, p.y1);
      } else if (p.type === 'bumper') {
        this.bumpers.push({ ...p, hit: 0 });
      } else if (p.type === 'sweeper') {
        this.sweepers.push({ ...p, angle: p.phase });
      }
    }
    this.minY = minY;
  }

  advance(dt) {
    this.time += dt;
    for (const s of this.surfaces) {
      if (!s.move) continue;
      const m = s.move;
      const off = m.amp * Math.sin(m.speed * this.time + m.phase);
      const nx = s.p.x + (m.axis === 'x' ? off : 0);
      const nz = s.p.z + (m.axis === 'z' ? off : 0);
      s.dx = nx - s.cx;
      s.dz = nz - s.cz;
      s.cx = nx;
      s.cz = nz;
    }
    for (const sw of this.sweepers) sw.angle = sw.phase + sw.speed * this.time;
    for (const b of this.bumpers) b.hit = Math.max(0, b.hit - dt);
  }

  surfaceHeight(s, x, z) {
    const hw = s.w / 2, hd = s.d / 2;
    if (x < s.cx - hw || x > s.cx + hw || z < s.cz - hd || z > s.cz + hd) return null;
    if (s.kind === 'box') return { h: s.top, gx: 0, gz: 0, s };
    if (s.axis === 'z') {
      const k = (s.y1 - s.y0) / s.d;
      return { h: s.y0 + (z - (s.cz - hd)) * k, gx: 0, gz: k, s };
    }
    const k = (s.y1 - s.y0) / s.w;
    return { h: s.y0 + (x - (s.cx - hw)) * k, gx: k, gz: 0, s };
  }

  supportAt(x, z, maxH) {
    let best = null;
    for (const s of this.surfaces) {
      const r = this.surfaceHeight(s, x, z);
      if (r && r.h <= maxH && (!best || r.h > best.h)) best = r;
    }
    return best;
  }

  // ix/iz: desired acceleration direction in world space, magnitude 0..1.
  step(ball, ix, iz, dt, events) {
    this.advance(dt);
    const p = ball.pos, v = ball.vel;

    if (ball.ground && ball.ground.move) {
      p.x += ball.ground.dx;
      p.z += ball.ground.dz;
    }

    let ax = ix * ACCEL, az = iz * ACCEL;
    if (ball.ground) {
      const { gx, gz } = ball.slope;
      const k = G / (1 + gx * gx + gz * gz);
      ax -= gx * k;
      az -= gz * k;
      const damp = Math.max(0, 1 - ROLL_DAMP * dt);
      v.x *= damp;
      v.z *= damp;
    } else {
      ax *= AIR_CONTROL;
      az *= AIR_CONTROL;
      v.y = Math.max(-MAX_FALL, v.y - G * dt);
      const damp = 1 - AIR_DAMP * dt;
      v.x *= damp;
      v.z *= damp;
    }
    v.x += ax * dt;
    v.z += az * dt;
    const sp = Math.hypot(v.x, v.z);
    if (sp > MAX_SPEED) {
      v.x *= MAX_SPEED / sp;
      v.z *= MAX_SPEED / sp;
    }

    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    this.collideWalls(ball, events);
    this.collideObstacles(ball, events);

    const bottom = p.y - BALL_R;
    const sup = this.supportAt(p.x, p.z, bottom + STEP_UP);
    ball.support = sup;
    if (sup && (bottom <= sup.h + 0.001 || (ball.ground && bottom - sup.h < STICK))) {
      if (!ball.ground && v.y < -7) {
        p.y = sup.h + BALL_R;
        v.y = -v.y * 0.35;
        ball.ground = null;
        events.push('land');
      } else {
        p.y = sup.h + BALL_R;
        v.y = 0;
        ball.ground = sup.s;
        ball.slope = sup;
      }
    } else {
      ball.ground = null;
    }
  }

  collideWalls(ball, events) {
    const p = ball.pos, v = ball.vel;
    const bottom = p.y - BALL_R, top = p.y + BALL_R;
    for (const s of this.surfaces) {
      if (s.kind !== 'box') continue;
      if (s.top - bottom <= WALL_MIN || top <= s.bottom) continue;
      const hw = s.w / 2, hd = s.d / 2;
      const qx = clamp(p.x, s.cx - hw, s.cx + hw);
      const qz = clamp(p.z, s.cz - hd, s.cz + hd);
      let nx = p.x - qx, nz = p.z - qz;
      let dist = Math.hypot(nx, nz);
      if (dist >= BALL_R) continue;
      if (dist < 1e-6) {
        const dl = p.x - (s.cx - hw), dr = s.cx + hw - p.x;
        const db = p.z - (s.cz - hd), df = s.cz + hd - p.z;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) { nx = -1; nz = 0; dist = -dl; }
        else if (m === dr) { nx = 1; nz = 0; dist = -dr; }
        else if (m === db) { nx = 0; nz = -1; dist = -db; }
        else { nx = 0; nz = 1; dist = -df; }
      } else {
        nx /= dist;
        nz /= dist;
      }
      const push = BALL_R - dist;
      p.x += nx * push;
      p.z += nz * push;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        v.x -= 1.5 * vn * nx;
        v.z -= 1.5 * vn * nz;
        if (vn < -3) events.push('bump');
      }
    }
  }

  collideObstacles(ball, events) {
    const p = ball.pos, v = ball.vel;

    const circle = (cx, cz, r, kick) => {
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      const min = BALL_R + r;
      if (d >= min || d < 1e-6) return false;
      const nx = dx / d, nz = dz / d;
      p.x += nx * (min - d);
      p.z += nz * (min - d);
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        v.x -= 1.8 * vn * nx;
        v.z -= 1.8 * vn * nz;
      }
      v.x += nx * kick;
      v.z += nz * kick;
      return true;
    };

    for (const b of this.bumpers) {
      if (p.y - BALL_R > b.y + 1 || p.y + BALL_R < b.y) continue;
      if (circle(b.x, b.z, b.r, BUMPER_KICK)) {
        b.hit = 0.25;
        events.push('bumper');
      }
    }

    for (const sw of this.sweepers) {
      if (p.y - BALL_R > sw.y + 1.3 || p.y + BALL_R < sw.y) continue;
      circle(sw.x, sw.z, POST_R, 0);

      const c = Math.cos(sw.angle), s = Math.sin(sw.angle);
      const t = clamp((p.x - sw.x) * c + (p.z - sw.z) * s, -sw.len, sw.len);
      const qx = sw.x + c * t, qz = sw.z + s * t;
      let nx = p.x - qx, nz = p.z - qz;
      const d = Math.hypot(nx, nz);
      const min = BALL_R + BAR_R;
      if (d >= min || d < 1e-6) continue;
      nx /= d;
      nz /= d;
      p.x += nx * (min - d);
      p.z += nz * (min - d);
      const bvx = -sw.speed * s * t, bvz = sw.speed * c * t;
      const vn = (v.x - bvx) * nx + (v.z - bvz) * nz;
      if (vn < 0) {
        v.x -= 1.6 * vn * nx;
        v.z -= 1.6 * vn * nz;
        if (vn < -2) events.push('bump');
      }
    }
  }
}
