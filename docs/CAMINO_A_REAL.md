# Del juego al bot real: hoja de ruta

> Esto no es asesoramiento financiero, fiscal ni legal. Es una guía técnica de
> qué haría falta para que el bot opere con dinero real **propio**, y de los
> riesgos de hacerlo. Antes de arriesgar capital, consulta a un asesor
> registrado en la CNMV y a un fiscalista.

## 0. La pregunta previa: ¿por qué no comprar directamente los fondos?

Copiar a Cobas o Azvalor con un bot tiene **tres desventajas estructurales**
frente a suscribir sus fondos:

1. **Retraso.** Te enteras de sus movimientos semanas después, por los informes
   públicos. Ellos ya compraron, y a mejor precio.
2. **Impuestos.** En España puedes hacer *traspasos* entre fondos sin tributar.
   Con acciones sueltas, cada venta del bot es una ganancia patrimonial que se
   declara ese año: el diferimiento fiscal se pierde.
3. **Concentración y ejecución.** Ellos tienen 40–60 posiciones, gestión del
   riesgo profesional y ejecución institucional.

Ventajas posibles del bot:
- **Comisiones.** No pagas gestión (≈1,5–1,8 % anual en estos fondos; verifica
  el DFI actual). Sí pagas corretaje e impuestos al vender.
- **Concentración en sus mejores ideas.** Por ejemplo, solo sus 10 primeras
  posiciones.
- **Tu criterio** (el botón de OVERRIDE) por encima del suyo.

**Experimento recomendado:** durante 12 meses, haz paper trading del bot en
paralelo a una inversión real en los fondos. Si el bot no bate al fondo
**después de impuestos y comisiones**, la respuesta es clara.

## 1. Datos: de dónde salen las señales

| Necesidad | Fuente realista | Notas |
|---|---|---|
| Carteras de Cobas / Azvalor | Informes trimestrales y semestrales publicados en la **CNMV** y en sus webs | Llegan con semanas de retraso. Hay que parsear PDF/XBRL. |
| Fondos de EE. UU. (alternativa) | Formularios **13F** de la SEC (EDGAR) | Gratis y estructurados, hasta 45 días de retraso. |
| Precios | La API de tu broker o un proveedor de datos de mercado | Ajustados por dividendos y *splits*. |
| Fundamentales (deuda, EBITDA, BPA) | Proveedores de fundamentales con datos *point-in-time* | Imprescindible para que el backtest sea honesto. |
| Valor objetivo | Tu propio modelo, o el implícito en las cartas de los gestores | Es la parte más subjetiva. |

En el código, todo esto vive dentro de un adaptador nuevo
(`src/core/real/RealMarketAdapter.js`). El bot y la interfaz no cambian.

## 2. Broker con API

- Necesitas un broker que opere en tu país y ofrezca API de órdenes y
  **cuenta de simulación** (paper trading). Interactive Brokers es la opción
  habitual para residentes en España con acceso a bolsas europeas y de EE. UU.
- Implementa `placeOrder()` con **órdenes limitadas**, nunca a mercado, en
  valores pequeños como Atalaya o Teekay: la horquilla se come el *alpha*.
- Las claves de API van en variables de entorno o en un gestor de secretos.
  Nunca en el repositorio.

## 3. Backend: el bot no puede vivir en el navegador

```
[Cron diario] → RealMarketAdapter (datos + broker)
              → TradingBot (igual que hoy)
              → Base de datos (posiciones, órdenes, log de auditoría)
              → Notificación al móvil (Telegram/push): "¿OVERRIDE en GLNG?"
              → Esta misma UI, en modo solo lectura + botón de override
```

- El núcleo (`src/core`) ya corre en Node sin DOM: se puede reutilizar tal cual.
- La ventana de override pasa de 15 segundos a **horas**: el bot propone, te
  avisa y, si no respondes, ejecuta antes del cierre.
- **Reconciliación diaria**: compara las posiciones del broker con el libro
  local. Ante cualquier discrepancia, el bot se detiene.

## 4. Gestión del riesgo (no negociable)

- **Kill switch**: un interruptor que cancela todo y deja el bot en solo lectura.
- **Límites duros**: tamaño máximo por posición, por orden y por día; ninguna
  orden por encima del X % del volumen diario.
- **Modo seco** (*dry run*): registra lo que habría hecho sin enviar órdenes.
- Alertas si faltan datos o si un precio salta más del N % (dato erróneo).
- Empieza con una cantidad que **puedas perder entera** sin que te afecte.

## 5. Validación antes de arriesgar un euro

1. **Backtest honesto** con datos *point-in-time*: incluye el retraso real de
   los informes, comisiones, horquillas y empresas que quebraron o dejaron de
   cotizar (sesgo de supervivencia).
2. **Paper trading**: mínimo 6–12 meses en la cuenta demo del broker.
3. **Capital pequeño**, y solo después aumentarlo si los resultados reales se
   parecen a los del paper trading.

`npm run backtest` es el embrión: hoy usa el mercado sintético, pero con un
`BacktestAdapter` alimentado con datos históricos reales serviría igual.

## 6. Legal y fiscal (España)

- Operar con **tu propio dinero** con un bot es legal. Gestionar dinero de
  terceros o vender las señales exige autorización de la CNMV.
- Las ventas generan ganancias o pérdidas patrimoniales en el IRPF (base del
  ahorro). Los dividendos extranjeros pueden tener retención en origen.
- Con un broker extranjero, revisa las obligaciones informativas (modelo 720 si
  superas los umbrales) y que el broker no retiene IRPF: lo declaras tú.

## 7. Orden de trabajo sugerido

1. `RealMarketAdapter` de solo lectura (precios + fundamentales) → la UI muestra
   datos reales.
2. Parser de informes de la CNMV → señales reales en el panel de research.
3. `BacktestAdapter` con históricos → medir de verdad.
4. Backend + base de datos + notificaciones de override.
5. Broker en **paper trading**.
6. Límites de riesgo, kill switch y reconciliación.
7. Solo entonces, y con poco dinero: dinero real.
