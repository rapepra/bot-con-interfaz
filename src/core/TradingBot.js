import { Emitter } from './Emitter.js';
import { priceMap } from './Portfolio.js';

export const SELL_REASONS = Object.freeze({
  TARGET_REACHED: 'Valor objetivo alcanzado',
  FUND_EXIT: 'El fondo de referencia deshace su posición',
});

let orderSeq = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TradingBot — estrategia "copia a los grandes del Value" con Human-in-the-Loop
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • COMPRAS: automáticas. Si un fondo de referencia (Azvalor, Cobas) reporta
 *    COMPRA y la empresa pasa los filtros (descuento mínimo, deuda máxima), el
 *    bot construye posición con un tamaño ajustado por calidad del balance.
 *
 *  • VENTAS: el bot las PROPONE (orden pendiente) cuando el precio toca el valor
 *    objetivo o el fondo sale. El humano tiene una ventana para pulsar OVERRIDE
 *    y quedarse la posición en modo manual. Si no lo hace, se ejecuta.
 *
 *  Eventos emitidos: 'log', 'sell-proposed', 'order-executed', 'override', 'change'.
 */
export class TradingBot extends Emitter {
  static DEFAULT_RULES = Object.freeze({
    targetWeight: 0.2, // peso objetivo de una posición de máxima calidad
    minUpside: 0.2, // descuento mínimo vs valor objetivo para entrar
    maxLeverage: 5, // deuda neta / EBITDA máxima admisible
    cashBuffer: 0.03, // liquidez mínima que nunca se invierte
    minTicket: 0.02, // no mover menos de un 2% del NAV
  });

  /** @type {Map<string, object>} órdenes de venta esperando decisión humana */
  pendingOrders = new Map();
  /** @type {{ticker:string, price:number, label:string}[]} */
  overrides = [];
  /** @type {{label:string, level:'info'|'trade'|'warn'|'human', message:string}[]} */
  log = [];
  autopilot = true;

  /**
   * @param {Object} deps
   * @param {import('./MarketAdapter.js').MarketAdapter} deps.adapter
   * @param {import('./Portfolio.js').Portfolio} deps.portfolio
   * @param {Partial<typeof TradingBot.DEFAULT_RULES>} [deps.rules]
   */
  constructor({ adapter, portfolio, rules = {} }) {
    super();
    this.adapter = adapter;
    this.portfolio = portfolio;
    this.rules = { ...TradingBot.DEFAULT_RULES, ...rules };
    this.snapshot = null;
  }

  /**
   * Analiza el nuevo estado del mercado: propone ventas y ejecuta compras.
   * @param {import('./MarketAdapter.js').MarketSnapshot} snapshot
   */
  async evaluate(snapshot) {
    this.snapshot = snapshot;
    if (!this.autopilot) {
      this.#log('info', 'Autopiloto desactivado: el bot solo observa.');
      this.emit('change');
      return { executed: [], proposed: [] };
    }
    const proposed = this.#proposeSells(snapshot);
    const executed = await this.#executeBuys(snapshot);
    if (!proposed.length && !executed.length) this.#log('info', 'Sin señales este trimestre. Paciencia: es Value.');
    this.emit('change');
    return { executed, proposed };
  }

  /** El humano deja que el bot venda (o se agotó la cuenta atrás). */
  async confirmSell(orderId) {
    const order = this.pendingOrders.get(orderId);
    if (!order) return null;
    this.pendingOrders.delete(orderId);
    const position = this.portfolio.get(order.ticker);
    if (!position) return null;
    const fill = await this.#execute({ ticker: order.ticker, side: 'SELL', quantity: position.shares });
    this.#log('trade', `VENTA ${fill.quantity} ${fill.ticker} @ ${fill.price.toFixed(2)} · ${order.reasonText}`);
    this.emit('change');
    return fill;
  }

  /** OVERRIDE: el humano bloquea la venta y asume el control de la posición. */
  override(orderId) {
    const order = this.pendingOrders.get(orderId);
    if (!order) return false;
    this.pendingOrders.delete(orderId);
    this.portfolio.lock(order.ticker, { price: order.price, label: order.createdAt });
    this.overrides.push({ ticker: order.ticker, price: order.price, label: order.createdAt });
    this.#log('human', `OVERRIDE en ${order.ticker}: el gestor bloquea la venta a ${order.price.toFixed(2)}. Control manual.`);
    this.emit('override', order);
    this.emit('change');
    return true;
  }

  /** Toggle "Bloquear bot" desde la terminal. */
  setLock(ticker, locked) {
    if (locked) {
      const price = this.#price(ticker);
      this.portfolio.lock(ticker, { price, label: this.snapshot?.clock.label ?? '' });
      for (const [id, order] of this.pendingOrders) if (order.ticker === ticker) this.pendingOrders.delete(id);
      this.#log('human', `${ticker} bloqueada: control manual.`);
    } else {
      this.portfolio.unlock(ticker);
      this.#log('human', `${ticker} devuelta al bot.`);
    }
    this.emit('change');
  }

