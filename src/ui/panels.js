import { money, pct, price, tone, arrow, esc, leverageLabel, SECTOR_LABELS, ACTION_LABELS } from './format.js';
import { sparkline, navChart, bindNavChart } from './charts.js';
import { priceMap } from '../core/Portfolio.js';

/**
 * Gestor de paneles tipo "drawer": solo uno abierto a la vez, Esc para cerrar.
 */
export class PanelManager {
  constructor(panels) {
    this.panels = panels; // { id: HTMLElement }
    this.current = null;
    for (const [id, el] of Object.entries(panels)) {
      el.querySelector('[data-close]')?.addEventListener('click', () => this.close());
      el.addEventListener('transitionend', () => {
        if (!el.classList.contains('open')) el.hidden = true;
      });
      el.dataset.panel = id;
    }
  }

  open(id) {
    if (this.current === id) return this.close();
    this.close();
    const el = this.panels[id];
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
    this.current = id;
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.toggle('active', b.dataset.open === id));
  }

  close() {
    if (!this.current) return;
    this.panels[this.current].classList.remove('open');
    this.current = null;
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.remove('active'));
  }

  isOpen(id) {
    return this.current === id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PORT <GO> — Terminal del Portfolio (mesa del gestor)
// ─────────────────────────────────────────────────────────────────────────────

export function renderPortfolio(root, { snapshot, portfolio, bot }) {
  const prices = priceMap(snapshot.companies);
  const nav = portfolio.nav(prices);
  const invested = portfolio.marketValue(prices);
  const totalReturn = nav / portfolio.initialCash - 1;
  const bench = portfolio.navHistory.length ? snapshot.benchmark / portfolio.navHistory[0].benchmark - 1 : 0;
  const alpha = totalReturn - bench;
  const score = bot.overrideScore();
  const pendingTickers = new Set([...bot.pendingOrders.values()].map((o) => o.ticker));

  const rows = portfolio.positions
    .map((p) => {
      const c = snapshot.companies.find((co) => co.ticker === p.ticker);
      const value = p.shares * c.price;
      const pnl = c.price / p.avgCost - 1;
      const progress = Math.max(0, Math.min(1, c.price / c.targetValue));
      const status = pendingTickers.has(p.ticker)
        ? `<span class="badge alert">VENTA PENDIENTE</span>`
        : p.locked
          ? `<span class="badge manual" title="Override desde ${esc(p.lockedAt?.label ?? '')} a ${price(p.lockedAt?.price ?? 0)}">MANUAL</span>`
          : `<span class="badge auto">AUTO</span>`;
      return `<div class="pos-row ${p.locked ? 'is-locked' : ''}" role="row">
        <div class="cell asset" role="cell">
          <span class="ticker">${esc(c.ticker)}</span>
          <span class="name">${esc(c.name)}</span>
          <span class="chip">${SECTOR_LABELS[c.sector] ?? c.sector}</span>
        </div>
        <div class="cell num" role="cell">
          <span class="big">${price(c.price)}</span>
          <span class="${tone(c.change)}">${arrow(c.change)} ${pct(c.change)}</span>
        </div>
        <div class="cell runway" role="cell">
          <div class="runway-head"><span>Obj. ${price(c.targetValue)}</span><span class="${tone(c.upside)}">${c.upside >= 0 ? 'recorrido' : 'sobre obj.'} ${pct(c.upside, 0)}</span></div>
          <div class="bar" style="--p:${(progress * 100).toFixed(1)}%"><i></i></div>
        </div>
        <div class="cell spark-cell" role="cell">${sparkline(c.history.slice(-16), { target: c.targetValue })}</div>
        <div class="cell num" role="cell">
          <span class="big ${tone(pnl)}">${pct(pnl)}</span>
          <span class="muted">${money(value)} · ${((value / nav) * 100).toFixed(1)}%</span>
        </div>
        <div class="cell controls" role="cell">
          ${status}
          <button class="lock-toggle" role="switch" aria-checked="${p.locked}" data-action="lock" data-ticker="${esc(p.ticker)}" title="Bloquear bot en ${esc(p.ticker)}">
            <span class="knob"></span><span class="lbl">${p.locked ? 'BOT BLOQUEADO' : 'BLOQUEAR BOT'}</span>
          </button>
          ${p.locked ? `<button class="btn-mini danger" data-action="sell" data-ticker="${esc(p.ticker)}">VENDER</button>` : ''}
        </div>
      </div>`;
    })
    .join('');

  const watch = snapshot.companies
    .filter((c) => !portfolio.get(c.ticker))
    .map((c) => {
      const f = snapshot.filings.find((fi) => fi.ticker === c.ticker);
      return `<li><b>${esc(c.ticker)}</b> ${price(c.price)} <span class="${tone(c.upside)}">${pct(c.upside, 0)}</span>
        <span class="filing ${f?.action}">${esc(c.fund)} · ${ACTION_LABELS[f?.action] ?? '—'}</span></li>`;
    })
    .join('');

  root.innerHTML = `
    <section class="kpis">
      ${kpi('NAV', money(nav), `<span class="${tone(totalReturn)}">${pct(totalReturn)}</span> desde inicio`)}
      ${kpi('LIQUIDEZ', money(portfolio.cash), `${((portfolio.cash / nav) * 100).toFixed(0)}% del fondo`)}
      ${kpi('INVERTIDO', money(invested), `${portfolio.positions.length} posiciones`)}
      ${kpi('ALPHA', `<span class="${tone(alpha)}">${pct(alpha)}</span>`, `vs índice ${pct(bench)}`)}
      ${kpi('OVERRIDES', `${score.total}`, score.ratio === null ? 'sin historial' : `<span class="${score.ratio >= 0.5 ? 'up' : 'down'}">${(score.ratio * 100).toFixed(0)}% acierto</span>`)}
      ${kpi('P&L REALIZADO', `<span class="${tone(portfolio.realizedPnl)}">${money(portfolio.realizedPnl)}</span>`, 'ventas cerradas')}
    </section>
    <section class="block">
      <header class="block-head"><h3>NAV vs ÍNDICE</h3></header>
      ${navChart(portfolio.navHistory, portfolio.initialCash)}
    </section>
    <section class="block">
      <header class="block-head"><h3>POSICIONES</h3><span class="hint">El bot vende al tocar el valor objetivo. Bloquéalo para mandar tú.</span></header>
      <div class="pos-table" role="table" aria-label="Posiciones">
        <div class="pos-row head" role="row">
          <div role="columnheader">Activo</div><div role="columnheader">Precio</div><div role="columnheader">Valor objetivo</div>
          <div role="columnheader">16T</div><div role="columnheader">P&amp;L · Peso</div><div role="columnheader">Control</div>
        </div>
        ${rows || `<div class="empty">Cartera vacía. El bot espera a que Azvalor o Cobas compren con descuento.</div>`}
      </div>
    </section>
    <section class="block">
      <header class="block-head"><h3>RADAR · NO EN CARTERA</h3></header>
      <ul class="watch">${watch || '<li class="muted">Todo el universo está en cartera.</li>'}</ul>
    </section>`;
  bindNavChart(root);
}

const kpi = (label, value, sub) => `<div class="kpi"><span class="k">${label}</span><span class="v">${value}</span><span class="s">${sub}</span></div>`;

// ─────────────────────────────────────────────────────────────────────────────
//  RSCH <GO> — Mesa del analista
// ─────────────────────────────────────────────────────────────────────────────

export function renderResearch(root, { snapshot }) {
  const event = snapshot.event;
  const cards = [...snapshot.companies]
    .sort((a, b) => b.upside - a.upside)
    .map((c) => {
      const lev = leverageLabel(c.leverage);
      const f = snapshot.filings.find((fi) => fi.ticker === c.ticker);
      const verdict = analystVerdict(c);
      return `<article class="rcard ${verdict.cls}">
        <header><span class="ticker">${esc(c.ticker)}</span><span class="chip">${SECTOR_LABELS[c.sector]}</span></header>
        <h4>${esc(c.name)}</h4>
        <dl>
          <dt>Precio</dt><dd>${price(c.price)} <small class="${tone(c.change)}">${pct(c.change)}</small></dd>
          <dt>Valor obj.</dt><dd>${price(c.targetValue)}</dd>
          <dt>PER</dt><dd>${Number.isFinite(c.per) && c.per > 0 ? c.per.toFixed(1) + 'x' : 'n/a'}</dd>
          <dt>DN/EBITDA</dt><dd class="${lev.cls}">${lev.text}</dd>
          <dt>Descuento</dt><dd class="${tone(c.upside)}">${pct(c.upside, 0)}</dd>
        </dl>
        <p class="thesis">“${esc(c.thesis)}”</p>
        <footer><span class="filing ${f?.action}">${esc(c.fund)} ▸ ${ACTION_LABELS[f?.action] ?? '—'}</span><span class="verdict">${verdict.text}</span></footer>
      </article>`;
    })
    .join('');

  root.innerHTML = `
    <section class="newsflash ${event ? event.tone : 'neutral'}">
      <span class="tag">${event ? (event.historical ? 'HISTÓRICO' : 'ÚLTIMA HORA') : 'SIN NOVEDAD'}</span>
      <p>${event ? esc(event.headline) : 'Trimestre tranquilo. El analista aprovecha para leer cuentas anuales.'}</p>
    </section>
    <div class="rgrid">${cards}</div>
    <p class="disclaimer">Empresas reales con cifras ilustrativas y simuladas. No es recomendación de inversión.</p>`;
}

export function analystVerdict(c) {
  if (c.upside >= 0.4 && c.leverage < 1.5) return { text: '💡 GANGA', cls: 'bargain' };
  if (c.upside >= 0.2 && c.leverage < 3) return { text: 'BARATA', cls: 'cheap' };
  if (c.upside <= 0) return { text: 'PRECIO JUSTO', cls: 'fair' };
  if (c.leverage >= 3) return { text: '⚠ DEUDA', cls: 'risky' };
  return { text: 'VIGILAR', cls: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOT <GO> — Consola del servidor
// ─────────────────────────────────────────────────────────────────────────────

export function renderBotConsole(root, { bot, adapterName }) {
  const r = bot.rules;
  const pending = [...bot.pendingOrders.values()];
  const log = bot.log
    .slice(-60)
    .reverse()
    .map((e) => `<li class="lv-${e.level}"><time>${esc(e.label)}</time><span>${esc(e.message)}</span></li>`)
    .join('');

  root.innerHTML = `
    <section class="bot-status">
      <div class="bot-face ${pending.length ? 'alert' : bot.autopilot ? 'idle' : 'sleep'}" aria-hidden="true"><i></i><i></i></div>
      <div>
        <p class="bot-title">VALUE-BOT 9000 <small>${esc(adapterName)}</small></p>
        <p class="muted">${pending.length ? `${pending.length} orden(es) esperando al gestor` : bot.autopilot ? 'Vigilando las cartas de Azvalor y Cobas…' : 'Durmiendo. Autopiloto apagado.'}</p>
      </div>
      <button class="autopilot-toggle" role="switch" aria-checked="${bot.autopilot}" data-action="autopilot">
        <span class="knob"></span><span class="lbl">AUTOPILOTO ${bot.autopilot ? 'ON' : 'OFF'}</span>
      </button>
    </section>
    <section class="block">
      <header class="block-head"><h3>REGLAS DEL ALGORITMO</h3></header>
      <ul class="rules">
        <li><b>COMPRA</b> cuando un fondo de referencia reporta compra y el descuento ≥ ${(r.minUpside * 100).toFixed(0)}%.</li>
        <li><b>FILTRO</b> deuda neta / EBITDA ≤ ${r.maxLeverage}x. Peso ${(r.targetWeight * 100).toFixed(0)}% con caja neta, menos cuanto más deuda.</li>
        <li><b>VENTA</b> al tocar el valor objetivo o si el fondo sale. <em>Siempre con ventana de OVERRIDE.</em></li>
        <li><b>LIQUIDEZ</b> mínima ${(r.cashBuffer * 100).toFixed(0)}% del NAV.</li>
      </ul>
    </section>
    <section class="block">
      <header class="block-head"><h3>LOG</h3><span class="hint">${bot.log.length} eventos</span></header>
      <ol class="console">${log || '<li class="muted">Sin actividad todavía.</li>'}</ol>
    </section>`;
}
