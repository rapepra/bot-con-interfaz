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

/** Series del gráfico de la liga: color validado (CVD) por entidad, nunca por rango. */
export const LEAGUE_SERIES = [
  { key: 'fund', label: 'Capital Club', cls: 'fund' },
  { key: 'Cobas AM', label: 'Cobas AM', cls: 'cobas' },
  { key: 'Azvalor', label: 'Azvalor', cls: 'azvalor' },
  { key: 'bench', label: 'Índice', cls: 'bench' },
];

/** Normaliza el histórico a base 100 para cada competidor de la liga. */
export function leagueSeries(history, initialCash) {
  const b0 = history[0]?.benchmark ?? 100;
  return {
    fund: history.map((h) => (h.nav / initialCash) * 100),
    'Cobas AM': history.map((h) => h.funds?.['Cobas AM'] ?? 100),
    Azvalor: history.map((h) => h.funds?.Azvalor ?? 100),
    bench: history.map((h) => (h.benchmark / b0) * 100),
  };
}

/**
 * Gráfico de la liga: tu fondo frente a Cobas AM, Azvalor y el índice, todo en
 * base 100 (un único eje). Leyenda + etiquetas directas al final (con
 * anticolisión) + crosshair con tooltip.
 */
export function navChart(history, initialCash) {
  if (history.length < 2) {
    return `<div class="chart-empty">El histórico aparecerá al avanzar el primer trimestre.</div>`;
  }
  const W = 640, H = 190, L = 38, R = 112, T = 12, B = 22;
  const data = leagueSeries(history, initialCash);
  const all = Object.values(data).flat();
  const min = Math.min(...all) * 0.97;
  const max = Math.max(...all) * 1.03;
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
  // Etiquetas directas: se ordenan por altura y se separan al menos 12px.
  const ends = LEAGUE_SERIES.map((s) => ({ ...s, v: data[s.key][last], ly: y(data[s.key][last]) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + 12);
  const labels = ends
    .map((e) => `<text class="direct ${e.cls}" x="${x(last) + 8}" y="${e.ly + 4}">${esc(e.label)} ${e.v.toFixed(0)}</text>`)
    .join('');

  // Se pintan de atrás adelante: índice, rivales y tu fondo encima.
  const lines = [...LEAGUE_SERIES].reverse().map((s) => `<path class="line ${s.cls}" d="${path(data[s.key])}"/>`).join('');
  const points = history.map((h, i) => ({ label: h.label, nav: h.nav, ...Object.fromEntries(LEAGUE_SERIES.map((s) => [s.key, data[s.key][i]])) }));

  return `<div class="nav-chart" data-points='${esc(JSON.stringify(points))}' data-geom='${JSON.stringify({ W, L, R, n: history.length })}'>
    <div class="legend" role="list">
      ${LEAGUE_SERIES.map((s) => `<span role="listitem"><i class="sw ${s.cls}"></i>${s.label}</span>`).join('')}
      <span class="legend-note">base 100</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Liga: Capital Club frente a Cobas AM, Azvalor y el índice">
      ${ticks}${xLabels}
      <line x1="${L}" x2="${W - R}" y1="${y(100)}" y2="${y(100)}" class="base100"/>
      ${lines}
      <circle class="end fund" cx="${x(last)}" cy="${y(data.fund[last])}" r="4"/>
      ${labels}
      <line class="crosshair" y1="${T}" y2="${H - B}" x1="0" x2="0"/>
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

/** Activa crosshair + tooltip en el gráfico de liga dentro de `root`. */
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
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (W - L - R)) * (n - 1))));
    const p = points[i];
    const px = L + (i / (n - 1)) * (W - L - R);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.style.opacity = 1;
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(p.label)}</b>` +
      LEAGUE_SERIES.map((s) => `<span><i class="sw ${s.cls}"></i>${s.label} ${pct(p[s.key] / 100 - 1)}${s.key === 'fund' ? ` · ${money(p.nav)}` : ''}</span>`).join('');
    const left = (px / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - 220, Math.max(0, left + 12))}px`;
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
