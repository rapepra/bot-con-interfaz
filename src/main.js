/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Capital Club: The Value Tycoon — capa de integración ("pegamento").
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ┌──────────────┐  CustomEvents  ┌──────────────────┐   async API   ┌──────────────────┐
 *   │ OfficeScene  │ ◄────────────► │  GameController  │ ────────────► │  MarketAdapter   │
 *   │  (Phaser)    │                │  + UI (DOM)      │               │  (Mock / Broker) │
 *   └──────────────┘                └────────┬─────────┘               └──────────────────┘
 *                                            │ eventos
 *                                     ┌──────┴──────┐
 *                                     │ TradingBot  │──► Portfolio
 *                                     └─────────────┘
 *
 * Para pasar a real: sustituye `new MockMarketAdapter(...)` por tu adaptador
 * de broker. Nada más en este archivo debería cambiar.
 */
import { MockMarketService } from './core/mock/MockMarketService.js';
import { MockMarketAdapter } from './core/mock/MockMarketAdapter.js';
import { Portfolio, priceMap } from './core/Portfolio.js';
import { TradingBot } from './core/TradingBot.js';
import { OfficeScene } from './scene/OfficeScene.js';
import { DomEvents, emit, on } from './bridge/domEvents.js';
import { PanelManager, renderPortfolio, renderResearch, renderBotConsole } from './ui/panels.js';
import { OverrideAlert } from './ui/OverrideAlert.js';
import { renderHud, renderTicker, toast, runBoot, rankFor } from './ui/hud.js';
import { pct, price, esc } from './ui/format.js';

/* global Phaser */

const $ = (selector) => document.querySelector(selector);

class GameController {
  /** @param {import('./core/MarketAdapter.js').MarketAdapter} adapter */
  constructor(adapter) {
    this.adapter = adapter;
    this.portfolio = new Portfolio({ initialCash: 1_000_000 });
    this.bot = new TradingBot({ adapter, portfolio: this.portfolio });
    this.snapshot = null;
    this.busy = false;
    this.lastRank = null;

    this.panels = new PanelManager({
      portfolio: $('#panel-portfolio'),
      research: $('#panel-research'),
      bot: $('#panel-bot'),
    });
    this.alert = new OverrideAlert($('#override-layer'), { seconds: 15 });
    this.advanceBtn = $('#advance');
  }

  async start() {
    const connection = await this.adapter.connect();
    this.snapshot = await this.adapter.getSnapshot();

    await runBoot($('#boot'), [
      'CAPITAL CLUB OS v0.1 · (c) 1997 Deep Value Systems',
      'MEM CHECK ............................. <b>640K OK</b>',
      'CARGANDO MOTOR FINANCIERO ............. <b>OK</b>',
      `ADAPTADOR: ${esc(connection.provider)} ... <b>CONECTADO</b>`,
      `UNIVERSO: ${this.snapshot.companies.map((c) => c.ticker).join(' · ')}`,
      'FONDOS VIGILADOS: AZVALOR · COBAS AM',
      'VALUE-BOT 9000 ........................ <b>ONLINE</b>',
      '<span class="blink">▌</span> Bienvenido, gestor.',
    ]);

    this.wireBot();
    this.wireUi();
    this.startPhaser();

    // Asignación inicial: el bot construye cartera con las señales de partida.
    await this.bot.evaluate(this.snapshot);
    this.recordNav();
    this.refresh();
    this.updateAnalyst();
    toast($('#toasts'), 'Haz clic en tu <b>mesa</b> para abrir la terminal. <kbd>Espacio</kbd> avanza el trimestre.', 'info', 6500);
  }

  // ── Bucle de juego ───────────────────────────────────────────────────────

