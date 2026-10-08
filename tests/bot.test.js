import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketAdapter } from '../src/core/MarketAdapter.js';
import { Portfolio } from '../src/core/Portfolio.js';
import { TradingBot } from '../src/core/TradingBot.js';

/** Adaptador de pruebas: snapshots controlados a mano. Demuestra el valor del patrón. */
class StubAdapter extends MarketAdapter {
  constructor(snapshot) {
    super();
    this.snapshot = snapshot;
  }
  async connect() {}
  async getSnapshot() {
    return this.snapshot;
  }
  async advance() {
    return this.snapshot;
  }
  async placeOrder({ ticker, side, quantity }) {
    const price = this.snapshot.companies.find((c) => c.ticker === ticker).price;
    return { ticker, side, quantity, price, commission: 5, timestamp: this.snapshot.clock.label };
  }
}

const company = (overrides) => ({
  ticker: 'AAA',
  name: 'Alpha',
  price: 10,
  targetValue: 20,
  upside: 1,
  leverage: 0,
  fund: 'Cobas AM',
  ...overrides,
});

const snapshotWith = (companies, filings) => ({
  clock: { index: 0, label: '2015 T1' },
  companies,
  filings,
  event: null,
  benchmark: 100,
});

async function setup(companies, filings) {
  const adapter = new StubAdapter(snapshotWith(companies, filings));
  const portfolio = new Portfolio({ initialCash: 100_000 });
  const bot = new TradingBot({ adapter, portfolio });
  return { adapter, portfolio, bot };
}

test('compra siguiendo al fondo, con tamaño ajustado por deuda', async () => {
  const { portfolio, bot, adapter } = await setup(
    [company({ ticker: 'CASH' }), company({ ticker: 'DEBT', leverage: 4 })],
    [
      { fund: 'Cobas AM', ticker: 'CASH', action: 'BUY' },
      { fund: 'Azvalor', ticker: 'DEBT', action: 'BUY' },
    ],
  );
  await bot.evaluate(adapter.snapshot);
  const cash = portfolio.get('CASH').shares * 10;
  const debt = portfolio.get('DEBT').shares * 10;
  assert.ok(Math.abs(cash - 20_000) < 100, `peso completo para caja neta (${cash})`);
  assert.ok(debt < cash / 2, 'la endeudada recibe menos capital');
});

test('no compra sin descuento suficiente ni si el fondo no compra', async () => {
  const { portfolio, bot, adapter } = await setup(
    [company({ ticker: 'CHEAP', upside: 0.1 }), company({ ticker: 'NOSIG' })],
    [
      { fund: 'X', ticker: 'CHEAP', action: 'BUY' },
      { fund: 'X', ticker: 'NOSIG', action: 'HOLD' },
    ],
  );
  await bot.evaluate(adapter.snapshot);
  assert.equal(portfolio.positions.length, 0);
});

test('al tocar el valor objetivo propone venta (no vende sin permiso)', async () => {
  const { portfolio, bot, adapter } = await setup([company()], [{ fund: 'X', ticker: 'AAA', action: 'BUY' }]);
  await bot.evaluate(adapter.snapshot);
  const shares = portfolio.get('AAA').shares;

  adapter.snapshot = snapshotWith([company({ price: 21, upside: -0.05 })], [{ fund: 'X', ticker: 'AAA', action: 'HOLD' }]);
  const proposed = [];
  bot.on('sell-proposed', (o) => proposed.push(o));
  await bot.evaluate(adapter.snapshot);

  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].reason, 'TARGET_REACHED');
  assert.equal(portfolio.get('AAA').shares, shares, 'la posición sigue intacta');

  await bot.confirmSell(proposed[0].id);
  assert.equal(portfolio.get('AAA'), null);
  assert.ok(portfolio.cash > 100_000, 'plusvalía realizada');
});

test('OVERRIDE bloquea la venta y el bot deja de tocar la posición', async () => {
  const { portfolio, bot, adapter } = await setup([company()], [{ fund: 'X', ticker: 'AAA', action: 'BUY' }]);
  await bot.evaluate(adapter.snapshot);

  adapter.snapshot = snapshotWith([company({ price: 25, upside: -0.2 })], [{ fund: 'X', ticker: 'AAA', action: 'EXIT' }]);
  const { proposed } = await bot.evaluate(adapter.snapshot);
  assert.ok(bot.override(proposed[0].id));
  assert.equal(portfolio.get('AAA').locked, true);
  assert.equal(bot.pendingOrders.size, 0);

  const again = await bot.evaluate(adapter.snapshot);
  assert.equal(again.proposed.length, 0, 'posición manual: sin nuevas propuestas');

  adapter.snapshot = snapshotWith([company({ price: 30, upside: -0.3 })], []);
  bot.snapshot = adapter.snapshot;
  assert.deepEqual(bot.overrideScore(), { total: 1, wins: 1, ratio: 1 });
});

test('autopiloto OFF: el bot solo observa', async () => {
  const { portfolio, bot, adapter } = await setup([company()], [{ fund: 'X', ticker: 'AAA', action: 'BUY' }]);
  bot.setAutopilot(false);
  await bot.evaluate(adapter.snapshot);
  assert.equal(portfolio.positions.length, 0);
});
