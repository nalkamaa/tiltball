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
    // How the phone is turned relative to an upright portrait view, in degrees:
    // 0 upright, 90 top edge pointing left, -90 top edge pointing right, 180 upside down.
    // `hold` is null while the phone lies too flat to tell.
    this.hold = null;
    this.lastHold = null;
    // The hold the player's view is drawn for; read() reports tilt in that frame.
    this.viewAngle = 0;
    window.addEventListener('deviceorientation', (e) => this.handle(e));
  }

  // Call once per frame.
  trackHold() {
    if (!this.hasData) {
      this.hold = null;
      return;
    }
    const [x, y] = this.up;
    const mag = Math.hypot(x, y);
    if (mag < Math.sin(12 * DEG)) {
      this.hold = null;
      return;
    }
    const deg = Math.atan2(x, y) / DEG;
    const dist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    // Switch only on a clear signal, so a phone held fairly flat and tilted hard
    // sideways during play is not mistaken for being turned.
    const d = this.lastHold === null ? 180 : dist(deg, this.lastHold);
    if (d > 80 || (d > 55 && mag > Math.sin(30 * DEG))) {
      let q = Math.round(deg / 90) * 90;
      if (q === -180) q = 180;
      this.lastHold = q;
    }
    this.hold = this.lastHold;
  }

  // World-up expressed in the player's view frame for a given hold angle.
  upInView(angle = this.viewAngle) {
    if (!this.up) return null;
    const [x, y, z] = this.up;
    const c = Math.round(Math.cos(angle * DEG)), s = Math.round(Math.sin(angle * DEG));
    return [x * c - y * s, x * s + y * c, z];
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

  // In the player's view: x > 0 right side lowered, y > 0 far edge lowered. Range -1..1.
  read() {
    if (!this.up || !this.base) return { x: 0, y: 0 };
    const shape = (v) => {
      let a = Math.asin(clamp(v, -1, 1)) / DEG;
      const s = Math.sign(a);
      a = Math.max(0, Math.abs(a) - this.deadZone);
      return s * Math.min(1, a / (this.maxTilt - this.deadZone));
    };
    const dx = shape(-dot(this.up, this.ex));
    const dy = shape(-dot(this.up, this.ey));
    const c = Math.round(Math.cos(this.viewAngle * DEG)), s = Math.round(Math.sin(this.viewAngle * DEG));
    let x = dx * c - dy * s;
    let y = dx * s + dy * c;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}

export function angleBetween(a, b) {
  return Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)) / DEG;
}
