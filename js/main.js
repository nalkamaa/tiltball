import * as THREE from '../vendor/three.module.min.js';
import { LEVELS } from './levels.js';
import { World, createBall, BALL_R } from './physics.js';
import { TiltInput } from './input.js';
import { Onboarding } from './onboarding.js';
import { sfx, unlockAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 120;
const START_LIVES = 3;
const MAX_VIS_TILT = 10 * Math.PI / 180;
const FALL_MARGIN = 10;
const GOAL_R = 1.1;
const CAM_PORTRAIT = { fov: 72, dist: 5.5, height: 2.7 };
const CAM_LANDSCAPE = { fov: 50, dist: 6.2, height: 3.1 };
const HOLD_CHANGE_SECONDS = 0.7;

const store = {
  get unlocked() { return Math.min(LEVELS.length, Math.max(1, +localStorage.getItem('tb_unlocked') || 1)); },
  set unlocked(v) { localStorage.setItem('tb_unlocked', String(v)); },
  get practiced() { return localStorage.getItem('tb_practiced') === '1'; },
  set practiced(v) { localStorage.setItem('tb_practiced', v ? '1' : '0'); },
  get touch() { return localStorage.getItem('tb_touch') === '1'; },
  set touch(v) { localStorage.setItem('tb_touch', v ? '1' : '0'); },
  get view() { return localStorage.getItem('tb_view') === 'landscape' ? 'landscape' : 'portrait'; },
  set view(v) { localStorage.setItem('tb_view', v); },
};

const THEMES = [
  { a: '#8ee06a', b: '#62c456', side: '#8a5a3b', rail: '#ffffff', sky: ['#4fb8ff', '#dff4ff'] },
  { a: '#ffd166', b: '#f4a261', side: '#a0522d', rail: '#fff4e0', sky: ['#ff8a7a', '#ffe7c7'] },
  { a: '#9fd3fb', b: '#64b5f6', side: '#37474f', rail: '#e3f2fd', sky: ['#2f6fcf', '#cfe8ff'] },
  { a: '#d7a2e0', b: '#ab47bc', side: '#4a2c5a', rail: '#f3e5f5', sky: ['#2b1055', '#d39cff'] },
  { a: '#8fd6ce', b: '#26a69a', side: '#3e2723', rail: '#e0f2f1', sky: ['#0f2027', '#6fb1a8'] },
];

// ---------------------------------------------------------------- renderer

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
scene.fog = new THREE.Fog(0xdff4ff, 35, 120);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 5);
scene.add(sun);

const pivot = new THREE.Group();
const stage = new THREE.Group();
pivot.add(stage);
scene.add(pivot);
let stageObjects = new THREE.Group();
stage.add(stageObjects);

// ---------------------------------------------------------------- layout

const root = $('root');
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
// Extra CSS rotation of #root, for landscape view while the OS keeps the page in portrait.
let viewRot = 0;
let camCfg = CAM_PORTRAIT;
let layoutKey = '';

const pageIsLandscape = () => window.innerWidth > window.innerHeight;

function readSafeArea() {
  const cs = getComputedStyle($('safe-probe'));
  return {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
}

function applyLayout(force = false) {
  const W = window.innerWidth, H = window.innerHeight;
  const key = `${W}x${H}r${viewRot}`;
  if (!force && key === layoutKey) return;
  layoutKey = key;
  const sideways = viewRot !== 0;
  const w = sideways ? H : W, h = sideways ? W : H;
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
  root.style.transform = `translate(-50%, -50%) rotate(${viewRot}deg)`;
  root.classList.toggle('landscape', w > h);

  // Map the page's safe-area insets into #root's rotated frame.
  const s = readSafeArea();
  const m = viewRot === 90 ? { t: s.r, r: s.b, b: s.l, l: s.t }
    : viewRot === -90 ? { t: s.l, r: s.t, b: s.r, l: s.b }
      : s;
  for (const [k, v] of Object.entries(m)) root.style.setProperty(`--sa${k}`, `${v}px`);

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camCfg = camera.aspect < 1 ? CAM_PORTRAIT : CAM_LANDSCAPE;
  camera.fov = camCfg.fov;
  camera.updateProjectionMatrix();
}

// Page coordinates -> #root coordinates (undoes the CSS rotation).
function toRootCoords(px, py) {
  const dx = px - window.innerWidth / 2, dy = py - window.innerHeight / 2;
  const a = (-viewRot * Math.PI) / 180;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + root.clientWidth / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + root.clientHeight / 2,
  };
}

