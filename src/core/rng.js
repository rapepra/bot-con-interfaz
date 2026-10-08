/**
 * Generador pseudoaleatorio determinista (mulberry32).
 *
 * Usar una semilla hace que cada partida sea reproducible: imprescindible para
 * tests, para depurar "¿por qué el bot vendió aquí?" y para futuros backtests.
 */
export function createRng(seed = 1) {
  let state = seed >>> 0;

  /** Uniforme en [0, 1). */
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Normal estándar N(0,1) vía Box–Muller. */
  const gaussian = () => {
    let u = 0;
    while (u === 0) u = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };

  return {
    next,
    gaussian,
    /** Normal con media y desviación dadas. */
    normal: (mean = 0, sd = 1) => mean + sd * gaussian(),
    /** Elemento aleatorio de un array. */
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
