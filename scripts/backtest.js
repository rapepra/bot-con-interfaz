#!/usr/bin/env node
/**
 * Monte Carlo del simulador: ¿el bot bate a los fondos que copia?
 *
 *   npm run backtest              # 500 partidas de 40 trimestres (2015–2024)
 *   npm run backtest -- 2000 60   # partidas, trimestres
 *
 * ⚠ Resultados sobre un mercado SINTÉTICO. Sirve para entender la mecánica
 *   (retraso, comisiones, override), no para predecir nada del mundo real.
 */
import { MockMarketService } from '../src/core/mock/MockMarketService.js';
import { MockMarketAdapter } from '../src/core/mock/MockMarketAdapter.js';
import { Portfolio, priceMap } from '../src/core/Portfolio.js';
import { TradingBot } from '../src/core/TradingBot.js';

const RUNS = Number(process.argv[2]) || 500;
const QUARTERS = Number(process.argv[3]) || 40;

/** Juega una partida completa con una política de override fija. */
async function play(seed, policy, filingLag = 0) {
  const adapter = new MockMarketAdapter(new MockMarketService({ semilla: seed }), { filingLag });
  await adapter.connect();
  const portfolio = new Portfolio({ initialCash: 100 });
  const bot = new TradingBot({ adapter, portfolio, rules: { minTicket: 0 } });
  let snap = await adapter.getSnapshot();
  const bench0 = snap.benchmark;
  await bot.evaluate(snap);
  for (let q = 0; q < QUARTERS; q++) {
    snap = await adapter.advance();
    const { proposed } = await bot.evaluate(snap);
    for (const order of proposed) {
      if (policy === 'override') bot.override(order.id);
      else await bot.confirmSell(order.id);
    }
  }
  const result = { bot: portfolio.nav(priceMap(snap.companies)), index: (snap.benchmark / bench0) * 100 };
  for (const f of snap.funds) result[f.name] = f.nav;
  return result;
}

// La comisión mínima del mock (5 €) se come una cartera de 100 €: la anulamos aquí.
MockMarketService.PARAMETROS = { ...MockMarketService.PARAMETROS, comisionMinima: 0 };

const series = { 'Bot (deja vender)': [], 'Bot (override siempre)': [], 'Bot (filings con 1T retraso)': [], 'Cobas AM': [], Azvalor: [], 'Índice': [] };
const wins = { cobas: 0, azvalor: 0, both: 0, index: 0, overrideHelps: 0 };

for (let seed = 1; seed <= RUNS; seed++) {
  const auto = await play(seed, 'sell');
  const hold = await play(seed, 'override');
  const late = await play(seed, 'sell', 1);
  series['Bot (filings con 1T retraso)'].push(late.bot);
  series['Bot (deja vender)'].push(auto.bot);
  series['Bot (override siempre)'].push(hold.bot);
  series['Cobas AM'].push(auto['Cobas AM']);
  series.Azvalor.push(auto.Azvalor);
  series['Índice'].push(auto.index);
  if (auto.bot > auto['Cobas AM']) wins.cobas++;
  if (auto.bot > auto.Azvalor) wins.azvalor++;
  if (auto.bot > auto['Cobas AM'] && auto.bot > auto.Azvalor) wins.both++;
  if (auto.bot > auto.index) wins.index++;
  if (hold.bot > auto.bot) wins.overrideHelps++;
}

const years = QUARTERS / 4;
const cagr = (final) => (final / 100) ** (1 / years) - 1;
const pctl = (arr, p) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
const fmt = (x) => `${(x * 100).toFixed(1).padStart(6)}%`;

console.log(`\nMonte Carlo · ${RUNS} partidas × ${QUARTERS} trimestres (${years} años) · mercado SINTÉTICO\n`);
console.log('Rentabilidad anualizada        p10     mediana  p90');
for (const [name, values] of Object.entries(series)) {
  console.log(`${name.padEnd(30)} ${fmt(cagr(pctl(values, 0.1)))} ${fmt(cagr(pctl(values, 0.5)))} ${fmt(cagr(pctl(values, 0.9)))}`);
}
const share = (n) => `${((n / RUNS) * 100).toFixed(0)}%`;
console.log(`\nEl bot bate a Cobas AM en el ${share(wins.cobas)} de las partidas, a Azvalor en el ${share(wins.azvalor)},`);
console.log(`a ambos a la vez en el ${share(wins.both)} y al índice en el ${share(wins.index)}.`);
console.log(`Hacer override siempre (no vender nunca al objetivo) mejora al bot en el ${share(wins.overrideHelps)} de las partidas.\n`);
