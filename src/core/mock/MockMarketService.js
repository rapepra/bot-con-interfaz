import { createRng, clamp } from '../rng.js';
import { EMPRESAS, SECTORES, EVENTOS_HISTORICOS, EVENTOS_SINTETICOS } from './marketData.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MockMarketService — un "proveedor de datos" ficticio y autocontenido.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Simula un mercado por trimestres. Tiene su propia API y formato (en
 * español), como cualquier vendor externo; el juego NUNCA lo usa directamente,
 * sino a través de `MockMarketAdapter`.
 *
 * Modelo de precio por trimestre (retorno logarítmico):
 *
 *   r = cicloSectorial × amplificación(deuda)     ← las crisis duelen más con deuda
 *     − castigoDeuda                              ← carga financiera + shocks de crédito
 *     + reversión × ln(valorObjetivo·e^sentimiento / precio)
 *                                                 ← el precio orbita el valor, pero
 *                                                   "Mr. Market" se pasa de euforia a pánico
 *     + ruido(volatilidad creciente con deuda)
 *
 * Los fundamentales (EBITDA, BPA, deuda) también evolucionan con el ciclo, de
 * modo que el valor objetivo se mueve: una "ganga" puede dejar de serlo.
 */
export class MockMarketService {
  /** Parámetros del modelo, expuestos para tuning y tests. */
  static PARAMETROS = Object.freeze({
    persistenciaCiclo: 0.35, // inercia del ciclo sectorial entre trimestres
    volatilidadSector: 0.045,
    volatilidadBase: 0.075,
    volatilidadPorDeuda: 0.012,
    amplificacionBajista: 0.2, // × apalancamiento cuando el sector cae
    amplificacionAlcista: 0.05,
    castigoDeudaTrimestral: 0.006, // × apalancamiento, siempre
    velocidadReversion: 0.12,
    persistenciaSentimiento: 0.8, // "Mr. Market": euforia/pánico que dura años
    volatilidadSentimiento: 0.09,
    amortizacionDeuda: 0.04, // fracción del EBITDA anual que amortiza deuda cada trimestre
    suavizadoObjetivo: 0.25,
    probEventoSintetico: 0.2,
    slippage: 0.0015,
    comision: 0.001,
    comisionMinima: 5,
  });

  #rng;
  #trimestre = 0;
  #anioInicial;
  #empresas;
  #ciclos;
  #indiceReferencia = 100;
  #ultimoEvento = null;
  #movimientosFondos = [];

