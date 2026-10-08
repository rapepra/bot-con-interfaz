/**
 * Emisor de eventos mínimo y sin dependencias del DOM.
 * El núcleo lógico lo usa para notificar cambios sin conocer a sus consumidores
 * (UI, Phaser, un futuro proceso headless en servidor...).
 */
export class Emitter {
  #listeners = new Map();

  on(event, listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(listener);
    return () => this.#listeners.get(event)?.delete(listener);
  }

  emit(event, payload) {
    this.#listeners.get(event)?.forEach((listener) => listener(payload));
  }
}
