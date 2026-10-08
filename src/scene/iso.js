/**
 * Utilidades de proyección isométrica 2:1 y dibujo "voxel" con primitivas.
 *
 * Coordenadas de mundo: (x, y) en casillas sobre el suelo, z en píxeles hacia
 * arriba. Todo el mobiliario se construye con cajas sombreadas por cara, lo que
 * da un look de pixel-art coherente y deja la puerta abierta a sustituir cada
 * pieza por un sprite real sin cambiar posiciones ni lógica.
 */
export const TILE_W = 64;
export const TILE_H = 32;

/** Proyecta un punto del mundo a pantalla. */
export function iso(x, y, z = 0) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - z };
}

/** Multiplica la luminosidad de un color 0xRRGGBB. */
export function shade(color, factor) {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Profundidad de dibujo: lo que está más "abajo" en pantalla, delante. */
export const depthOf = (x, y, bias = 0) => (x + y) * 10 + bias;

/**
 * Dibuja una caja isométrica (3 caras visibles) y devuelve su silueta, útil
 * como área de clic.
 * @returns {{x:number,y:number}[]} hexágono de la silueta
 */
export function drawBox(g, x, y, w, d, h, color, { z = 0, outline = true, top = null } = {}) {
  const p = (px, py, pz) => iso(px, py, pz);
  const topFace = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const rightFace = [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)];
  const leftFace = [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)];

  g.fillStyle(shade(color, 0.92), 1).fillPoints(leftFace, true);
  g.fillStyle(shade(color, 0.7), 1).fillPoints(rightFace, true);
  g.fillStyle(top ?? shade(color, 1.18), 1).fillPoints(topFace, true);

  if (outline) {
    // Arista frontal iluminada: el "brillo" típico del pixel-art isométrico.
    g.lineStyle(1, shade(color, 1.45), 0.9);
    g.lineBetween(topFace[3].x, topFace[3].y, topFace[2].x, topFace[2].y);
    g.lineBetween(topFace[2].x, topFace[2].y, topFace[1].x, topFace[1].y);
    g.lineStyle(1, shade(color, 0.45), 0.6);
    g.lineBetween(leftFace[1].x, leftFace[1].y, leftFace[2].x, leftFace[2].y);
  }

  return [topFace[0], topFace[1], rightFace[0], rightFace[1], leftFace[0], topFace[3]];
}

/** Silueta de una caja sin dibujarla (para áreas de clic que agrupan varias piezas). */
export function boxSilhouette(x, y, w, d, h, z = 0) {
  return [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z), iso(x, y + d, z + h)];
}

/** Cuadrilátero sobre la pared trasera izquierda (plano x = 0). */
export function wallQuadLeft(y, z, w, h, offset = 0) {
  return [iso(offset, y, z), iso(offset, y + w, z), iso(offset, y + w, z + h), iso(offset, y, z + h)];
}

/** Cuadrilátero sobre la pared trasera derecha (plano y = 0). */
export function wallQuadRight(x, z, w, h, offset = 0) {
  return [iso(x, offset, z), iso(x + w, offset, z), iso(x + w, offset, z + h), iso(x, offset, z + h)];
}

/** Cuadrilátero sobre el suelo. */
export function floorQuad(x, y, w, d, z = 0) {
  return [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)];
}