  /**
   * @param {Object} [opciones]
   * @param {number} [opciones.semilla=1975]   Semilla de la partida
   * @param {number} [opciones.anioInicial=2015]
   * @param {Array}  [opciones.empresas]       Universo alternativo (tests)
   */
  constructor({ semilla = 1975, anioInicial = 2015, empresas = EMPRESAS } = {}) {
    this.#rng = createRng(semilla);
    this.#anioInicial = anioInicial;
    this.#ciclos = Object.fromEntries(SECTORES.map((s) => [s, 0]));
    this.#empresas = empresas.map((e) => {
      const empresa = { ...e, precioAnterior: e.precio, historial: [e.precio], sentimiento: 0 };
      empresa.valorObjetivo = MockMarketService.valorIntrinseco(empresa);
      return empresa;
    });
    this.#movimientosFondos = this.#calcularMovimientosFondos();
  }

  // ── API pública del proveedor ────────────────────────────────────────────

  /** Reloj del mercado: índice de trimestre y etiqueta "2015-T1". */
  obtenerReloj() {
    const anio = this.#anioInicial + Math.floor(this.#trimestre / 4);
    const t = (this.#trimestre % 4) + 1;
    return { indice: this.#trimestre, etiqueta: `${anio}-T${t}` };
  }

  /** Fotografía de todas las empresas con ratios derivados. */
  obtenerEmpresas() {
    return this.#empresas.map((e) => ({
      simbolo: e.simbolo,
      nombre: e.nombre,
      sector: e.sector,
      divisa: e.divisa,
      precio: e.precio,
      variacion: e.precio / e.precioAnterior - 1,
      acciones: e.acciones,
      capitalizacion: e.precio * e.acciones,
      ebitda: e.ebitda,
      deudaNeta: e.deudaNeta,
      bpa: e.bpa,
      per: e.bpa > 0 ? e.precio / e.bpa : Infinity,
      valorObjetivo: e.valorObjetivo,
      fondo: e.fondo,
      tesis: e.tesis,
      historial: [...e.historial],
    }));
  }

  /** Últimos movimientos reportados por los fondos de referencia. */
  obtenerMovimientosFondos() {
    return this.#movimientosFondos.map((m) => ({ ...m }));
  }

  obtenerUltimoEvento() {
    return this.#ultimoEvento && { ...this.#ultimoEvento };
  }

  obtenerIndiceReferencia() {
    return this.#indiceReferencia;
  }

  /**
   * Avanza un trimestre: ciclo sectorial, eventos, precios, fundamentales,
   * índice de referencia y movimientos de los fondos.
   */
  avanzarTrimestre() {
    const P = MockMarketService.PARAMETROS;
    this.#trimestre += 1;
    const evento = this.#sortearEvento(this.obtenerReloj().etiqueta);
    this.#ultimoEvento = evento;

    // 1. Ciclo sectorial con inercia + shock del evento.
    for (const sector of SECTORES) {
      const shock = this.#rng.normal(0, P.volatilidadSector) + (evento?.impacto?.[sector] ?? 0);
      this.#ciclos[sector] = P.persistenciaCiclo * this.#ciclos[sector] + shock;
    }

    // 2. Precio y fundamentales de cada empresa.
    for (const e of this.#empresas) {
      const ciclo = this.#ciclos[e.sector] ?? 0;
      const apalancamiento = Math.max(0, e.deudaNeta / e.ebitda);
      e.sentimiento = P.persistenciaSentimiento * e.sentimiento + this.#rng.normal(0, P.volatilidadSentimiento);

      const retorno = clamp(
        MockMarketService.retornoTrimestral({
          ciclo,
          apalancamiento,
          shockCredito: evento?.shockCredito ?? 0,
          precio: e.precio,
          valorObjetivo: e.valorObjetivo,
          sentimiento: e.sentimiento,
          ruido: this.#rng.gaussian(),
        }),
        -0.55,
        0.6,
      );

      e.precioAnterior = e.precio;
      e.precio = Math.max(0.05, round(e.precio * Math.exp(retorno), 4));
      e.historial = [...e.historial, e.precio].slice(-40);

      // Fundamentales: el negocio también respira con el ciclo.
      const crecimiento = 0.55 * ciclo + this.#rng.normal(0, 0.03);
      e.ebitda *= Math.exp(crecimiento);
      e.bpa *= Math.exp(crecimiento * 1.3); // apalancamiento operativo
      e.deudaNeta -= e.ebitda * P.amortizacionDeuda;

      const intrinseco = MockMarketService.valorIntrinseco(e);
      e.valorObjetivo = (1 - P.suavizadoObjetivo) * e.valorObjetivo + P.suavizadoObjetivo * intrinseco;
    }

    // 3. Índice de referencia (un "MSCI World" muy simplificado).
    const impactoMedio = evento
      ? Object.values(evento.impacto ?? {}).reduce((a, b) => a + b, 0) / SECTORES.length
      : 0;
    this.#indiceReferencia *= Math.exp(0.018 + this.#rng.normal(0, 0.045) + impactoMedio * 0.5);

    // 4. Los fondos reportan sus movimientos (como en sus cartas trimestrales).
    this.#movimientosFondos = this.#calcularMovimientosFondos();

    return {
      reloj: this.obtenerReloj(),
      empresas: this.obtenerEmpresas(),
      evento: this.obtenerUltimoEvento(),
      movimientosFondos: this.obtenerMovimientosFondos(),
      indiceReferencia: this.#indiceReferencia,
    };
  }

  /**
   * Ejecuta una orden a mercado con slippage y comisión.
   * @param {{simbolo:string, lado:'COMPRA'|'VENTA', cantidad:number}} orden
   */
  ejecutarOrden({ simbolo, lado, cantidad }) {
    const P = MockMarketService.PARAMETROS;
    const empresa = this.#empresas.find((e) => e.simbolo === simbolo);
    if (!empresa) throw new Error(`Símbolo desconocido: ${simbolo}`);
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error(`Cantidad inválida: ${cantidad}`);

    const signo = lado === 'COMPRA' ? 1 : -1;
    const precioEjecucion = round(empresa.precio * (1 + signo * P.slippage), 4);
    const comision = Math.max(P.comisionMinima, precioEjecucion * cantidad * P.comision);

    return {
      simbolo,
      lado,
      cantidad,
      precioEjecucion,
      comision: round(comision, 2),
      fecha: this.obtenerReloj().etiqueta,
    };
  }

  // ── Modelo (funciones puras, testeables por separado) ────────────────────

  /** Retorno logarítmico de un trimestre. Ver cabecera de la clase. */
  static retornoTrimestral({ ciclo, apalancamiento, shockCredito = 0, precio, valorObjetivo, sentimiento = 0, ruido = 0 }) {
    const P = MockMarketService.PARAMETROS;
    const lev = Math.max(0, apalancamiento);
    const amplificacion = ciclo < 0 ? 1 + P.amplificacionBajista * lev : 1 + P.amplificacionAlcista * lev;
    const castigoDeuda = (P.castigoDeudaTrimestral + shockCredito) * lev;
    const reversion = P.velocidadReversion * (Math.log(valorObjetivo / precio) + sentimiento);
    const volatilidad = P.volatilidadBase + P.volatilidadPorDeuda * lev;
    return ciclo * amplificacion - castigoDeuda + reversion + ruido * volatilidad;
  }

  /** Valor intrínseco por acción: (EV justo − deuda neta) / acciones. */
  static valorIntrinseco({ ebitda, multiploJusto, deudaNeta, acciones }) {
    return Math.max(0.1, (ebitda * multiploJusto - deudaNeta) / acciones);
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  #sortearEvento(etiqueta) {
    if (EVENTOS_HISTORICOS[etiqueta]) return { ...EVENTOS_HISTORICOS[etiqueta], historico: true };
    const ultimaFechaHistorica = Object.keys(EVENTOS_HISTORICOS).sort().at(-1);
    if (etiqueta > ultimaFechaHistorica && this.#rng.next() < MockMarketService.PARAMETROS.probEventoSintetico) {
      return { ...this.#rng.pick(EVENTOS_SINTETICOS), historico: false };
    }
    return null;
  }

  #calcularMovimientosFondos() {
    return this.#empresas.map((e) => {
      const ratio = e.precio / e.valorObjetivo + this.#rng.normal(0, 0.04);
      let movimiento = 'MANTIENE';
      if (ratio < 0.75) movimiento = 'COMPRA';
      else if (ratio >= 0.97) movimiento = 'VENDE';
      else if (ratio >= 0.85) movimiento = 'REDUCE';
      return { fondo: e.fondo, simbolo: e.simbolo, movimiento };
    });
  }
}

function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
