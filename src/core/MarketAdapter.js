/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MarketAdapter — el contrato entre el juego y "el mercado".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todo el código del juego (bot, UI, escena) habla ÚNICAMENTE con esta
 * interfaz y con el modelo de dominio descrito abajo. Nunca con un proveedor
 * concreto. Hoy la implementación es `MockMarketAdapter` (simulación por
 * trimestres); mañana puede ser `InteractiveBrokersAdapter`, `AlpacaAdapter`
 * o un `BacktestAdapter` con datos históricos, sin tocar una línea del juego.
 *
 * Todos los métodos son asíncronos a propósito: cualquier broker real lo es.
 *
 * ── Modelo de dominio ────────────────────────────────────────────────────────
 *
 * @typedef {Object} Company
 * @property {string}   ticker
 * @property {string}   name
 * @property {string}   sector
 * @property {string}   currency
 * @property {number}   price          Último precio
 * @property {number}   change         Variación del último periodo (0.05 = +5%)
 * @property {number}   marketCap      Millones
 * @property {number}   netDebt        Millones (negativo = caja neta)
 * @property {number}   ebitda         Millones, anual
 * @property {number}   leverage       Deuda neta / EBITDA (negativo = caja neta)
 * @property {number}   eps            Beneficio por acción
 * @property {number}   per            Precio / beneficio
 * @property {number}   targetValue    Valor intrínseco estimado por acción
 * @property {number}   upside         targetValue / price - 1
 * @property {string}   fund           Fondo de referencia que la sigue
 * @property {string}   thesis         Tesis de inversión en una frase
 * @property {number[]} history        Serie de precios (para sparklines)
 *
 * @typedef {'BUY'|'HOLD'|'TRIM'|'EXIT'} FilingAction
 *
 * @typedef {Object} FundFiling      Movimiento reportado por un gran fondo
 * @property {string}       fund
 * @property {string}       ticker
 * @property {FilingAction} action
 *
 * @typedef {Object} MarketEvent
 * @property {string} headline
 * @property {'positive'|'negative'|'neutral'} tone
 * @property {number} magnitude      Impacto medio aproximado (0.2 = 20%)
 *
 * @typedef {Object} MarketSnapshot
 * @property {{index:number, label:string}} clock
 * @property {Company[]}          companies
 * @property {FundFiling[]}       filings
 * @property {MarketEvent|null}   event
 * @property {number}             benchmark   Índice de referencia (base 100)
 *
 * @typedef {Object} OrderRequest
 * @property {string}          ticker
 * @property {'BUY'|'SELL'}    side
 * @property {number}          quantity
 *
 * @typedef {Object} Fill
 * @property {string}          ticker
 * @property {'BUY'|'SELL'}    side
 * @property {number}          quantity
 * @property {number}          price       Precio medio de ejecución
 * @property {number}          commission
 * @property {string}          timestamp   Etiqueta temporal del mercado
 */
export class MarketAdapter {
  constructor() {
    if (new.target === MarketAdapter) {
      throw new TypeError('MarketAdapter es abstracto: instancia una implementación concreta.');
    }
  }

  /** Nombre legible del proveedor (se muestra en la UI). */
  get name() {
    return this.constructor.name;
  }

  /** Abre la conexión con el proveedor (sesión, websockets, auth...). */
  async connect() {
    throw notImplemented('connect');
  }

  /** @returns {Promise<MarketSnapshot>} Estado actual del mercado. */
  async getSnapshot() {
    throw notImplemented('getSnapshot');
  }

  /**
   * Avanza al siguiente "tick" de mercado y devuelve el nuevo estado.
   * - Mock: avanza un trimestre simulado.
   * - Real: esperaría al siguiente cierre / refresco de datos.
   * @returns {Promise<MarketSnapshot>}
   */
  async advance() {
    throw notImplemented('advance');
  }

  /**
   * Envía una orden a mercado.
   * @param {OrderRequest} order
   * @returns {Promise<Fill>}
   */
  // eslint-disable-next-line no-unused-vars
  async placeOrder(order) {
    throw notImplemented('placeOrder');
  }
}

function notImplemented(method) {
  return new Error(`MarketAdapter.${method}() no implementado`);
}