  /** Venta discrecional del gestor sobre una posición (bloqueada o no). */
  async manualSell(ticker) {
    const position = this.portfolio.get(ticker);
    if (!position) return null;
    for (const [id, order] of this.pendingOrders) if (order.ticker === ticker) this.pendingOrders.delete(id);
    const fill = await this.#execute({ ticker, side: 'SELL', quantity: position.shares });
    this.#log('human', `Venta manual del gestor: ${fill.quantity} ${ticker} @ ${fill.price.toFixed(2)}`);
    this.emit('change');
    return fill;
  }

  setAutopilot(on) {
    this.autopilot = on;
    this.#log('human', on ? 'Autopiloto ACTIVADO.' : 'Autopiloto DESACTIVADO.');
    this.emit('change');
  }

  /** Cuántos overrides han salido bien (precio actual > precio del override). */
  overrideScore() {
    const total = this.overrides.length;
    const wins = this.overrides.filter((o) => this.#price(o.ticker) > o.price).length;
    return { total, wins, ratio: total ? wins / total : null };
  }

  // ── Estrategia ───────────────────────────────────────────────────────────

  #proposeSells(snapshot) {
    const proposed = [];
    const pendingTickers = new Set([...this.pendingOrders.values()].map((o) => o.ticker));

    for (const position of this.portfolio.positions) {
      if (position.locked || pendingTickers.has(position.ticker)) continue;
      const company = snapshot.companies.find((c) => c.ticker === position.ticker);
      if (!company) continue;
      const filing = snapshot.filings.find((f) => f.ticker === position.ticker);

      let reason = null;
      if (company.price >= company.targetValue) reason = 'TARGET_REACHED';
      else if (filing?.action === 'EXIT') reason = 'FUND_EXIT';
      if (!reason) continue;

      const order = {
        id: `ORD-${++orderSeq}`,
        ticker: position.ticker,
        name: company.name,
        side: 'SELL',
        quantity: position.shares,
        price: company.price,
        targetValue: company.targetValue,
        avgCost: position.avgCost,
        reason,
        reasonText: SELL_REASONS[reason],
        fund: company.fund,
        createdAt: snapshot.clock.label,
      };
      this.pendingOrders.set(order.id, order);
      proposed.push(order);
      this.#log('warn', `Propuesta de VENTA ${order.ticker}: ${order.reasonText}. Esperando al gestor…`);
      this.emit('sell-proposed', order);
    }
    return proposed;
  }

  async #executeBuys(snapshot) {
    const { targetWeight, minUpside, maxLeverage, cashBuffer, minTicket } = this.rules;
    const prices = priceMap(snapshot.companies);
    const nav = this.portfolio.nav(prices);
    const pendingTickers = new Set([...this.pendingOrders.values()].map((o) => o.ticker));
    const executed = [];

    const candidates = snapshot.filings
      .filter((f) => f.action === 'BUY')
      .map((f) => ({ filing: f, company: snapshot.companies.find((c) => c.ticker === f.ticker) }))
      .filter(({ company }) => company && company.upside >= minUpside && company.leverage <= maxLeverage)
      .filter(({ company }) => !this.portfolio.get(company.ticker)?.locked && !pendingTickers.has(company.ticker))
      .sort((a, b) => b.company.upside - a.company.upside);

    for (const { filing, company } of candidates) {
      const desired = nav * targetWeight * TradingBot.qualityFactor(company.leverage);
      const current = (this.portfolio.get(company.ticker)?.shares ?? 0) * company.price;
      const gap = desired - current;
      if (gap < nav * minTicket) continue;

      const budget = Math.min(gap, this.portfolio.cash - nav * cashBuffer);
      const quantity = Math.floor(budget / (company.price * 1.003));
      if (quantity <= 0) continue;

      const fill = await this.#execute({ ticker: company.ticker, side: 'BUY', quantity });
      executed.push(fill);
      this.#log(
        'trade',
        `COMPRA ${fill.quantity} ${fill.ticker} @ ${fill.price.toFixed(2)} · sigue a ${filing.fund} · recorrido ${(company.upside * 100).toFixed(0)}%`,
      );
    }
    return executed;
  }

  /** Tamaño relativo según la salud del balance: el bot ama la caja neta. */
  static qualityFactor(leverage) {
    if (leverage <= 1.5) return 1;
    if (leverage <= 3) return 0.6;
    return 0.35;
  }

  async #execute(order) {
    const fill = await this.adapter.placeOrder(order);
    this.portfolio.applyFill(fill);
    this.emit('order-executed', fill);
    return fill;
  }

  #price(ticker) {
    return this.snapshot?.companies.find((c) => c.ticker === ticker)?.price ?? 0;
  }

  #log(level, message) {
    const entry = { label: this.snapshot?.clock.label ?? '—', level, message };
    this.log.push(entry);
    if (this.log.length > 300) this.log.shift();
    this.emit('log', entry);
  }
}
