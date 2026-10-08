import { money, pct, esc } from './format.js';

/**
 * Sparkline SVG minimalista (una serie: sin leyenda; la fila ya la nombra).
 * Marca con un punto el último valor y dibuja la línea del valor objetivo.
 */
export function sparkline(values, { width = 96, height = 28, target = null } = {}) {
  if (values.length < 2) values = [values[0], values[0]];
  const all = target ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v) => height - 3 - ((v - min) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const up = values.at(-1) >= values[0];
  const targetLine = target
    ? `<line x1="0" x2="${width}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" class="spark-target"/>`
    : '';
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    ${targetLine}<path d="${d}"/><circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values.at(-1)).toFixed(1)}" r="2.2"/>
  </svg>`;
}

/**
 * Gráfico NAV del fondo vs índice de referencia, ambos indexados a base 100
 * (un único eje). El fondo es la serie protagonista; el índice, contexto en gris.
 * Leyenda + etiquetas directas al final + crosshair con tooltip al pasar el ratón.
 */
export function navChart(history, initialCash) {
  if (history.length < 2) {
    return `<div class="chart-empty">El histórico aparecerá al avanzar el primer trimestre.</div>`;
  }
  const W = 640, H = 170, L = 38, R = 64, T = 12, B = 22;
  const fund = history.map((h) => (h.nav / initialCash) * 100);
  const bench = history.map((h) => (h.benchmark / history[0].benchmark) * 100);
  const min = Math.min(...fund, ...bench) * 0.97;
  const max = Math.max(...fund, ...bench) * 1.03;
  const x = (i) => L + (i / (history.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const path = (series) => series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const ticks = niceTicks(min, max, 4)
    .map((t) => `<g class="tick"><line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 3}">${t}</text></g>`)
    .join('');
  const step = Math.max(1, Math.ceil(history.length / 6));
  const xLabels = history
    .map((h, i) => (i % step === 0 || i === history.length - 1 ? `<text class="xl" x="${x(i)}" y="${H - 6}">${esc(h.label)}</text>` : ''))
    .join('');

  const last = history.length - 1;
  const data = history.map((h, i) => ({ label: h.label, fund: fund[i], bench: bench[i], nav: h.nav }));

  return `<div class="nav-chart" data-points='${esc(JSON.stringify(data))}' data-geom='${JSON.stringify({ W, L, R, n: history.length })}'>
    <div class="legend" role="list">
      <span role="listitem"><i class="sw fund"></i>Capital Club (NAV)</span>
      <span role="listitem"><i class="sw bench"></i>Índice de referencia</span>
      <span class="legend-note">base 100</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del NAV frente al índice de referencia">
      ${ticks}${xLabels}
      <line x1="${L}" x2="${W - R}" y1="${y(100)}" y2="${y(100)}" class="base100"/>
      <path class="line bench" d="${path(bench)}"/>
      <path class="line fund" d="${path(fund)}"/>
      <circle class="end fund" cx="${x(last)}" cy="${y(fund[last])}" r="4"/>
      <text class="direct" x="${x(last) + 8}" y="${y(fund[last]) + 4}">${fund[last].toFixed(0)}</text>
      <text class="direct muted" x="${x(last) + 8}" y="${y(bench[last]) + 4}">${bench[last].toFixed(0)}</text>
      <line class="crosshair" y1="${T}" y2="${H - B}" x1="0" x2="0"/>
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

/** Activa crosshair + tooltip en todos los navChart dentro de `root`. */
export function bindNavChart(root) {
  const chart = root.querySelector('.nav-chart');
  if (!chart) return;
  const points = JSON.parse(chart.dataset.points);
  const { W, L, R, n } = JSON.parse(chart.dataset.geom);
  const svg = chart.querySelector('svg');
  const cross = chart.querySelector('.crosshair');
  const tip = chart.querySelector('.chart-tip');

  svg.addEventListener('pointermove', (event) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - L) / (W - L - R)) * (n - 1));
    const p = points[Math.max(0, Math.min(n - 1, i))];
    const px = L + (points.indexOf(p) / (n - 1)) * (W - L - R);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.style.opacity = 1;
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(p.label)}</b><span><i class="sw fund"></i>NAV ${money(p.nav)} · ${pct(p.fund / 100 - 1)}</span><span><i class="sw bench"></i>Índice ${pct(p.bench / 100 - 1)}</span>`;
    const left = (px / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - 190, Math.max(0, left + 12))}px`;
  });
  svg.addEventListener('pointerleave', () => {
    cross.style.opacity = 0;
    tip.hidden = true;
  });
}

function niceTicks(min, max, count) {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(Math.round(t));
  return ticks;
}