  async advanceQuarter() {
    if (this.busy) return;
    if (this.bot.pendingOrders.size || this.alert.isOpen) {
      this.advanceBtn.classList.add('nope');
      setTimeout(() => this.advanceBtn.classList.remove('nope'), 400);
      return;
    }
    this.busy = true;
    this.advanceBtn.classList.add('loading');

    this.snapshot = await this.adapter.advance();
    const { event } = this.snapshot;
    const avgChange = this.snapshot.companies.reduce((s, c) => s + c.change, 0) / this.snapshot.companies.length;
    emit(DomEvents.MARKET_PULSE, {
      tone: event?.tone ?? (avgChange > 0.02 ? 'positive' : avgChange < -0.02 ? 'negative' : 'neutral'),
      magnitude: Math.max(event?.magnitude ?? 0, Math.abs(avgChange)),
    });
    if (event) {
      toast($('#toasts'), `<span class="tag">${event.historical ? 'HISTÓRICO' : 'ÚLTIMA HORA'}</span>${esc(event.headline)}`, `news ${event.tone}`, 6000);
    }

    const { executed } = await this.bot.evaluate(this.snapshot);
    if (executed.length) {
      emit(DomEvents.BOT_STATE, { state: 'trading' });
      const list = executed.map((f) => `<b>${f.ticker}</b> ×${f.quantity}`).join(', ');
      toast($('#toasts'), `🤖 El bot compra ${list}`, 'trade');
    }

    this.recordNav();
    this.updateAnalyst();
    this.refresh();
    this.checkRank();

    this.advanceBtn.classList.remove('loading');
    this.busy = false;
    await this.resolvePendingOrders();
  }

  /** Human-in-the-Loop: cada venta propuesta pasa por la alerta de Override. */
  async resolvePendingOrders() {
    while (this.bot.pendingOrders.size) {
      emit(DomEvents.BOT_STATE, { state: 'alert' });
      this.refresh();
      const order = this.bot.pendingOrders.values().next().value;
      const decision = await this.alert.prompt(order, { queueSize: this.bot.pendingOrders.size });

      if (decision === 'override') {
        this.bot.override(order.id);
        toast($('#toasts'), `🔒 <b>${order.ticker}</b> bajo control manual. El bot no la venderá.`, 'human');
      } else {
        const fill = await this.bot.confirmSell(order.id);
        if (fill) {
          const pnl = fill.price / order.avgCost - 1;
          toast($('#toasts'), `💰 Vendidas ${fill.quantity} <b>${fill.ticker}</b> a ${price(fill.price)} (${pct(pnl)})`, 'trade');
        }
      }
    }
    emit(DomEvents.BOT_STATE, { state: this.bot.autopilot ? 'idle' : 'sleep' });
    this.recordNav();
    this.refresh();
  }

  // ── Cableado ─────────────────────────────────────────────────────────────

  wireBot() {
    // Si un panel está abierto, se refresca en vivo con cada cambio del bot.
    this.bot.on('change', () => this.snapshot && this.refresh());
  }

