/**
 * Paletas de "hora del día". Cada trimestre avanza el reloj: T1 amanece,
 * T2 es pleno día, T3 atardece y T4 es de noche. Cielo, skyline, fachada y
 * luz interior beben de la misma tabla para que todo combine.
 */
export const TIME_OF_DAY = {
  dawn: {
    label: 'Amanecer',
    sky: [0x1d2a5c, 0x9c5f86, 0xf7b38a],
    mountain: 0x4f4a74,
    snow: 0xf6d9e2,
    city: 0x2a2848,
    tower: 0x3d4068,
    cloud: 0xf8cdd0,
    cloudAlpha: 0.75,
    lights: 0.45,
    stars: 0.25,
    sun: { x: 0.1, y: 0.6, color: 0xffcf9c, r: 30 },
    glass: 0xf3b7a4,
    tint: 0xffe2d6,
    facade: 0x40466e,
    lamp: 0.7,
  },
  day: {
    label: 'Mediodía',
    sky: [0x2b66b3, 0x74ace3, 0xd2e8f7],
    mountain: 0x7f95b8,
    snow: 0xffffff,
    city: 0x6d7f9c,
    tower: 0x93a8c6,
    cloud: 0xffffff,
    cloudAlpha: 0.9,
    lights: 0,
    stars: 0,
    sun: { x: 0.8, y: 0.14, color: 0xfff7d6, r: 24 },
    glass: 0xbfe3ff,
    tint: 0xffffff,
    facade: 0x6f86a8,
    lamp: 0.25,
  },
  dusk: {
    label: 'Atardecer',
    sky: [0x241a48, 0xb8486b, 0xffaa5c],
    mountain: 0x4b2d55,
    snow: 0xffc8a6,
    city: 0x2c1d3b,
    tower: 0x3c2c52,
    cloud: 0xff9f8c,
    cloudAlpha: 0.8,
    lights: 0.75,
    stars: 0.15,
    sun: { x: 0.88, y: 0.58, color: 0xffbf6b, r: 34 },
    glass: 0xffad7e,
    tint: 0xffd2b4,
    facade: 0x3d3156,
    lamp: 0.85,
  },
  night: {
    label: 'Noche',
    sky: [0x040714, 0x0e1536, 0x2b2453],
    mountain: 0x131530,
    snow: 0x59628f,
    city: 0x0b0d21,
    tower: 0x171b38,
    cloud: 0x2c3366,
    cloudAlpha: 0.6,
    lights: 1,
    stars: 1,
    moon: { x: 0.84, y: 0.16 },
    glass: 0x6c84d8,
    tint: 0x9aa3d6,
    facade: 0x1a1f3e,
    lamp: 1,
  },
};

export const TOD_ORDER = ['dawn', 'day', 'dusk', 'night'];

/** Hora del día correspondiente a un índice de trimestre (0 = T1). */
export const todForQuarter = (index) => TOD_ORDER[((index % 4) + 4) % 4];

/** Interpola dos colores 0xRRGGBB. */
export function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 0xff;
  const l = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (l(16) << 16) | (l(8) << 8) | l(0);
}