window.addEventListener('resize', () => applyLayout());
applyLayout(true);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checker(a, b) {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = b;
    g.fillRect(0, 0, 64, 64);
    g.fillRect(64, 64, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 125, 125);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

let skyTex = null;
function setSky([top, bottom]) {
  if (skyTex) skyTex.dispose();
  skyTex = canvasTex(4, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  scene.background = skyTex;
  scene.fog.color.set(bottom);
}

// ---------------------------------------------------------------- ball

const ballGroup = new THREE.Group();
const shellTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ff5fa2';
  for (let i = 0; i < 8; i += 2) g.fillRect(i * 32, 0, 32, 128);
  g.fillStyle = '#ffe14d';
  g.fillRect(0, 56, 256, 16);
});
const shell = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ map: shellTex, transparent: true, opacity: 0.45, roughness: 0.15, depthWrite: false }),
);
shell.renderOrder = 2;

function buildMonkey() {
  const m = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf5d0a9, roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    m.add(o);
    return o;
  };
  const sph = (r) => new THREE.SphereGeometry(r, 16, 12);
  add(sph(0.17), fur, 0, -0.2, 0);
  add(sph(0.22), fur, 0, 0.06, 0);
  add(sph(0.16), skin, 0, 0.02, -0.12, 1, 0.85, 0.6);
  add(sph(0.08), fur, -0.22, 0.1, 0);
  add(sph(0.08), fur, 0.22, 0.1, 0);
  add(sph(0.05), skin, -0.22, 0.1, -0.03);
  add(sph(0.05), skin, 0.22, 0.1, -0.03);
  add(sph(0.032), black, -0.065, 0.1, -0.2);
  add(sph(0.032), black, 0.065, 0.1, -0.2);
  return m;
}
const monkey = buildMonkey();
ballGroup.add(monkey, shell);
stage.add(ballGroup);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(BALL_R * 1.1, 24),
  new THREE.MeshBasicMaterial({
    map: canvasTex(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }),
    transparent: true,
    depthWrite: false,
  }),
);
shadow.rotation.x = -Math.PI / 2;
stage.add(shadow);

// ---------------------------------------------------------------- stage building

let stageData = null;

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