  wireUi() {
    on(DomEvents.OFFICE_INTERACT, ({ target }) => {
      const panel = { manager: 'portfolio', analyst: 'research', bot: 'bot' }[target];
      if (panel) this.panels.open(panel);
    });
    on(DomEvents.SCENE_READY, () => {
      emit(DomEvents.BOT_STATE, { state: this.bot.autopilot ? 'idle' : 'sleep' });
      this.updateAnalyst();
    });

    this.advanceBtn.addEventListener('click', () => this.advanceQuarter());
    document.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => this.panels.open(btn.dataset.open)));

    // Delegación de acciones dentro de los paneles.
    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const { action, ticker } = btn.dataset;
      if (action === 'lock') {
        const locked = this.portfolio.get(ticker)?.locked;
        this.bot.setLock(ticker, !locked);
        toast($('#toasts'), locked ? `🤖 <b>${ticker}</b> vuelve al bot.` : `🔒 <b>${ticker}</b> bloqueada: control manual.`, 'human');
      } else if (action === 'sell') {
        const fill = await this.bot.manualSell(ticker);
        if (fill) toast($('#toasts'), `Venta manual: ${fill.quantity} <b>${ticker}</b> a ${price(fill.price)}`, 'human');
      } else if (action === 'autopilot') {
        this.bot.setAutopilot(!this.bot.autopilot);
        emit(DomEvents.BOT_STATE, { state: this.bot.autopilot ? 'idle' : 'sleep' });
      }
    });

    window.addEventListener('keydown', (event) => {
      if (this.alert.isOpen || event.target.closest?.('input, textarea')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.advanceQuarter();
      } else if (event.key === 'Escape') {
        this.panels.close();
      } else {
        const panel = { F1: 'portfolio', F2: 'research', F3: 'bot', 1: 'portfolio', 2: 'research', 3: 'bot' }[event.key];
        if (panel) {
          event.preventDefault();
          this.panels.open(panel);
        }
      }
    });
  }

  startPhaser() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#0b0a12',
      antialias: true,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: [OfficeScene],
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  get nav() {
    return this.portfolio.nav(priceMap(this.snapshot.companies));
  }

  recordNav() {
    this.portfolio.record(this.snapshot.clock.label, this.nav, this.snapshot.benchmark);
  }

  get alpha() {
    const first = this.portfolio.navHistory[0];
    const totalReturn = this.nav / this.portfolio.initialCash - 1;
    const bench = first ? this.snapshot.benchmark / first.benchmark - 1 : 0;
    return { totalReturn, alpha: totalReturn - bench };
  }

  refresh() {
    const ctx = { snapshot: this.snapshot, portfolio: this.portfolio, bot: this.bot, adapterName: this.adapter.name };
    const { totalReturn, alpha } = this.alpha;
    renderHud($('#hud'), { clock: this.snapshot.clock, nav: this.nav, totalReturn, alpha, cash: this.portfolio.cash });
    renderTicker($('#ticker-track'), this.snapshot);
    renderPortfolio($('#panel-portfolio .panel-body'), ctx);
    renderResearch($('#panel-research .panel-body'), ctx);
    renderBotConsole($('#panel-bot .panel-body'), ctx);

    const pending = this.bot.pendingOrders.size;
    this.advanceBtn.disabled = pending > 0;
    this.advanceBtn.querySelector('.label').textContent = pending ? 'DECISIÓN PENDIENTE' : 'AVANZAR TRIMESTRE';
    $('[data-open=bot]').classList.toggle('pulse', pending > 0);
  }

  /** El analista reacciona: suda con las caídas, se ilumina con las gangas. */
  updateAnalyst() {
    if (!this.snapshot) return;
    const { companies, event } = this.snapshot;
    const avgChange = companies.reduce((s, c) => s + c.change, 0) / companies.length;
    const bargain = [...companies].filter((c) => c.upside >= 0.4 && c.leverage < 1.5).sort((a, b) => b.upside - a.upside)[0];

    if (event?.tone === 'negative' || avgChange < -0.06) {
      emit(DomEvents.ANALYST_MOOD, { mood: 'sweat', message: `Uff… el sector cae ${pct(avgChange)}` });
    } else if (bargain) {
      const ratio = 1 / (1 + bargain.upside);
      emit(DomEvents.ANALYST_MOOD, { mood: 'bulb', message: `¡Ganga! ${bargain.ticker} a ${ratio.toFixed(2)}x su valor` });
    } else {
      emit(DomEvents.ANALYST_MOOD, { mood: 'idle' });
    }
  }

  checkRank() {
    const rank = rankFor(this.alpha.alpha);
    if (this.lastRank && rank !== this.lastRank) {
      toast($('#toasts'), `🏆 Nuevo rango: <b>${rank}</b>`, 'rank', 5000);
    }
    this.lastRank = rank;
  }
}

// ── Arranque ─────────────────────────────────────────────────────────────────

const seed = Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 1e6);
const adapter = new MockMarketAdapter(new MockMarketService({ semilla: seed }));
const game = new GameController(adapter);

// Las fuentes deben estar listas antes de que Phaser rasterice sus textos.
document.fonts.ready.then(() => game.start());

// Acceso de depuración desde la consola: window.capitalClub.bot.log, etc.
window.capitalClub = Object.assign(game, { seed });
