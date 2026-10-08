# ◆ Capital Club: The Value Tycoon

Simulador gamificado de **Value Investing**. Diriges un fondo *Deep Value* desde un
despacho isométrico lo-fi de los 90. Un bot institucional copia los movimientos de
grandes gestoras value (Azvalor, Cobas) y, cuando va a vender, **tú puedes pulsar el
gran botón rojo de OVERRIDE** y quedarte la posición en modo manual.

> Hoy es una simulación. La arquitectura está pensada para convertirse en un bot de
> trading real cambiando **una sola pieza**: el adaptador de mercado.

## Arrancar

```bash
npm start          # http://localhost:8080  (servidor estático, sin build)
npm test           # tests del motor financiero y del bot (node:test, sin dependencias)
```

Hay que servirlo por HTTP: los módulos ES no cargan desde `file://`.
Añade `?seed=1234` a la URL para repetir una partida exacta.

**Controles:** clic en las mesas · `Espacio` avanza el trimestre · `F1/F2/F3` (o `1/2/3`)
abren las terminales · `Esc` cierra.

## Arquitectura

```
index.html                    Capas: canvas Phaser + UI DOM superpuesta
src/
├─ core/                      ← Núcleo lógico. Sin DOM, sin Phaser: corre en Node.
│  ├─ MarketAdapter.js        Contrato abstracto + modelo de dominio (JSDoc)
│  ├─ mock/
│  │  ├─ marketData.js        4 empresas value + eventos históricos (dialecto del "proveedor")
│  │  ├─ MockMarketService.js Simulador trimestral: avanzarTrimestre(), ejecutarOrden()
│  │  └─ MockMarketAdapter.js Traduce el dialecto del mock al dominio del juego
│  ├─ TradingBot.js           Estrategia + Human-in-the-Loop (propone ventas, acepta overrides)
│  ├─ Portfolio.js            Libro de posiciones, NAV, P&L
│  ├─ Emitter.js · rng.js     Eventos internos y PRNG con semilla
├─ bridge/domEvents.js        Contrato Phaser ⇄ DOM (CustomEvents en window)
├─ scene/
│  ├─ iso.js                  Proyección isométrica 2:1 y "voxels" con primitivas
│  └─ OfficeScene.js          Despacho, Analista, Servidor-Bot, interactividad
├─ ui/                        Terminales (Portfolio, Research, Bot), alerta Override, HUD
├─ styles/terminal.css        Bloomberg retro × glassmorphism
└─ main.js                    GameController: el bucle de juego que une todo
```

### El patrón adaptador, en concreto

`MockMarketService` habla su propio idioma (`simbolo`, `precio`, `deudaNeta`,
`movimiento: 'COMPRA'`…), como haría cualquier proveedor externo. `MockMarketAdapter`
es la **única** pieza que lo conoce y lo traduce al modelo de dominio
(`ticker`, `price`, `netDebt`, `action: 'BUY'`…). El bot, la UI y la escena solo ven
`MarketAdapter`. Los tests incluyen un `StubAdapter` de 15 líneas que lo demuestra.

Para operar en real, implementa otro adaptador:

```js
class MyBrokerAdapter extends MarketAdapter {
  async connect()      { /* auth, websockets */ }
  async getSnapshot()  { /* cotizaciones + fundamentales + 13F/cartas de fondos */ }
  async advance()      { /* esperar al siguiente cierre o refresco */ }
  async placeOrder(o)  { /* enviar orden, devolver Fill */ }
}
```

y cámbialo en `src/main.js`. Nada más.

### Modelo de mercado (mock)

Retorno logarítmico por trimestre:

```
r = ciclo_sector × (1 + k·apalancamiento si cae)   ← las crisis duelen más con deuda
  − (castigo + shock_crédito) × apalancamiento      ← carga financiera, subidas de tipos
  + reversión × (ln(valor/precio) + sentimiento)    ← el precio orbita el valor; "Mr. Market" exagera
  + ruido × (vol_base + vol_deuda × apalancamiento)
```

EBITDA, BPA y deuda evolucionan con el ciclo, así que el **valor objetivo se mueve**.
Los eventos históricos (yuan 2015, COVID 2020, Ucrania 2022, Fed 2022…) se inyectan en
su trimestre; después, eventos sintéticos aleatorios.

### Bucle Human-in-the-Loop

1. `Avanzar trimestre` → `adapter.advance()`.
2. `bot.evaluate()` → compras automáticas (si un fondo compra con descuento ≥ 20%),
   ventas **propuestas** si el precio toca el valor objetivo o el fondo sale.
3. Cada venta propuesta abre la alerta: 15 s para **OVERRIDE / BLOQUEAR** o dejar vender.
   Sin decisión, el bot ejecuta.
4. Las posiciones bloqueadas pasan a **MANUAL**: el bot no las toca hasta que las
   devuelvas desde la terminal. El HUD lleva la cuenta de tu % de acierto en overrides.

## Aviso

Empresas reales con **cifras ilustrativas y simuladas**. No es asesoramiento ni
recomendación de inversión.