function buildStage(levelIndex, level, world) {
  disposeTree(stageObjects);
  stage.remove(stageObjects);
  stageObjects = new THREE.Group();
  stage.add(stageObjects);

  const th = THEMES[Math.floor(levelIndex / 2) % THEMES.length];
  setSky(th.sky);
  const base = checker(th.a, th.b);
  const side = new THREE.MeshStandardMaterial({ color: th.side, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: th.rail, roughness: 0.4 });
  const topMat = (rx, ry) => {
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  };

  const data = { movers: [], bumpers: [], sweepers: [], bananas: [], confetti: [], goal: null };

  for (const s of world.surfaces) {
    if (s.kind === 'box') {
      const thick = s.top - s.bottom;
      const geo = new THREE.BoxGeometry(s.w, thick, s.d);
      const mats = s.rail
        ? railMat
        : [side, side, topMat(s.w / 2, s.d / 2), side, side, side];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(s.cx, s.top - thick / 2, s.cz);
      stageObjects.add(mesh);
      if (s.move) data.movers.push({ s, mesh });
    } else {
      const th2 = 0.5;
      const dy = s.y1 - s.y0;
      const top = new THREE.Vector3(s.cx, (s.y0 + s.y1) / 2, s.cz);
      let mesh, n;
      if (s.axis === 'z') {
        const L = Math.hypot(s.d, dy);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, th2, L), [side, side, topMat(s.w / 2, L / 2), side, side, side]);
        const phi = -Math.atan2(dy, s.d);
        mesh.rotation.x = phi;
        n = new THREE.Vector3(0, Math.cos(phi), Math.sin(phi));
      } else {
        const L = Math.hypot(s.w, dy);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(L, th2, s.d), [side, side, topMat(L / 2, s.d / 2), side, side, side]);
        const psi = Math.atan2(dy, s.w);
        mesh.rotation.z = psi;
        n = new THREE.Vector3(-Math.sin(psi), Math.cos(psi), 0);
      }
      mesh.position.copy(top).addScaledVector(n, -th2 / 2);
      stageObjects.add(mesh);
    }
  }

  const bumperMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.3, emissive: 0x440000 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  for (const b of world.bumpers) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, 1, 24), bumperMat);
    body.position.y = 0.5;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.7, b.r * 0.7, 0.06, 24), capMat);
    cap.position.y = 1.03;
    g.add(body, cap);
    g.position.set(b.x, b.y, b.z);
    stageObjects.add(g);
    data.bumpers.push({ b, g });
  }

  const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
  const barMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.4, emissive: 0x331500 });
  for (const sw of world.sweepers) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), postMat);
    post.position.set(sw.x, sw.y + 0.6, sw.z);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sw.len * 2, 0.4, 0.4), barMat);
    bar.position.set(sw.x, sw.y + 0.5, sw.z);
    stageObjects.add(post, bar);
    data.sweepers.push({ sw, bar });
  }

  const banGeo = new THREE.TorusGeometry(0.22, 0.07, 8, 16, Math.PI * 0.9);
  const banMat = new THREE.MeshStandardMaterial({ color: 0xffe135, roughness: 0.4, emissive: 0x554400 });
  for (const p of level.bananas) {
    const holder = new THREE.Group();
    const m = new THREE.Mesh(banGeo, banMat);
    m.rotation.z = Math.PI * 0.55;
    holder.add(m);
    holder.position.set(p.x, p.y, p.z);
    stageObjects.add(holder);
    data.bananas.push({ p, mesh: holder, taken: false });
  }

  const goal = level.goal;
  const gGroup = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x2196f3, emissive: 0x0d47a1, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 12, 40), ringMat);
  ring.position.y = 1.3;
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8);
  const p1 = new THREE.Mesh(postGeo, ringMat);
  p1.position.set(-1.15, 0.65, 0);
  const p2 = p1.clone();
  p2.position.x = 1.15;
  const padTex = checker('#ffffff', '#2196f3');
  padTex.repeat.set(3, 3);
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(GOAL_R, 32),
    new THREE.MeshStandardMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.01;
  gGroup.add(ring, p1, p2, pad);
  gGroup.position.set(goal.x, goal.y, goal.z);
  gGroup.rotation.y = goal.rot || 0;
  stageObjects.add(gGroup);
  data.goal = { group: gGroup, ring };

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(th.sky[0]).multiplyScalar(0.7) }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = world.minY - 30;
  stageObjects.add(sea);

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(cloudGeo, cloudMat);
    const a = (i / 14) * Math.PI * 2;
    const r = 25 + (i % 4) * 9;
    c.position.set(Math.cos(a) * r, world.minY - 6 - (i % 3) * 5, Math.sin(a) * r - 12);
    c.scale.set(4 + (i % 3), 1.4, 2.5 + (i % 2));
    stageObjects.add(c);
  }

  stageData = data;
}

function spawnConfetti(at) {
  const colors = [0xff5fa2, 0xffe14d, 0x4fc3f7, 0x8ee06a, 0xffffff];
  const geo = new THREE.PlaneGeometry(0.14, 0.09);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    m.position.set(at.x, at.y + 1.2, at.z);
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 4;
    stageObjects.add(m);
    stageData.confetti.push({
      m, v: new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 5, Math.sin(a) * s),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }
}

// ---------------------------------------------------------------- game state

const tilt = new TiltInput();
const onboarding = new Onboarding(tilt, sfx, () => store.view);

let state = 'title';
let levelIndex = 0;
let level = null;
let world = null;
let ball = null;
let lives = START_LIVES;
let bananaCount = 0;
let bananasAtLevelStart = 0;
let timeLeft = 0;
let stateT = 0;
let lastTick = 0;
let accum = 0;
let touchMode = store.touch;
let pausedFrom = null;
let wakeLock = null;

