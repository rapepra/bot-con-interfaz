/**
 * Sintetizador de efectos con WebAudio: cero ficheros, todo generado.
 * Se activa tras la primera interacción (política de autoplay del navegador).
 */
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('capitalclub:muted') === '1';
} catch {
  /* almacenamiento no disponible: sonido activado por defecto */
}

function audio() {
  if (muted) return null;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Nota simple con envolvente. */
function tone(freq, { type = 'square', dur = 0.12, vol = 0.06, at = 0, glide = null } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone(1200, { dur: 0.04, vol: 0.03 }),
  advance: () => {
    tone(220, { type: 'sawtooth', dur: 0.35, vol: 0.035, glide: 880 });
    tone(330, { type: 'triangle', dur: 0.3, vol: 0.03, at: 0.05, glide: 990 });
  },
  alarm: () => {
    for (let i = 0; i < 3; i++) {
      tone(880, { dur: 0.16, vol: 0.05, at: i * 0.36 });
      tone(660, { dur: 0.16, vol: 0.05, at: i * 0.36 + 0.18 });
    }
  },
  tick: () => tone(1800, { type: 'sine', dur: 0.03, vol: 0.025 }),
  cash: () => {
    tone(1318, { type: 'triangle', dur: 0.09, vol: 0.05 });
    tone(1760, { type: 'triangle', dur: 0.18, vol: 0.05, at: 0.08 });
  },
  lock: () => {
    tone(140, { type: 'square', dur: 0.18, vol: 0.06, glide: 70 });
    tone(90, { type: 'sine', dur: 0.25, vol: 0.08, at: 0.02 });
  },
  achievement: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.18, vol: 0.045, at: i * 0.09 })),
  meow: () => tone(700, { type: 'sine', dur: 0.35, vol: 0.05, glide: 420 }),
  crash: () => tone(160, { type: 'sawtooth', dur: 0.6, vol: 0.05, glide: 50 }),
};

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('capitalclub:muted', muted ? '1' : '0');
  } catch {
    /* ignorado */
  }
  return muted;
}
