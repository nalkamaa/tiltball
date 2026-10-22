// Browser test harness: open index.html?debug, then in the console run
//   const ap = await import('./tools/autopilot.js'); await ap.calibrate(); await ap.runAll();
// For the landscape view: __tb.store.view = 'landscape'; await ap.calibrate(0, 'left');
// It fakes DeviceOrientation events, so the whole tilt pipeline is exercised.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Neutral poses, 35 degrees toward the player: upright, sideways with the top edge
// to the left (hold 90) and sideways with the top edge to the right (hold -90).
export const POSES = {
  portrait: { beta: 35, gamma: 0 },
  left: { beta: 0, gamma: -35 },
  right: { beta: 0, gamma: 35 },
};
// Shared on window so re-importing this module keeps driving the same fake sensor.
const fake = (window.__apFake ||= { beta: 35, gamma: 0, neutral: POSES.portrait });

export function setPose(name) {
  fake.neutral = POSES[name];
  fake.beta = fake.neutral.beta;
  fake.gamma = fake.neutral.gamma;
}

function startSensor() {
  if (window.__apTimer) return;
  window.__apTimer = setInterval(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: fake.beta, gamma: fake.gamma }));
  }, 16);
}

export async function calibrate(level = 0, pose = 'portrait') {
  startSensor();
  setPose(pose);
  await window.__tb.beginFrom(level);
  const t0 = performance.now();
  while (window.__tb.state === 'hold' && performance.now() - t0 < 5000) await sleep(50);
  return window.__tb.state;
}

const mover = () => window.__tb.world.surfaces.find((s) => s.move);

// Waypoints: {x, z, r?, v?, wait?}. A function is re-evaluated every frame.
// With `wait`, the ball is held at the point until wait() returns true; `ride`
// checks wait() without first having to reach the (moving) point.
export const ROUTES = [
  [[{ x: 0, z: -19 }]],
  [[{ x: 0, z: -11, r: 1 }, { x: 8.5, z: -11 }]],
  [[{ x: 0, z: -10, r: 0.8 }, { x: 8, z: -10, r: 0.8 }, { x: 8, z: -21 }]],
  [[{ x: 0, z: -24 }]],
  [[{ x: 0, z: -15, r: 0.6 }, { x: 14, z: -15 }], { vmax: 3 }],
  [[{ x: 0, z: -3 }, { x: 0, z: -7 }, { x: 1.2, z: -9.5 }, { x: 1.4, z: -12 }, { x: 1, z: -14.5 }, { x: 0.5, z: -17 }, { x: 0, z: -19 }], { vmax: 2.5 }],
  [[
    { x: 0, z: -3.4, wait: () => mover().cz > -5.45 && mover().dz > 0 },
    () => ({ x: 0, z: mover().cz, v: 3.5, ride: true, wait: () => mover().cz < -10.6 }),
    { x: 0, z: -15, r: 0.8 },
    { x: 0, z: -21, r: 0.8 },
    { x: 0, z: -27 },
  ], { vmax: 3 }],
  [[{ x: 3.8, z: -2 }, { x: 3.8, z: -23 }, { x: 0, z: -24.8 }], { vmax: 3 }],
  [[{ x: 0, z: -6, r: 0.5 }, { x: 5, z: -6, r: 0.5 }, { x: 5, z: -12, r: 0.5 }, { x: -1, z: -12, r: 0.5 }, { x: -1, z: -18 }], { vmax: 2.2 }],
  [[
    { x: 0, z: -17.5, wait: () => mover().cz > -19.4 },
    () => ({ x: 0, z: mover().cz, v: 3.5, ride: true, wait: () => mover().cz < -24.6 }),
    { x: 0, z: -29, r: 0.8 },
    { x: 0, z: -37, r: 0.5 },
    { x: 1.2, z: -38.6, r: 0.5 },
    { x: 3.9, z: -39.2, r: 0.5 },
    { x: 3.9, z: -45, r: 0.6 },
    { x: 0, z: -46 },
  ], { vmax: 2.5 }],
];

export async function drive(waypoints, opts = {}) {
  const tb = window.__tb;
  const vmax = opts.vmax || 4;
  const t0 = performance.now();
  let wi = 0;
  let maxSpeed = 0;
  while (performance.now() - t0 < (opts.timeout || 40000)) {
    if (tb.state !== 'play' && tb.state !== 'intro') break;
    const p = tb.ball.pos, v = tb.ball.vel;
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.z));
    let wp = waypoints[wi];
    if (typeof wp === 'function') wp = wp();
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (wp.wait && (wp.ride || d < (wp.r || 0.6)) && wp.wait()) { wi++; continue; }
    if (!wp.wait && d < (wp.r || 0.6) && wi < waypoints.length - 1) { wi++; continue; }
    const sp = Math.min(wp.v || vmax, d * 1.5);
    let ax = ((dx / (d || 1)) * sp - v.x) * 0.6;
    let az = ((dz / (d || 1)) * sp - v.z) * 0.6;
    const m = Math.hypot(ax, az);
    if (m > 1) { ax /= m; az /= m; }
    const y = tb.camYaw;
    const ix = ax * Math.cos(y) - az * Math.sin(y);
    const iy = -ax * Math.sin(y) - az * Math.cos(y);
    // Player-view tilt -> phone-frame tilt -> fake sensor angles.
    const va = (tb.tilt.viewAngle * Math.PI) / 180;
    const c = Math.round(Math.cos(va)), s = Math.round(Math.sin(va));
    const px = ix * c + iy * s, py = -ix * s + iy * c;
    const ang = (u) => (Math.abs(u) > 0.01 ? Math.sign(u) * (1.2 + Math.abs(u) * 18.8) : 0);
    const n = fake.neutral;
    fake.gamma = n.gamma + ang(px) / Math.cos((n.beta * Math.PI) / 180);
    fake.beta = n.beta - ang(py);
    await sleep(16);
  }
  fake.beta = fake.neutral.beta;
  fake.gamma = fake.neutral.gamma;
  const p = tb.ball.pos;
  return {
    level: tb.levelIndex + 1,
    end: tb.state,
    waypoint: `${wi}/${waypoints.length}`,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    pos: [p.x, p.y, p.z].map((n) => n.toFixed(1)).join(','),
    maxSpeed: maxSpeed.toFixed(1),
    bananas: tb.bananas,
  };
}

export async function run(i) {
  const tb = window.__tb;
  const [wps, opts] = ROUTES[i];
  tb.setLives(3);
  tb.startLevel(i);
  while (tb.state === 'intro') await sleep(30);
  const r = await drive(wps, opts);
  if (r.end === 'goal') {
    await sleep(3300);
    r.next = `${tb.state} L${tb.levelIndex + 1}`;
  } else {
    r.msg = document.getElementById('center-msg').textContent;
  }
  r.errors = document.getElementById('error-box').textContent;
  return r;
}

export async function runAll(from = 0, to = ROUTES.length - 1) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(await run(i));
  return out;
}