const inputS = { x: 0, y: 0 };
const cam = { yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
const events = [];

function loadLevel(i) {
  levelIndex = i;
  level = LEVELS[i];
  world = new World(level);
  ball = createBall(level.start);
  buildStage(i, level, world);
  timeLeft = level.time;
  accum = 0;
  cam.yaw = 0;
  syncBallMesh(0);
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}

function setHud(visible) {
  $('hud').classList.toggle('hidden', !visible);
  $('btn-pause').classList.toggle('hidden', !visible);
}

let msgTimer = null;
function showMsg(title, sub = '', ms = 0, cls = '') {
  const el = $('center-msg');
  el.className = cls;
  el.innerHTML = `<div class="msg-title">${title}</div>${sub ? `<div class="msg-sub">${sub}</div>` : ''}`;
  clearTimeout(msgTimer);
  if (ms) msgTimer = setTimeout(hideMsg, ms);
}
function hideMsg() {
  $('center-msg').className = 'hidden';
}

function updateHud() {
  $('hud-level').textContent = `Level ${levelIndex + 1}`;
  $('hud-bananas').textContent = `🍌 ${bananaCount}`;
  $('hud-lives').textContent = '♥'.repeat(Math.max(0, lives));
  const t = Math.max(0, timeLeft);
  const el = $('hud-time');
  el.textContent = formatTime(t);
  el.classList.toggle('low', t < 10);
}

function formatTime(t) {
  return t < 10 ? t.toFixed(1) : String(Math.ceil(t));
}

function startLevel(i) {
  loadLevel(i);
  bananasAtLevelStart = bananaCount;
  state = 'intro';
  stateT = 0;
  showScreen(null);
  setHud(true);
  updateHud();
  const p = ball.pos;
  cam.pos.set(p.x, p.y + 10, p.z + 16);
  cam.look.set(level.goal.x, level.goal.y, level.goal.z);
  showMsg(`Level ${i + 1}`, level.name);
  sfx.ready();
}

function retryLevel() {
  bananaCount = bananasAtLevelStart;
  startLevel(levelIndex);
}

async function keepAwake() {
  try {
    if (navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null;
  }
}

async function beginFrom(i) {
  unlockAudio();
  if (!touchMode) {
    const granted = await tilt.requestPermission();
    if (!granted) {
      showScreen('screen-denied');
      return;
    }
  }
  keepAwake();
  lives = START_LIVES;
  bananaCount = 0;
  if (touchMode) {
    startLevel(i);
    return;
  }
  runCalibration(() => {
    if (!store.practiced && !touchMode) {
      state = 'practice';
      showScreen('screen-practice');
      onboarding.startPractice(() => {
        store.practiced = true;
        startLevel(i);
      });
    } else {
      startLevel(i);
    }
  });
}

function runCalibration(then) {
  state = 'hold';
  setHud(false);
  hideMsg();
  showScreen('screen-hold');
  onboarding.startHold(then);
}

let lastPauseReason = '';
function pauseGame(reason = 'button') {
  if (!['intro', 'play'].includes(state)) return;
  lastPauseReason = reason;
  pausedFrom = state;
  state = 'paused';
  $('btn-recal').classList.toggle('hidden', touchMode);
  showScreen('screen-pause');
}

function resumeGame() {
  showScreen(null);
  state = pausedFrom || 'play';
  setHud(true);
  keepAwake();
}

function toTitle() {
  state = 'title';
  setHud(false);
  hideMsg();
  loadLevel(Math.min(store.unlocked, LEVELS.length) - 1);
  buildTitle();
  showScreen('screen-title');
}

function buildTitle() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const unlocked = store.unlocked;
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'lvl';
    b.textContent = String(i + 1);
    b.title = lv.name;
    b.disabled = i >= unlocked;
    b.addEventListener('click', () => beginFrom(i));
    grid.appendChild(b);
  });
  $('btn-controls').textContent = touchMode ? 'Controls: Touch' : 'Controls: Tilt';
  $('btn-view').textContent = store.view === 'landscape' ? 'View: Landscape' : 'View: Portrait';
  $('secure-warning').classList.toggle('hidden', window.isSecureContext || touchMode);
}

// ---------------------------------------------------------------- input

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') state === 'paused' ? resumeGame() : pauseGame('key');
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const JOY_R = 60;
canvas.addEventListener('pointerdown', (e) => {
  if (!touchMode || !['intro', 'play'].includes(state)) return;
  const p = toRootCoords(e.clientX, e.clientY);
  joy.active = true;
  joy.id = e.pointerId;
  joy.ox = p.x;
  joy.oy = p.y;
  joy.x = joy.y = 0;
  const base = $('joy');
  base.style.left = `${p.x}px`;
  base.style.top = `${p.y}px`;
  base.classList.remove('hidden');
  $('joy-knob').style.transform = 'translate(-50%, -50%)';
});
canvas.addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  const p = toRootCoords(e.clientX, e.clientY);
  let dx = p.x - joy.ox, dy = p.y - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.x = dx / JOY_R;
  joy.y = -dy / JOY_R;
  $('joy-knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
const endJoy = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.active = false;
  joy.x = joy.y = 0;
  $('joy').classList.add('hidden');
};
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

