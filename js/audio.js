let ctx = null;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  banana() { tone(880, 0.08, 'square', 0.06); tone(1320, 0.12, 'square', 0.06, 0, 0.06); },
  bump() { tone(140, 0.12, 'triangle', 0.25, -60); },
  bumper() { tone(300, 0.15, 'square', 0.1, 400); },
  land() { tone(90, 0.1, 'sine', 0.3, -40); },
  ready() { tone(440, 0.15, 'square', 0.07); },
  go() { tone(880, 0.3, 'square', 0.08); },
  tick() { tone(1200, 0.04, 'square', 0.04); },
  pop() { tone(660, 0.08, 'sine', 0.15, 300); },
  goal() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, 0, i * 0.11)); },
  fall() { tone(520, 0.9, 'sawtooth', 0.06, -440); },
};
