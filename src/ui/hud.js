import { money, pct, price, tone, arrow, esc, ACTION_LABELS } from './format.js';

/** Rangos del jugador según su alpha acumulado frente al índice. */
const RANKS = [
  [-Infinity, 'Becario'],
  [-0.15, 'Analista Junior'],
  [-0.02, 'Gestor Value'],
  [0.2, 'Discípulo de Graham'],
  [0.5, 'Leyenda Value'],
];

export function rankFor(alpha) {
  return RANKS.filter(([min]) => alpha >= min).at(-1)[1];
}

export function renderHud(el, { clock, nav, totalReturn, alpha, cash }) {
  el.querySelector('[data-hud=quarter]').textContent = clock.label;
  el.querySelector('[data-hud=nav]').textContent = money(nav);
  const ret = el.querySelector('[data-hud=return]');
  ret.textContent = pct(totalReturn);
  ret.className = tone(totalReturn);
  el.querySelector('[data-hud=cash]').textContent = money(cash);
  const a = el.querySelector('[data-hud=alpha]');
  a.textContent = pct(alpha);
  a.className = tone(alpha);
  el.querySelector('[data-hud=rank]').textContent = rankFor(alpha);
}

/** Cinta de cotizaciones inferior (contenido duplicado para bucle continuo). */
export function renderTicker(track, snapshot) {
  const quotes = snapshot.companies.map(
    (c) => `<span class="tk"><b>${esc(c.ticker)}</b> ${price(c.price)} <em class="${tone(c.change)}">${arrow(c.change)} ${pct(c.change)}</em></span>`,
  );
  const filings = snapshot.filings
    .filter((f) => f.action !== 'HOLD')
    .map((f) => `<span class="tk filing ${f.action}">${esc(f.fund.toUpperCase())} ▸ ${ACTION_LABELS[f.action]} ${esc(f.ticker)}</span>`);
  const news = snapshot.event ? [`<span class="tk news ${snapshot.event.tone}">◆ ${esc(snapshot.event.headline.toUpperCase())}</span>`] : [];
  const items = [...news, ...quotes, ...filings, `<span class="tk muted">ÍNDICE REF. ${snapshot.benchmark.toFixed(1)}</span>`].join('');
  track.innerHTML = items + items;
}

/** Notificaciones efímeras apiladas. */
export function toast(container, html, kind = 'info', ms = 4200) {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = html;
  container.prepend(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 400);
  }, ms);
}

/** Pantalla de arranque estilo BIOS de los 90. Se puede saltar con clic/tecla. */
export function runBoot(el, lines) {
  return new Promise((resolve) => {
    const out = el.querySelector('.boot-lines');
    let i = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 500);
    };
    const step = () => {
      if (done) return;
      if (i >= lines.length) return setTimeout(finish, 700);
      const li = document.createElement('li');
      li.innerHTML = lines[i++];
      out.append(li);
      setTimeout(step, 170 + Math.random() * 160);
    };
    el.addEventListener('click', finish, { once: true });
    window.addEventListener('keydown', finish, { once: true });
    step();
  });
}
