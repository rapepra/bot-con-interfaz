import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketAdapter } from '../src/core/MarketAdapter.js';
import { MockMarketService } from '../src/core/mock/MockMarketService.js';
import { MockMarketAdapter } from '../src/core/mock/MockMarketAdapter.js';

test('MarketAdapter es abstracto', () => {
  assert.throws(() => new MarketAdapter(), TypeError);
});

test('la misma semilla produce el mismo mercado', () => {
  const a = new MockMarketService({ semilla: 7 });
  const b = new MockMarketService({ semilla: 7 });
  for (let i = 0; i < 12; i++) {
    assert.deepEqual(a.avanzarTrimestre(), b.avanzarTrimestre());
  }
});

test('el reloj avanza por trimestres e inyecta eventos históricos', () => {
  const svc = new MockMarketService();
  assert.equal(svc.obtenerReloj().etiqueta, '2015-T1');
  svc.avanzarTrimestre();
  const t3 = svc.avanzarTrimestre();
  assert.equal(t3.reloj.etiqueta, '2015-T3');
  assert.match(t3.evento.titular, /yuan/);
});

test('la deuda penaliza: a igualdad de condiciones, más apalancamiento = peor retorno', () => {
  const base = { ciclo: -0.1, precio: 10, valorObjetivo: 12, shockCredito: 0.03 };
  const sinDeuda = MockMarketService.retornoTrimestral({ ...base, apalancamiento: -1 });
  const conDeuda = MockMarketService.retornoTrimestral({ ...base, apalancamiento: 4 });
  assert.ok(conDeuda < sinDeuda - 0.1, `${conDeuda} debería ser bastante menor que ${sinDeuda}`);
});

test('la reversión empuja el precio hacia el valor objetivo', () => {
  const comun = { ciclo: 0, apalancamiento: 0 };
  assert.ok(MockMarketService.retornoTrimestral({ ...comun, precio: 5, valorObjetivo: 10 }) > 0);
  assert.ok(MockMarketService.retornoTrimestral({ ...comun, precio: 15, valorObjetivo: 10 }) < 0);
});

test('el adaptador traduce el dialecto del proveedor al modelo de dominio', async () => {
  const adapter = new MockMarketAdapter(new MockMarketService({ semilla: 3 }));
  await assert.rejects(adapter.getSnapshot(), /connect/);
  await adapter.connect();

  const snap = await adapter.getSnapshot();
  assert.equal(snap.clock.label, '2015 T1');
  assert.equal(snap.companies.length, 4);

  const atym = snap.companies.find((c) => c.ticker === 'ATYM');
  assert.ok(atym.leverage < 0, 'Atalaya tiene caja neta');
  assert.ok(atym.upside > 0);
  for (const key of ['price', 'netDebt', 'per', 'targetValue', 'history']) assert.ok(key in atym, key);
  assert.ok(snap.filings.every((f) => ['BUY', 'HOLD', 'TRIM', 'EXIT'].includes(f.action)));

  const fill = await adapter.placeOrder({ ticker: 'ATYM', side: 'BUY', quantity: 100 });
  assert.equal(fill.side, 'BUY');
  assert.ok(fill.price > atym.price, 'slippage en compra');
  assert.ok(fill.commission >= 5);

  const next = await adapter.advance();
  assert.equal(next.clock.label, '2015 T2');
});