function rawInput() {
  let x = 0, y = 0;
  if (!touchMode) {
    const t = tilt.read();
    x += t.x;
    y += t.y;
  }
  if (joy.active) { x += joy.x; y += joy.y; }
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y -= 1;
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y };
}

// ---------------------------------------------------------------- per-frame update

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const vRight = new THREE.Vector3();
const vFwd = new THREE.Vector3();
const vAxis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function syncBallMesh(dt) {
  const p = ball.pos, v = ball.vel;
  ballGroup.position.set(p.x, p.y, p.z);
  const sp = Math.hypot(v.x, v.z);
  if (sp > 1e-4 && dt > 0) {
    vAxis.set(v.z, 0, -v.x).normalize();
    qA.setFromAxisAngle(vAxis, (sp * dt) / BALL_R);
    shell.quaternion.premultiply(qA);
  }
  const faceYaw = sp > 0.6 ? Math.atan2(-v.x, -v.z) : cam.yaw;
  monkey.rotation.y += wrapAngle(faceYaw - monkey.rotation.y) * Math.min(1, dt * 8);
  monkey.rotation.z = THREE.MathUtils.clamp(-inputS.x * 0.3, -0.3, 0.3);

  const sup = ball.support || world.supportAt(p.x, p.z, p.y);
  if (sup) {
    const gap = p.y - BALL_R - sup.h;
    shadow.visible = true;
    shadow.position.set(p.x, sup.h + 0.03, p.z);
    const s = Math.max(0.3, 1 - gap * 0.15);
    shadow.scale.set(s, s, s);
    shadow.material.opacity = Math.max(0, 1 - gap * 0.2);
  } else {
    shadow.visible = false;
  }
}

function syncStage(t, dt) {
  for (const { s, mesh } of stageData.movers) mesh.position.set(s.cx, mesh.position.y, s.cz);
  for (const { b, g } of stageData.bumpers) {
    const k = 1 + b.hit * 1.2;
    g.scale.set(k, 1, k);
  }
  for (const { sw, bar } of stageData.sweepers) bar.rotation.y = -sw.angle;
  for (const b of stageData.bananas) {
    if (b.taken) continue;
    b.mesh.rotation.y = t * 2.5;
    b.mesh.position.y = b.p.y + Math.sin(t * 3 + b.p.x) * 0.08;
  }
  stageData.goal.ring.rotation.z = t * 0.5;
  for (const c of stageData.confetti) {
    c.v.y -= 9 * dt;
    c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.spin.x * dt;
    c.m.rotation.y += c.spin.y * dt;
  }
}

function updateTilt(inp) {
  vFwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  vRight.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  qA.setFromAxisAngle(vRight, -inp.y * MAX_VIS_TILT);
  qB.setFromAxisAngle(vFwd, inp.x * MAX_VIS_TILT);
  pivot.quaternion.slerp(qA.multiply(qB), 0.35);
  pivot.position.set(ball.pos.x, ball.pos.y, ball.pos.z);
  stage.position.set(-ball.pos.x, -ball.pos.y, -ball.pos.z);
}

function updateCamera(dt, follow) {
  const p = ball.pos, v = ball.vel;
  const sp = Math.hypot(v.x, v.z);
  if (follow && ball.ground && sp > 1.5) {
    const diff = wrapAngle(Math.atan2(-v.x, -v.z) - cam.yaw);
    if (Math.abs(diff) < 2) {
      const rate = 1.4 * THREE.MathUtils.clamp((sp - 1.5) / 6, 0, 1);
      cam.yaw += diff * Math.min(1, dt * rate);
    }
  }
  const k = 1 - Math.exp(-dt * (state === 'intro' ? 2.5 : 7));
  if (state !== 'fall') {
    const target = new THREE.Vector3(
      p.x + Math.sin(cam.yaw) * camCfg.dist,
      p.y + camCfg.height,
      p.z + Math.cos(cam.yaw) * camCfg.dist,
    );
    cam.pos.lerp(target, k);
    const look = new THREE.Vector3(p.x - Math.sin(cam.yaw) * 2.5, p.y + 0.2, p.z - Math.cos(cam.yaw) * 2.5);
    cam.look.lerp(look, k);
  } else {
    cam.look.lerp(new THREE.Vector3(p.x, p.y, p.z), 1 - Math.exp(-dt * 5));
  }
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
}

