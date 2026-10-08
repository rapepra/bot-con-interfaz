/**
 * Libro de posiciones local del fondo.
 *
 * Aplica las ejecuciones (`Fill`) que devuelve el MarketAdapter. Con un broker
 * real se reconciliaría periódicamente contra las posiciones del broker; la
 * interfaz pública no cambiaría.
 *
 * @typedef {Object} Position
 * @property {string}  ticker
 * @property {number}  shares
 * @property {number}  avgCost      Coste medio por acción (incluye comisiones)
 * @property {boolean} locked       true = control manual (el bot no la toca)
 * @property {{price:number, label:string}|null} lockedAt
 */
export class Portfolio {
  /** @type {Map<string, Position>} */
  #positions = new Map();

  constructor({ initialCash = 1_000_000 } = {}) {
    this.initialCash = initialCash;
    this.cash = initialCash;
    this.realizedPnl = 0;
    /** @type {import('./MarketAdapter.js').Fill[]} */
    this.trades = [];
    /** @type {{label:string, nav:number, benchmark:number}[]} */
    this.navHistory = [];
  }

  get positions() {
    return [...this.#positions.values()];
  }

  get(ticker) {
    return this.#positions.get(ticker) ?? null;
  }

  /** @param {import('./MarketAdapter.js').Fill} fill */
  applyFill(fill) {
    const { ticker, side, quantity, price, commission } = fill;
    const position = this.#positions.get(ticker);

    if (side === 'BUY') {
      const cost = quantity * price + commission;
      if (cost > this.cash + 1e-6) throw new Error(`Liquidez insuficiente para comprar ${ticker}`);
      this.cash -= cost;
      if (position) {
        const totalCost = position.avgCost * position.shares + cost;
        position.shares += quantity;
        position.avgCost = totalCost / position.shares;
      } else {
        this.#positions.set(ticker, { ticker, shares: quantity, avgCost: cost / quantity, locked: false, lockedAt: null });
      }
    } else {
      if (!position || position.shares < quantity) throw new Error(`No hay suficientes acciones de ${ticker}`);
      const proceeds = quantity * price - commission;
      this.cash += proceeds;
      this.realizedPnl += proceeds - position.avgCost * quantity;
      position.shares -= quantity;
      if (position.shares === 0) this.#positions.delete(ticker);
    }

    this.trades.push({ ...fill });
  }

  /** Pasa una posición a control manual: el bot deja de operarla. */
  lock(ticker, { price, label }) {
    const position = this.#positions.get(ticker);
    if (!position) return false;
    position.locked = true;
    position.lockedAt = { price, label };
    return true;
  }

  unlock(ticker) {
    const position = this.#positions.get(ticker);
    if (!position) return false;
    position.locked = false;
    position.lockedAt = null;
    return true;
  }

  /** @param {Record<string, number>} prices */
  marketValue(prices) {
    return this.positions.reduce((sum, p) => sum + p.shares * (prices[p.ticker] ?? p.avgCost), 0);
  }

  /** Valor liquidativo total. */
  nav(prices) {
    return this.cash + this.marketValue(prices);
  }

  record(label, nav, benchmark) {
    const last = this.navHistory.at(-1);
    if (last?.label === label) this.navHistory.pop();
    this.navHistory.push({ label, nav, benchmark });
  }
}

/** Utilidad: mapa ticker → precio a partir de una lista de empresas. */
export const priceMap = (companies) => Object.fromEntries(companies.map((c) => [c.ticker, c.price]));
