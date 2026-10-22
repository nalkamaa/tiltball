import { angleBetween } from './input.js';

const $ = (id) => document.getElementById(id);
const DEG = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const HOLD_SECONDS = 1.5;
const MAX_ROLL = 4;
const PITCH_MIN = -5;
const PITCH_MAX = 55;
const STEADY_DEG = 2.5;
const BUBBLE_PX_PER_DEG = 3;
const BUBBLE_MAX_PX = 62;

const PRACTICE_TARGETS = [
  { x: 0.72, y: 0, text: 'Tilt the <b>right side down</b>' },
  { x: -0.72, y: 0, text: 'Tilt the <b>left side down</b>' },
  { x: 0, y: -0.72, text: 'Tilt the <b>top away</b> from you' },
  { x: 0, y: 0.72, text: 'Tilt the <b>top toward</b> you' },
];

export class Onboarding {
  constructor(tilt, sfx) {
    this.tilt = tilt;
    this.sfx = sfx;
    this.mode = null;
  }

  get active() {
    return this.mode !== null;
  }

  startHold(onDone) {
    this.mode = 'hold';
    this.onDone = onDone;
    this.t = 0;
    this.progress = 0;
    this.history = [];
    $('hold-nosensor').classList.add('hidden');
    $('hold-progress-fill').style.width = '0%';
  }

  startPractice(onDone) {
    this.mode = 'practice';
    this.onDone = onDone;
    this.idx = 0;
    this.doneT = -1;
    this.dot = { x: 0, y: 0, vx: 0, vy: 0 };
    this.showTarget();
  }

  skip() {
    if (this.mode === 'practice') this.finish();
  }

  finish() {
    const cb = this.onDone;
    this.mode = null;
    this.onDone = null;
    cb && cb();
  }

  update(dt, inp) {
    if (this.mode === 'hold') this.updateHold(dt);
    else if (this.mode === 'practice') this.updatePractice(dt, inp);
  }

  updateHold(dt) {
    this.t += dt;
    const status = $('hold-status');
    const bubble = $('bubble');
    if (!this.tilt.hasData) {
      status.textContent = 'Waiting for the motion sensor…';
      if (this.t > 2.5) $('hold-nosensor').classList.remove('hidden');
      return;
    }
    $('hold-nosensor').classList.add('hidden');

    const up = this.tilt.up;
    const now = performance.now();
    this.history.push({ t: now, u: up.slice() });
    while (this.history.length && now - this.history[0].t > 800) this.history.shift();

    const roll = Math.asin(clamp(up[0], -1, 1)) * DEG;
    const pitch = Math.atan2(up[1], up[2]) * DEG;
    let maxDev = 0;
    for (const h of this.history) maxDev = Math.max(maxDev, angleBetween(h.u, up));
    const covered = this.history.length > 5 && now - this.history[0].t > 600;
    const steady = covered && maxDev < STEADY_DEG;
    const rollOk = Math.abs(roll) < MAX_ROLL;
    const pitchOk = pitch > PITCH_MIN && pitch < PITCH_MAX;

    // Bubble drifts toward the raised side, like a real spirit level.
    let pitchErr = 0;
    if (pitch > PITCH_MAX) pitchErr = -(pitch - PITCH_MAX);
    else if (pitch < PITCH_MIN) pitchErr = -(pitch - PITCH_MIN);
    const bx = clamp(roll * BUBBLE_PX_PER_DEG, -BUBBLE_MAX_PX, BUBBLE_MAX_PX);
    const by = clamp(pitchErr * BUBBLE_PX_PER_DEG, -BUBBLE_MAX_PX, BUBBLE_MAX_PX);
    bubble.style.transform = `translate(${bx}px, ${by}px)`;

    const ok = steady && rollOk && pitchOk;
    bubble.classList.toggle('ok', rollOk && pitchOk);

    if (pitch > PITCH_MAX) status.textContent = 'Hold the phone a bit flatter';
    else if (pitch < PITCH_MIN) status.textContent = 'Lift the top edge up a little';
    else if (!rollOk) status.textContent = roll < 0 ? 'Raise the right side a little' : 'Raise the left side a little';
    else if (!steady) status.textContent = 'Hold still…';
    else status.textContent = 'Perfect — keep holding…';

    this.progress = ok
      ? Math.min(1, this.progress + dt / HOLD_SECONDS)
      : Math.max(0, this.progress - dt * 1.5);
    $('hold-progress-fill').style.width = `${Math.round(this.progress * 100)}%`;

    if (this.progress >= 1) {
      const avg = [0, 0, 0];
      for (const h of this.history) { avg[0] += h.u[0]; avg[1] += h.u[1]; avg[2] += h.u[2]; }
      this.tilt.calibrate(avg);
      this.sfx.pop();
      status.textContent = 'Calibrated!';
      this.finish();
    }
  }

  showTarget() {
    const t = PRACTICE_TARGETS[this.idx];
    $('practice-text').innerHTML = t.text;
    $('practice-step').textContent = `${this.idx + 1} / ${PRACTICE_TARGETS.length}`;
    this.placeEl($('ptarget'), t.x, t.y);
    $('ptarget').classList.remove('hidden');
  }

  placeEl(el, x, y) {
    const arena = $('arena');
    const w = arena.clientWidth, h = arena.clientHeight;
    el.style.left = `${((x + 1) / 2) * w}px`;
    el.style.top = `${((y + 1) / 2) * h}px`;
  }

  updatePractice(dt, inp) {
    const d = this.dot;
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 1) this.finish();
      return;
    }
    d.vx += inp.x * 4 * dt;
    d.vy += -inp.y * 4 * dt;
    const damp = Math.max(0, 1 - 2.5 * dt);
    d.vx *= damp;
    d.vy *= damp;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const lim = 0.9;
    if (Math.abs(d.x) > lim) { d.x = Math.sign(d.x) * lim; d.vx *= -0.4; }
    if (Math.abs(d.y) > lim) { d.y = Math.sign(d.y) * lim; d.vy *= -0.4; }
    this.placeEl($('pdot'), d.x, d.y);

    const t = PRACTICE_TARGETS[this.idx];
    if (Math.hypot(d.x - t.x, d.y - t.y) < 0.2) {
      this.sfx.banana();
      this.idx++;
      this.dot = { x: 0, y: 0, vx: 0, vy: 0 };
      if (this.idx >= PRACTICE_TARGETS.length) {
        $('ptarget').classList.add('hidden');
        $('practice-text').innerHTML = "Great! Let's roll!";
        this.doneT = 0;
      } else {
        this.showTarget();
      }
    }
  }
}
