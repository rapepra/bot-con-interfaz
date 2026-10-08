/**
 * Datos semilla del mercado simulado.
 *
 * Se expresan en el "dialecto" del proveedor ficticio (campos en español),
 * igual que un vendor real tiene su propio formato. El MockMarketAdapter es
 * quien lo traduce al modelo de dominio del juego.
 *
 * ⚠ Empresas reales, cifras ILUSTRATIVAS y redondeadas (millones de €).
 *   No son datos de mercado ni recomendación de inversión.
 */
export const EMPRESAS = [
  {
    simbolo: 'ATYM',
    nombre: 'Atalaya Mining',
    sector: 'mineria',
    divisa: '€',
    precio: 2.6,
    acciones: 140,
    ebitda: 90,
    deudaNeta: -60, // caja neta: el sueño del value investor
    bpa: 0.36,
    multiploJusto: 6, // EV/EBITDA "justo" del ciclo
    fondo: 'Cobas AM',
    tesis: 'Cobre en Riotinto con caja neta y opcionalidad en nuevos proyectos.',
  },
  {
    simbolo: 'GLNG',
    nombre: 'Golar LNG',
    sector: 'shipping',
    divisa: '€',
    precio: 11,
    acciones: 105,
    ebitda: 450,
    deudaNeta: 1900, // muy apalancada: cada crisis le duele el doble
    bpa: 1.14,
    multiploJusto: 8,
    fondo: 'Cobas AM',
    tesis: 'Licuefacción flotante de gas: activos únicos, balance exigente.',
  },
  {
    simbolo: 'TRE',
    nombre: 'Técnicas Reunidas',
    sector: 'ingenieria',
    divisa: '€',
    precio: 8.5,
    acciones: 78,
    ebitda: 180,
    deudaNeta: 250,
    bpa: 0.77,
    multiploJusto: 7,
    fondo: 'Azvalor',
    tesis: 'Ingeniería energética con cartera récord; el mercado aún duda.',
  },
  {
    simbolo: 'BTU',
    nombre: 'Peabody Energy',
    sector: 'energia',
    divisa: '€',
    precio: 19,
    acciones: 125,
    ebitda: 900,
    deudaNeta: 300,
    bpa: 3.6,
    multiploJusto: 4.5,
    fondo: 'Azvalor',
    tesis: 'Carbón metalúrgico odiado por el mercado y generando caja a chorros.',
  },
];

/** Sectores simulados, cada uno con su propio ciclo. */
export const SECTORES = ['mineria', 'shipping', 'ingenieria', 'energia'];

/**
 * Eventos "históricos" inyectados en su trimestre (inspirados en la realidad).
 * `impacto`: shock sectorial sobre el precio. `shockCredito`: castigo extra
 * proporcional al apalancamiento (subidas de tipos, crisis de crédito...).
 */
export const EVENTOS_HISTORICOS = {
  '2015-T3': {
    titular: 'Devaluación del yuan: pánico en las materias primas',
    impacto: { mineria: -0.18, energia: -0.16, shipping: -0.08, ingenieria: -0.1 },
    shockCredito: 0.02,
  },
  '2016-T1': {
    titular: 'Suelo del superciclo: cobre y carbón rebotan con fuerza',
    impacto: { mineria: 0.2, energia: 0.22, shipping: 0.04, ingenieria: 0.05 },
  },
  '2016-T4': {
    titular: 'La OPEP pacta recortes de producción',
    impacto: { energia: 0.14, ingenieria: 0.09, shipping: 0.03 },
  },
  '2018-T4': {
    titular: 'Escalada de la guerra comercial EEUU–China',
    impacto: { mineria: -0.12, shipping: -0.1, energia: -0.08, ingenieria: -0.06 },
    shockCredito: 0.01,
  },
  '2020-T1': {
    titular: 'COVID-19: colapso global de los mercados',
    impacto: { mineria: -0.25, energia: -0.3, shipping: -0.22, ingenieria: -0.32 },
    shockCredito: 0.05,
  },
  '2020-T4': {
    titular: 'Llegan las vacunas: gran rotación hacia Value',
    impacto: { mineria: 0.22, energia: 0.2, shipping: 0.15, ingenieria: 0.18 },
  },
  '2021-T3': {
    titular: 'Crisis logística global: fletes en máximos históricos',
    impacto: { shipping: 0.3, mineria: 0.06, energia: 0.08 },
  },
  '2022-T1': {
    titular: 'Invasión de Ucrania: shock energético en Europa',
    impacto: { energia: 0.35, shipping: 0.15, mineria: 0.08, ingenieria: -0.06 },
  },
  '2022-T2': {
    titular: 'La Fed sube tipos 75 pb: el mercado castiga la deuda',
    impacto: { mineria: -0.06, energia: -0.02, shipping: -0.05, ingenieria: -0.05 },
    shockCredito: 0.05,
  },
  '2023-T1': {
    titular: 'Crisis bancaria regional en EEUU',
    impacto: { mineria: -0.05, energia: -0.07, shipping: -0.06, ingenieria: -0.08 },
    shockCredito: 0.03,
  },
  '2024-T2': {
    titular: 'El cobre marca máximos históricos',
    impacto: { mineria: 0.22, ingenieria: 0.04 },
  },
  '2025-T2': {
    titular: 'Aranceles masivos: el comercio global se congela',
    impacto: { mineria: -0.12, shipping: -0.14, energia: -0.08, ingenieria: -0.07 },
    shockCredito: 0.02,
  },
};

/**
 * Eventos genéricos para cuando se agota la historia. Se sortean con baja
 * probabilidad para que el juego siga teniendo sobresaltos.
 */
export const EVENTOS_SINTETICOS = [
  {
    titular: 'Ola de calor dispara la demanda de gas',
    impacto: { energia: 0.12, shipping: 0.1 },
  },
  {
    titular: 'China anuncia un gran plan de infraestructuras',
    impacto: { mineria: 0.15, ingenieria: 0.08 },
  },
  {
    titular: 'Recesión técnica en la eurozona',
    impacto: { mineria: -0.1, energia: -0.08, shipping: -0.09, ingenieria: -0.1 },
    shockCredito: 0.02,
  },
  {
    titular: 'Repunte inesperado de la inflación: bonos a la baja',
    impacto: { ingenieria: -0.06, shipping: -0.04 },
    shockCredito: 0.04,
  },
  {
    titular: 'Cierre del Canal de Suez por tensiones geopolíticas',
    impacto: { shipping: 0.22, energia: 0.06 },
  },
];