function physics(dt, inp) {
  accum += dt;
  vFwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  vRight.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const ix = vRight.x * inp.x + vFwd.x * inp.y;
  const iz = vRight.z * inp.x + vFwd.z * inp.y;
  while (accum >= STEP) {
    world.step(ball, ix, iz, STEP, events);
    accum -= STEP;
  }
  while (events.length) {
    const e = events.shift();
    if (e === 'bump') sfx.bump();
    else if (e === 'bumper') sfx.bumper();
    else if (e === 'land') sfx.land();
  }
}

function checkPickups() {
  const p = ball.pos;
  for (const b of stageData.bananas) {
    if (b.taken) continue;
    if (Math.hypot(p.x - b.p.x, p.y - b.p.y, p.z - b.p.z) < 0.85) {
      b.taken = true;
      b.mesh.visible = false;
      bananaCount++;
      sfx.banana();
    }
  }
}

function reachedGoal() {
  const p = ball.pos, g = level.goal;
  return Math.hypot(p.x - g.x, p.z - g.z) < GOAL_R && Math.abs(p.y - BALL_R - g.y) < 0.6;
}

function onGoal() {
  state = 'goal';
  stateT = 0;
  showMsg('GOAL!', `${formatTime(Math.max(0, timeLeft))}s left`, 0, 'big goal');
  sfx.goal();
  spawnConfetti(level.goal);
  store.unlocked = Math.max(store.unlocked, levelIndex + 2);
}

function onFail(title) {
  state = 'fall';
  stateT = 0;
  showMsg(title, '', 0, 'big fail');
  sfx.fall();
}

let holdChangeT = 0;

function updateOrientation(dt) {
  tilt.trackHold();
  const landscapeView = store.view === 'landscape';
  const inLevel = ['intro', 'play', 'goal', 'fall'].includes(state);

  let rot = 0;
  if (landscapeView && !touchMode && !pageIsLandscape()) {
    if (inLevel) rot = tilt.viewAngle;
    else if (tilt.hold === 90 || tilt.hold === -90) rot = tilt.hold;
    else if (tilt.hold === null) rot = viewRot;
  }
  if (rot !== viewRot) {
    viewRot = rot;
    applyLayout(true);
  }

  const wrongWay = isTouchDevice && pageIsLandscape() && !landscapeView;
  $('rotate-warning').classList.toggle('hidden', !wrongWay);
  if (wrongWay) pauseGame('rotated');

  // Turning the phone mid-level would flip the controls, so stop and recalibrate.
  const turned = !touchMode && (state === 'intro' || state === 'play')
    && tilt.hold !== null && tilt.hold !== tilt.viewAngle;
  holdChangeT = turned ? holdChangeT + dt : 0;
  if (holdChangeT > HOLD_CHANGE_SECONDS) {
    holdChangeT = 0;
    pauseGame('turned');
    runCalibration(() => resumeGame());
  }
}

