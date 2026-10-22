const DEG = Math.PI / 180;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Reads device tilt as "which way is world-up, expressed in the phone's own axes"
// (x = right edge, y = top edge, z = out of the screen), then measures tilt
// relative to the pose captured by calibrate().
export class TiltInput {
  constructor() {
    this.up = null;
    this.lastEvent = 0;
    this.base = null;
    this.ex = null;
    this.ey = null;
    this.maxTilt = 20;
    this.deadZone = 1.2;
    window.addEventListener('deviceorientation', (e) => this.handle(e));
  }

  get hasData() {
    return this.up !== null && performance.now() - this.lastEvent < 1000;
  }

  // Must be called synchronously from a tap handler on iOS.
  async requestPermission() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      try {
        return (await D.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  handle(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * DEG, g = e.gamma * DEG;
    this.up = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(b) * Math.cos(g)];
    this.lastEvent = performance.now();
  }

  calibrate(up = this.up) {
    if (!up) return;
    const n = norm(up);
    let ex, ey;
    // Build screen-aligned axes perpendicular to the neutral "up"; pick the
    // construction that stays well-defined however the phone is held.
    if (Math.abs(n[1]) <= Math.abs(n[0])) {
      ey = norm([-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]]);
      ex = cross(ey, n);
    } else {
      ex = norm([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]);
      ey = cross(n, ex);
    }
    this.base = n;
    this.ex = ex;
    this.ey = ey;
  }

  get calibrated() {
    return this.base !== null;
  }

  // x > 0: right side lowered, y > 0: top edge lowered (away from you). Range -1..1.
  read() {
    if (!this.up || !this.base) return { x: 0, y: 0 };
    const shape = (v) => {
      let a = Math.asin(clamp(v, -1, 1)) / DEG;
      const s = Math.sign(a);
      a = Math.max(0, Math.abs(a) - this.deadZone);
      return s * Math.min(1, a / (this.maxTilt - this.deadZone));
    };
    let x = shape(-dot(this.up, this.ex));
    let y = shape(-dot(this.up, this.ey));
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}

export function angleBetween(a, b) {
  return Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)) / DEG;
}
