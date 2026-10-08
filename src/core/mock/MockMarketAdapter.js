import { MarketAdapter } from '../MarketAdapter.js';
import { MockMarketService } from './MockMarketService.js';

/** Traducción del vocabulario del proveedor al del dominio. */
const FILING_ACTIONS = { COMPRA: 'BUY', MANTIENE: 'HOLD', REDUCE: 'TRIM', VENDE: 'EXIT' };
const ORDER_SIDES = { BUY: 'COMPRA', SELL: 'VENTA' };
const FILL_SIDES = { COMPRA: 'BUY', VENTA: 'SELL' };

/**
 * Adaptador entre el juego y `MockMarketService`.
 *
 * Es la única pieza que conoce el "dialecto" del mock. Su trabajo es puramente
 * de traducción: nombres de campos, enumerados, unidades y asincronía. Un
 * adaptador real (broker, API de datos) seguiría exactamente esta forma.
 *
 * @extends MarketAdapter
 */
export class MockMarketAdapter extends MarketAdapter {
  #service;
  #connected = false;
  #filingLag;
  #filingHistory = [];

  /**
   * @param {MockMarketService} [service] Inyectable para tests.
   * @param {Object} [options]
   * @param {number} [options.filingLag=0] Trimestres de retraso con que se conocen
   *   los movimientos de los fondos. En la vida real los informes de la CNMV
   *   llegan semanas después del cierre: con 1 el juego es más realista.
   */
  constructor(service = new MockMarketService(), { filingLag = 0 } = {}) {
    super();
    this.#service = service;
    this.#filingLag = filingLag;
  }

  get name() {
    return 'MockMarketAdapter · Simulación trimestral';
  }

  async connect() {
    this.#connected = true;
    return { provider: this.name, latencyMs: 0 };
  }

  async getSnapshot() {
    this.#assertConnected();
    return this.#toSnapshot({
      reloj: this.#service.obtenerReloj(),
      empresas: this.#service.obtenerEmpresas(),
      movimientosFondos: this.#service.obtenerMovimientosFondos(),
      evento: this.#service.obtenerUltimoEvento(),
      indiceReferencia: this.#service.obtenerIndiceReferencia(),
      fondos: this.#service.obtenerFondos(),
    });
  }

  async advance() {
    this.#assertConnected();
    return this.#toSnapshot(this.#service.avanzarTrimestre());
  }

  async placeOrder({ ticker, side, quantity }) {
    this.#assertConnected();
    const raw = this.#service.ejecutarOrden({ simbolo: ticker, lado: ORDER_SIDES[side], cantidad: quantity });
    return {
      ticker: raw.simbolo,
      side: FILL_SIDES[raw.lado],
      quantity: raw.cantidad,
      price: raw.precioEjecucion,
      commission: raw.comision,
      timestamp: raw.fecha,
    };
  }

  // ── Traducción ───────────────────────────────────────────────────────────

  #toSnapshot({ reloj, empresas, movimientosFondos, evento, indiceReferencia, fondos }) {
    if (this.#filingHistory.at(-1)?.indice !== reloj.indice) this.#filingHistory.push({ indice: reloj.indice, movimientosFondos });
    const visible = this.#filingHistory.filter((h) => h.indice <= reloj.indice - this.#filingLag).at(-1);
    movimientosFondos = visible?.movimientosFondos ?? [];
    return {
      clock: { index: reloj.indice, label: reloj.etiqueta.replace('-', ' ') },
      companies: empresas.map(toCompany),
      filings: movimientosFondos.map((m) => ({
        fund: m.fondo,
        ticker: m.simbolo,
        action: FILING_ACTIONS[m.movimiento],
      })),
      event: evento ? toEvent(evento) : null,
      benchmark: indiceReferencia,
      funds: fondos.map((f) => ({ name: f.fondo, nav: f.valor, cash: f.caja, weights: f.pesos })),
    };
  }

  #assertConnected() {
    if (!this.#connected) throw new Error('MockMarketAdapter: llama a connect() primero');
  }
}

function toCompany(e) {
  return {
    ticker: e.simbolo,
    name: e.nombre,
    sector: e.sector,
    currency: e.divisa,
    price: e.precio,
    change: e.variacion,
    marketCap: e.capitalizacion,
    netDebt: e.deudaNeta,
    ebitda: e.ebitda,
    leverage: e.deudaNeta / e.ebitda,
    eps: e.bpa,
    per: e.per,
    targetValue: e.valorObjetivo,
    upside: e.valorObjetivo / e.precio - 1,
    fund: e.fondo,
    thesis: e.tesis,
    history: e.historial,
  };
}

function toEvent(evento) {
  const impactos = Object.values(evento.impacto ?? {});
  const media = impactos.length ? impactos.reduce((a, b) => a + b, 0) / impactos.length : 0;
  const neto = media - (evento.shockCredito ?? 0);
  return {
    headline: evento.titular,
    tone: neto > 0.02 ? 'positive' : neto < -0.02 ? 'negative' : 'neutral',
    magnitude: Math.abs(neto),
    historical: Boolean(evento.historico),
  };
}