function update(dt) {
  updateOrientation(dt);
  stateT += dt;
  const raw = rawInput();
  const k = Math.min(1, dt * 14);
  inputS.x += (raw.x - inputS.x) * k;
  inputS.y += (raw.y - inputS.y) * k;
  const t = performance.now() / 1000;

  switch (state) {
    case 'title': {
      cam.yaw += dt * 0.15;
      const c = ball.pos;
      cam.pos.set(c.x + Math.sin(cam.yaw) * 14, c.y + 7, c.z + Math.cos(cam.yaw) * 14 - 8);
      camera.position.copy(cam.pos);
      camera.lookAt(c.x, c.y, c.z - 8);
      pivot.quaternion.identity();
      pivot.position.set(0, 0, 0);
      stage.position.set(0, 0, 0);
      break;
    }
    case 'hold':
    case 'practice':
      onboarding.update(dt, inputS);
      break;
    case 'intro': {
      updateTilt(inputS);
      updateCamera(dt, false);
      if (stateT > 1.4 && stateT - dt <= 1.4) { showMsg('Ready?'); sfx.ready(); }
      if (stateT > 2.4) {
        state = 'play';
        stateT = 0;
        showMsg('GO!', '', 700, 'big');
        sfx.go();
        lastTick = Math.ceil(timeLeft);
      }
      break;
    }
    case 'play': {
      physics(dt, inputS);
      checkPickups();
      timeLeft -= dt;
      const sec = Math.ceil(timeLeft);
      if (sec < lastTick) {
        lastTick = sec;
        if (sec <= 10 && sec > 0) sfx.tick();
      }
      updateTilt(inputS);
      updateCamera(dt, true);
      if (reachedGoal()) onGoal();
      else if (ball.pos.y < world.minY - FALL_MARGIN) onFail('FALL OUT');
      else if (timeLeft <= 0) { timeLeft = 0; onFail('TIME OVER'); }
      updateHud();
      break;
    }
    case 'goal': {
      ball.vel.x *= 0.95;
      ball.vel.z *= 0.95;
      physics(dt, { x: 0, y: 0 });
      updateTilt({ x: 0, y: 0 });
      updateCamera(dt, false);
      if (stateT > 3) {
        hideMsg();
        if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
        else showComplete();
      }
      break;
    }
    case 'fall': {
      physics(dt, { x: 0, y: 0 });
      updateTilt({ x: 0, y: 0 });
      updateCamera(dt, false);
      if (stateT > 2) {
        hideMsg();
        lives--;
        if (lives <= 0) showGameOver();
        else retryLevel();
      }
      break;
    }
    default:
      break;
  }

  if (world && stageData) {
    if (state !== 'paused') syncStage(t, dt);
    syncBallMesh(state === 'paused' ? 0 : dt);
  }
}

function showGameOver() {
  state = 'gameover';
  setHud(false);
  $('gameover-level').textContent = `Level ${levelIndex + 1}: ${level.name}`;
  showScreen('screen-gameover');
}

function showComplete() {
  state = 'complete';
  setHud(false);
  $('complete-bananas').textContent = `You collected ${bananaCount} bananas.`;
  showScreen('screen-complete');
}

// ---------------------------------------------------------------- wiring

$('btn-play').addEventListener('click', () => beginFrom(Math.min(store.unlocked, LEVELS.length) - 1));
$('btn-controls').addEventListener('click', () => {
  touchMode = !touchMode;
  store.touch = touchMode;
  buildTitle();
});
$('btn-tutorial').addEventListener('click', () => {
  store.practiced = false;
  beginFrom(0);
});
$('btn-use-touch').addEventListener('click', () => {
  touchMode = true;
  store.touch = true;
  onboarding.finish();
});
$('btn-denied-touch').addEventListener('click', () => {
  touchMode = true;
  store.touch = true;
  beginFrom(Math.min(store.unlocked, LEVELS.length) - 1);
});
$('btn-denied-back').addEventListener('click', toTitle);
$('btn-skip-practice').addEventListener('click', () => onboarding.skip());
$('btn-pause').addEventListener('click', pauseGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-recal').addEventListener('click', () => runCalibration(() => resumeGame()));
$('btn-restart').addEventListener('click', () => { showScreen(null); retryLevel(); });
$('btn-quit').addEventListener('click', toTitle);
$('btn-retry').addEventListener('click', () => { lives = START_LIVES; retryLevel(); });
$('btn-gameover-title').addEventListener('click', toTitle);
$('btn-complete-title').addEventListener('click', toTitle);

$('btn-view').addEventListener('click', () => {
  store.view = store.view === 'landscape' ? 'portrait' : 'landscape';
  buildTitle();
});
$('btn-rotate-landscape').addEventListener('click', () => {
  store.view = 'landscape';
  buildTitle();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame('hidden');
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
}

if (new URLSearchParams(location.search).has('debug')) {
  window.__tb = {
    get state() { return state; },
    get levelIndex() { return levelIndex; },
    get ball() { return ball; },
    get world() { return world; },
    get camYaw() { return cam.yaw; },
    get viewRot() { return viewRot; },
    get lastPauseReason() { return lastPauseReason; },
    tilt,
    store,
    get timeLeft() { return timeLeft; },
    get lives() { return lives; },
    get bananas() { return bananaCount; },
    levels: LEVELS,
    beginFrom,
    startLevel,
    setLives(n) { lives = n; },
  };
}

toTitle();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
