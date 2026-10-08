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
import { SkyScene } from './scene/SkyScene.js';
import { DomEvents, emit, on } from './bridge/domEvents.js';
import { PanelManager, renderPortfolio, renderResearch, renderBotConsole, renderReport, standings } from './ui/panels.js';
import { sfx, toggleMute, isMuted } from './ui/sound.js';
import { checkAchievements, QUOTES } from './ui/achievements.js';
import { TIME_OF_DAY, todForQuarter } from './scene/timeOfDay.js';
import { OverrideAlert } from './ui/OverrideAlert.js';
import { renderHud, renderTicker, toast, runBoot, rankFor, rankLevel } from './ui/hud.js';
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
    this.achievements = new Set();
    this.stats = { manualBuys: 0, catPets: 0 };
    this.reportShown = false;
    /** Trimestre en el que se cierra la partida y llega la carta anual (2025 T1 = 10 años). */
    this.finalQuarter = 40;

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
      'CAPITAL CLUB OS v0.2 · (c) 1997 Deep Value Systems',
      'UBICACIÓN: PLANTA 58 · PASEO DE LA CASTELLANA, MADRID',
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
    sfx.advance();

    this.snapshot = await this.adapter.advance();
    emit(DomEvents.MARKET_CLOCK, this.snapshot.clock);
    const { event } = this.snapshot;
    const avgChange = this.snapshot.companies.reduce((s, c) => s + c.change, 0) / this.snapshot.companies.length;
    emit(DomEvents.MARKET_PULSE, {
      tone: event?.tone ?? (avgChange > 0.02 ? 'positive' : avgChange < -0.02 ? 'negative' : 'neutral'),
      magnitude: Math.max(event?.magnitude ?? 0, Math.abs(avgChange)),
    });
    if (event?.tone === 'negative' && event.magnitude > 0.1) sfx.crash();
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
    this.yearEndRecap();

    this.advanceBtn.classList.remove('loading');
    this.busy = false;
    await this.resolvePendingOrders();
    this.checkProgress();
    if (this.snapshot.clock.index >= this.finalQuarter && !this.reportShown) await this.showReport();
  }

  /** Cada cierre de año: cómo vas en la liga. */
  yearEndRecap() {
    const { index, label } = this.snapshot.clock;
    if (index === 0 || index % 4 !== 0) return;
    const rows = standings(this.portfolio);
    const year = Number(label.slice(0, 4)) - 1;
    const pos = rows.findIndex((r) => r.key === 'fund') + 1;
    const summary = rows.map((r) => `${r.key === 'fund' ? '<b>Tú</b>' : esc(r.label)} ${pct(r.total, 0)}`).join(' · ');
    toast($('#toasts'), `<span class="tag">CIERRE ${year}</span>${pos === 1 ? '👑 ' : ''}${pos}º en la liga — ${summary}`, 'rank', 7000);
  }

  /** Logros nuevos → sonido y notificación. */
  checkProgress() {
    const fresh = checkAchievements(this.achievements, {
      bot: this.bot,
      snapshot: this.snapshot,
      stats: this.stats,
      alpha: this.alpha.alpha,
      price: (t) => this.snapshot.companies.find((c) => c.ticker === t)?.price,
      league: Object.fromEntries(standings(this.portfolio).map((r) => [r.key, r.value])),
    });
    fresh.forEach((a, i) => setTimeout(() => {
      sfx.achievement();
      toast($('#toasts'), `${a.icon} Logro desbloqueado: <b>${esc(a.title)}</b> — ${esc(a.desc)}`, 'rank', 5500);
    }, i * 700));
    if (fresh.length) this.refresh();
  }

  async showReport() {
    this.reportShown = true;
    sfx.achievement();
    const first = this.portfolio.navHistory[0]?.label ?? '';
    const choice = await renderReport($('#report-layer'), {
      portfolio: this.portfolio, bot: this.bot, rank: rankFor(this.alpha.alpha), achievements: this.achievements,
      from: first, to: this.snapshot.clock.label,
    });
    if (choice === 'new') location.search = `?seed=${Math.floor(Math.random() * 1e6)}`;
  }

  /** Human-in-the-Loop: cada venta propuesta pasa por la alerta de Override. */
  async resolvePendingOrders() {
    while (this.bot.pendingOrders.size) {
      emit(DomEvents.BOT_STATE, { state: 'alert' });
      sfx.alarm();
      this.refresh();
      const order = this.bot.pendingOrders.values().next().value;
      const decision = await this.alert.prompt(order, { queueSize: this.bot.pendingOrders.size });

      if (decision === 'override') {
        this.bot.override(order.id);
        sfx.lock();
        toast($('#toasts'), `🔒 <b>${order.ticker}</b> bajo control manual. El bot no la venderá.`, 'human');
      } else {
        const fill = await this.bot.confirmSell(order.id);
        if (fill) {
          sfx.cash();
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
      if (target === 'cat') {
        this.stats.catPets += 1;
        sfx.meow();
        toast($('#toasts'), `🐈 <b>Graham</b>: ${esc(QUOTES[Math.floor(Math.random() * QUOTES.length)])}`, 'human', 5500);
        this.checkProgress();
        return;
      }
      const panel = { manager: 'portfolio', analyst: 'research', bot: 'bot' }[target];
      sfx.click();
      if (panel) this.panels.open(panel);
    });
    on(DomEvents.SCENE_READY, () => {
      emit(DomEvents.BOT_STATE, { state: this.bot.autopilot ? 'idle' : 'sleep' });
      emit(DomEvents.MARKET_CLOCK, this.snapshot.clock);
      emit(DomEvents.OFFICE_LEVEL, { level: rankLevel(this.alpha.alpha) });
      this.updateAnalyst();
    });

    this.advanceBtn.addEventListener('click', () => this.advanceQuarter());
    const mute = $('#mute');
    const paintMute = () => {
      mute.textContent = isMuted() ? '🔇' : '🔊';
      mute.setAttribute('aria-pressed', String(isMuted()));
    };
    paintMute();
    mute.addEventListener('click', () => {
      toggleMute();
      paintMute();
      sfx.click();
    });
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
      } else if (action === 'buy') {
        const fill = await this.bot.manualBuy(ticker, 0.05);
        if (fill) {
          this.stats.manualBuys += 1;
          sfx.cash();
          toast($('#toasts'), `🧠 Compra manual: ${fill.quantity} <b>${ticker}</b> a ${price(fill.price)} · posición MANUAL`, 'human');
          this.checkProgress();
        } else {
          toast($('#toasts'), 'Sin liquidez suficiente para esa compra.', 'news negative');
        }
      } else if (action === 'sell') {
        const fill = await this.bot.manualSell(ticker);
        if (fill) toast($('#toasts'), `Venta manual: ${fill.quantity} <b>${ticker}</b> a ${price(fill.price)}`, 'human');
      } else if (action === 'autopilot') {
        this.bot.setAutopilot(!this.bot.autopilot);
        emit(DomEvents.BOT_STATE, { state: this.bot.autopilot ? 'idle' : 'sleep' });
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.target.closest?.('input, textarea')) return;
      // Espacio nunca "pulsa" el botón enfocado: evita overrides accidentales.
      if (event.code === 'Space') event.preventDefault();
      if (this.alert.isOpen || !$('#report-layer').hidden) return;
      if (event.code === 'Space') {
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
      scene: [SkyScene, OfficeScene],
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  get nav() {
    return this.portfolio.nav(priceMap(this.snapshot.companies));
  }

  recordNav() {
    const funds = Object.fromEntries(this.snapshot.funds.map((f) => [f.name, f.nav]));
    this.portfolio.record(this.snapshot.clock.label, this.nav, this.snapshot.benchmark, funds);
  }

  get alpha() {
    const first = this.portfolio.navHistory[0];
    const totalReturn = this.nav / this.portfolio.initialCash - 1;
    const bench = first ? this.snapshot.benchmark / first.benchmark - 1 : 0;
    return { totalReturn, alpha: totalReturn - bench };
  }

  refresh() {
    const ctx = { snapshot: this.snapshot, portfolio: this.portfolio, bot: this.bot, adapterName: this.adapter.name, achievements: this.achievements };
    const { totalReturn, alpha } = this.alpha;
    const timeOfDay = TIME_OF_DAY[todForQuarter(this.snapshot.clock.index)].label;
    renderHud($('#hud'), { clock: this.snapshot.clock, nav: this.nav, totalReturn, alpha, cash: this.portfolio.cash, timeOfDay });
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
      const up = rankLevel(this.alpha.alpha) > this.lastLevel;
      if (up) sfx.achievement();
      toast($('#toasts'), `${up ? '🏆' : '📉'} Nuevo rango: <b>${rank}</b>${up ? ' · ¡la oficina mejora!' : ''}`, 'rank', 5000);
    }
    this.lastLevel = rankLevel(this.alpha.alpha);
    emit(DomEvents.OFFICE_LEVEL, { level: this.lastLevel });
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
