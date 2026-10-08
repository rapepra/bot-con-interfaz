/**
 * Puente Phaser ⇄ DOM mediante CustomEvents en `window`.
 *
 * La escena de Phaser y la capa de UI no se importan entre sí: solo comparten
 * estos nombres de evento. Así cualquiera de las dos puede sustituirse
 * (p. ej. una escena 3D o una UI en React) sin tocar la otra.
 */
export const DomEvents = Object.freeze({
  /** Phaser → DOM. detail: { target: 'manager' | 'analyst' | 'bot' | 'cat' } */
  OFFICE_INTERACT: 'capitalclub:office-interact',
  /** DOM → Phaser. detail: { mood: 'idle' | 'sweat' | 'bulb', message?: string } */
  ANALYST_MOOD: 'capitalclub:analyst-mood',
  /** DOM → Phaser. detail: { state: 'idle' | 'trading' | 'alert' | 'sleep' } */
  BOT_STATE: 'capitalclub:bot-state',
  /** DOM → Phaser. detail: { tone: 'positive' | 'negative' | 'neutral', magnitude: number } */
  MARKET_PULSE: 'capitalclub:market-pulse',
  /** DOM → Phaser. detail: { index, label } — el reloj de mercado avanza (hora del día). */
  MARKET_CLOCK: 'capitalclub:market-clock',
  /** DOM → Phaser. detail: { level: 0..4 } — mejoras de oficina según el rango. */
  OFFICE_LEVEL: 'capitalclub:office-level',
  /** Phaser → DOM. La escena terminó de construirse. */
  SCENE_READY: 'capitalclub:scene-ready',
});

export function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Suscribe y devuelve la función para desuscribir. */
export function on(name, handler) {
  const listener = (event) => handler(event.detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
