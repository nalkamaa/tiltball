// Stage coordinates: x = right, z = toward the camera (the course runs toward -z), y = up.
// `y` on platforms is the height of the walkable top surface.

const box = (x, z, w, d, y = 0, extra = {}) => ({ type: 'box', x, z, w, d, y, ...extra });
const rail = (x, z, w, d, y = 0) => ({ type: 'box', x, z, w, d, y: y + 0.6, thick: 0.6, rail: true });
const ramp = (x, z, w, d, y0, y1, axis = 'z') => ({ type: 'ramp', x, z, w, d, y0, y1, axis });
const mover = (x, z, w, d, y, axis, amp, speed, phase = 0) =>
  ({ type: 'box', x, z, w, d, y, move: { axis, amp, speed, phase } });
const bumper = (x, z, y = 0, r = 0.7) => ({ type: 'bumper', x, z, y, r });
const sweeper = (x, z, y, len, speed, phase = 0) => ({ type: 'sweeper', x, z, y, len, speed, phase });
const bananas = (y, ...pts) => pts.map(([x, z]) => ({ x, y: y + 0.7, z }));

// Axis-aligned path of constant width through the given [x, z] corner points.
// Later segments start after the previous corner so top faces never overlap.
function path(points, w, y = 0) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const startExt = i === 0 ? -w / 2 : w / 2;
    if (x1 === x2) {
      const s = Math.sign(z2 - z1);
      const a = z1 + s * startExt, b = z2 + s * w / 2;
      out.push(box(x1, (a + b) / 2, w, Math.abs(b - a), y));
    } else {
      const s = Math.sign(x2 - x1);
      const a = x1 + s * startExt, b = x2 + s * w / 2;
      out.push(box((a + b) / 2, z1, Math.abs(b - a), w, y));
    }
  }
  return out;
}

export const LEVELS = [
  {
    name: 'Easy Street',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 0, z: -19, y: 0 },
    parts: [
      box(0, -10, 8, 24),
      rail(-3.85, -10, 0.3, 24),
      rail(3.85, -10, 0.3, 24),
      rail(0, 1.85, 7.4, 0.3),
    ],
    bananas: bananas(0, [0, -5], [0, -9], [0, -13], [-2, -16], [2, -16]),
  },
  {
    name: 'First Corner',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 8.5, z: -11, y: 0, rot: Math.PI / 2 },
    parts: [
      box(0, -6, 6, 16),
      box(7, -11, 8, 6),
      rail(0, 1.85, 6, 0.3),
      rail(-2.85, -6, 0.3, 15.4),
      rail(4, -13.85, 14, 0.3),
      rail(10.85, -11, 0.3, 5.4),
    ],
    bananas: bananas(0, [0, -4], [0, -8], [3, -11], [6, -11]),
  },
  {
    name: 'S-Curve',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 8, z: -21, y: 0 },
    parts: path([[0, 1], [0, -10], [8, -10], [8, -22]], 4),
    bananas: bananas(0, [0, -4], [0, -8], [4, -10], [8, -14], [8, -18]),
  },
  {
    name: 'Downhill',
    time: 60,
    start: { x: 0, z: 0, y: 3 },
    goal: { x: 0, z: -24, y: 0 },
    parts: [
      box(0, -2, 5, 8, 3, { thick: 3 }),
      ramp(0, -11, 5, 10, 0, 3),
      box(0, -21, 5, 10, 0),
    ],
    bananas: [
      ...bananas(3, [0, -3]),
      { x: 0, y: 2.2, z: -11 },
      ...bananas(0, [-1.5, -19], [1.5, -19]),
    ],
  },
  {
    name: 'Bridges',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 14, z: -15, y: 0, rot: Math.PI / 2 },
    parts: [
      box(0, -1, 6, 6),
      box(0, -8, 2.5, 8),
      box(0, -15, 6, 6),
      box(7, -15, 8, 2.5),
      box(14, -15, 6, 6),
    ],
    bananas: bananas(0, [0, -6], [0, -10], [5, -15], [9, -15]),
  },
  {
    name: 'Bumper Field',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 0, z: -19, y: 0 },
    parts: [
      box(0, -10, 10, 22),
      bumper(-2, -6), bumper(2, -8), bumper(0, -11),
      bumper(-3, -13), bumper(3, -14), bumper(-1, -16), bumper(2.2, -17),
    ],
    bananas: bananas(0, [-3.5, -9], [3.5, -11], [0, -14], [-3.5, -17]),
  },
  {
    name: 'Ferry',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 0, z: -27, y: 0 },
    parts: [
      box(0, -1, 6, 6),
      mover(0, -8, 3, 3, -0.02, 'z', 2.8, 1.2),
      box(0, -15, 6, 6),
      box(0, -21, 2.5, 6),
      box(0, -27, 6, 6),
    ],
    bananas: bananas(0, [0, -8], [0, -15], [0, -21]),
  },
  {
    name: 'Sweepers',
    time: 75,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 0, z: -24.8, y: 0 },
    parts: [
      box(0, -12, 9, 28),
      sweeper(0, -7, 0, 2.4, 1.2),
      sweeper(0, -14, 0, 2.4, -1.6),
      sweeper(0, -21, 0, 2.4, 2.0, 1),
    ],
    bananas: bananas(0, [-2.5, -10.5], [2.5, -17.5], [0, -3]),
  },
  {
    name: 'Zigzag',
    time: 60,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: -1, z: -18, y: 0 },
    parts: path([[0, 1], [0, -6], [5, -6], [5, -12], [-1, -12], [-1, -19]], 2),
    bananas: bananas(0, [0, -4], [3, -6], [5, -9], [2, -12], [-1, -15]),
  },
  {
    name: 'Gauntlet',
    time: 90,
    start: { x: 0, z: 0, y: 0 },
    goal: { x: 0, z: -46, y: 2 },
    parts: [
      box(0, -1, 6, 6),
      box(0, -8, 1.8, 8),
      box(0, -15, 5, 6),
      mover(0, -22, 2.5, 3, -0.02, 'z', 2.8, 1.3),
      box(0, -29, 5, 6),
      ramp(0, -35, 3, 6, 2, 0),
      box(0, -43, 9, 10, 2, { thick: 3 }),
      sweeper(0, -42, 2, 2.6, 1.8),
    ],
    bananas: [
      ...bananas(0, [0, -8], [0, -22], [0, -29]),
      ...bananas(2, [-2, -40], [2, -44]),
    ],
  },
];
