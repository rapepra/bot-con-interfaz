import { TIME_OF_DAY, todForQuarter, mix } from './timeOfDay.js';
import { DomEvents, on } from '../bridge/domEvents.js';

/* global Phaser */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SkyScene — el telón de fondo: Madrid desde la planta 58.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Escena independiente que se pinta DEBAJO de la oficina, en coordenadas de
 * pantalla (sin zoom). Cielo con hora del día, Sierra de Guadarrama, un
 * skyline inspirado en las Cuatro Torres y las torres inclinadas de Plaza de
 * Castilla, la ciudad a nuestros pies, nubes y algún avión nocturno.
 *
 * Siluetas genéricas "inspiradas en": sin marcas ni logotipos reales.
 */
export class SkyScene extends Phaser.Scene {
  constructor() {
    super('SkyScene');
    this.tod = 'night';
    this.layer = null;
    this.clouds = [];
  }

  create() {
    this.draw(this.tod, false);
    // Phaser solo arranca la primera escena: la oficina se lanza encima del cielo.
    this.scene.launch('OfficeScene');
    this.scale.on('resize', () => this.draw(this.tod, false));
    const off = on(DomEvents.MARKET_CLOCK, ({ index }) => {
      const tod = todForQuarter(index);
      if (tod !== this.tod) this.draw(tod, true);
    });
    this.events.once('shutdown', off);
  }

  update(_, delta) {
    const { width } = this.scale;
    for (const cloud of this.clouds) {
      cloud.x += (cloud.speed * delta) / 1000;
      if (cloud.x > width + 160) cloud.x = -160;
    }
  }

  /** Construye todo el fondo para una hora del día; con fundido si `animate`. */
  draw(tod, animate) {
    this.tod = tod;
    const P = TIME_OF_DAY[tod];
    const { width: W, height: H } = this.scale;
    const horizon = H * 0.6;
    const k = Math.max(0.6, H / 900); // escala vertical de las siluetas

    const layer = this.add.container(0, 0).setAlpha(animate ? 0 : 1);
    const g = this.add.graphics();
    layer.add(g);

    // 1. Cielo en bandas (degradado de 3 paradas).
    const skyAt = (y) => {
      const t = Math.min(1, Math.max(0, y / horizon));
      return t < 0.55 ? mix(P.sky[0], P.sky[1], t / 0.55) : mix(P.sky[1], P.sky[2], (t - 0.55) / 0.45);
    };
    const bands = 64;
    for (let i = 0; i < bands; i++) {
      const y0 = (horizon * i) / bands;
      g.fillStyle(skyAt(y0), 1).fillRect(0, y0, W, horizon / bands + 1);
    }

    // 2. Estrellas.
    if (P.stars > 0) {
      for (let i = 0; i < 140; i++) {
        const sx = Math.random() * W;
        const sy = Math.random() * horizon * 0.75;
        const star = this.add.circle(sx, sy, Math.random() < 0.1 ? 1.4 : 0.8, 0xffffff, P.stars * (0.4 + Math.random() * 0.6));
        layer.add(star);
        if (Math.random() < 0.2) this.tweens.add({ targets: star, alpha: 0.1, duration: 800 + Math.random() * 1600, yoyo: true, repeat: -1 });
      }
    }

    // 3. Sol o luna.
    if (P.sun) {
      const sx = W * P.sun.x, sy = H * P.sun.y;
      for (const [r, a] of [[P.sun.r * 4, 0.08], [P.sun.r * 2.2, 0.16], [P.sun.r * 1.3, 0.3]]) {
        layer.add(this.add.circle(sx, sy, r, P.sun.color, a).setBlendMode(Phaser.BlendModes.ADD));
      }
      layer.add(this.add.circle(sx, sy, P.sun.r, P.sun.color, 1));
    }
    if (P.moon) {
      const mx = W * P.moon.x, my = H * P.moon.y;
      layer.add(this.add.circle(mx, my, 40, 0xdfe6ff, 0.08).setBlendMode(Phaser.BlendModes.ADD));
      layer.add(this.add.circle(mx, my, 16, 0xfff6dc, 1));
      layer.add(this.add.circle(mx + 6, my - 4, 14, skyAt(my), 1)); // luna creciente
    }

    // 4. Sierra de Guadarrama con nieve en las cumbres.
    const ridge = [];
    const peaks = [0, 0.08, 0.15, 0.22, 0.3, 0.38, 0.47, 0.55, 0.63, 0.7, 0.78, 0.86, 0.93, 1];
    const heights = [18, 34, 26, 52, 40, 70, 48, 62, 38, 58, 44, 30, 40, 22];
    peaks.forEach((px, i) => ridge.push({ x: px * W, y: horizon - heights[i] * k }));
    g.fillStyle(P.mountain, 1).fillPoints([{ x: 0, y: horizon }, ...ridge, { x: W, y: horizon }], true);
    g.fillStyle(P.snow, 0.85);
    ridge.forEach((p, i) => {
      if (heights[i] > 45) g.fillTriangle(p.x, p.y, p.x - 14 * k, p.y + 10 * k, p.x + 14 * k, p.y + 10 * k);
    });
    // Bruma sobre el horizonte.
    for (let i = 0; i < 10; i++) {
      g.fillStyle(P.sky[2], 0.06).fillRect(0, horizon - 40 * k + i * 5 * k, W, 6 * k);
    }

    // 5. Ciudad a nuestros pies (bajo el horizonte).
    for (let i = 0; i < 12; i++) {
      const y0 = horizon + ((H - horizon) * i) / 12;
      g.fillStyle(mix(P.city, 0x000000, i / 20), 1).fillRect(0, y0, W, (H - horizon) / 12 + 1);
    }
    const lights = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    layer.add(lights);
    if (P.lights > 0) {
      for (let i = 0; i < 900; i++) {
        const t = Math.random() ** 0.7;
        const ly = horizon + 4 + t * (H - horizon);
        lights.fillStyle(Math.random() < 0.8 ? 0xffc477 : 0xfff2d9, P.lights * (0.25 + Math.random() * 0.6)).fillRect(Math.random() * W, ly, 1 + t * 1.5, 1);
      }
      // La Castellana: un río de luz cruzando la ciudad.
      lights.fillStyle(0xffb45a, 0.35 * P.lights);
      for (let i = 0; i < 160; i++) {
        const t = i / 160;
        lights.fillRect(W * (0.35 + t * 0.3), horizon + 6 + t * (H - horizon), 2 + t * 4, 1.5);
      }
    }

    // 6. Edificios bajos en la línea del horizonte.
    for (let x = -10; x < W; ) {
      const bw = 10 + Math.random() * 26;
      const bh = (8 + Math.random() * 30) * k;
      g.fillStyle(mix(P.tower, P.sky[2], 0.35), 1).fillRect(x, horizon - bh, bw, bh + 8);
      x += bw + Math.random() * 4;
    }

    // 7. Rascacielos emblemáticos (siluetas inspiradas).
    const base = horizon + 10 * k;
    const towers = [
      { x: 0.62, w: 30, h: 0.34, kind: 'arch' }, // marco abierto en la coronación
      { x: 0.67, w: 32, h: 0.33, kind: 'crown-glass' }, // jardín acristalado arriba
      { x: 0.72, w: 30, h: 0.31, kind: 'frame' }, // corona con estructura
      { x: 0.765, w: 32, h: 0.3, kind: 'round' }, // fachada curva
      { x: 0.805, w: 20, h: 0.22, kind: 'slim' },
      { x: 0.13, w: 30, h: 0.17, kind: 'lean-right' }, // torres inclinadas
      { x: 0.185, w: 30, h: 0.17, kind: 'lean-left' },
    ];
    const towerColor = P.tower;
    const windowLights = this.add.graphics();
    layer.add(windowLights);
    for (const t of towers) {
      const tw = t.w * k, th = H * t.h, cx = W * t.x, top = base - th;
      g.fillStyle(towerColor, 1);
      if (t.kind.startsWith('lean')) {
        const lean = th * 0.27 * (t.kind === 'lean-right' ? 1 : -1);
        g.fillPoints([{ x: cx - tw / 2, y: base }, { x: cx + tw / 2, y: base }, { x: cx + tw / 2 + lean, y: top }, { x: cx - tw / 2 + lean, y: top }], true);
        g.fillStyle(mix(towerColor, 0xffffff, 0.12), 1).fillPoints([{ x: cx - tw / 2 + lean, y: top }, { x: cx + tw / 2 + lean, y: top }, { x: cx + tw / 2 + lean * 0.97, y: top + 6 }, { x: cx - tw / 2 + lean * 0.97, y: top + 6 }], true);
        this.beacon(layer, cx + lean, top - 2);
        continue;
      }
      if (t.kind === 'round') g.fillRoundedRect(cx - tw / 2, top, tw, th + 4, { tl: tw / 2, tr: tw / 2, bl: 0, br: 0 });
      else g.fillRect(cx - tw / 2, top, tw, th);
      // Arista iluminada.
      g.fillStyle(mix(towerColor, 0xffffff, 0.18), 1).fillRect(cx - tw / 2, top + (t.kind === 'round' ? tw / 2 : 0), 2, th);
      if (t.kind === 'arch') {
        g.fillStyle(skyAt(top + th * 0.06), 1).fillRect(cx - tw / 2 + 5, top + 4, tw - 10, th * 0.08);
      } else if (t.kind === 'crown-glass') {
        g.fillStyle(mix(towerColor, P.glass, 0.6), 1).fillRect(cx - tw / 2, top, tw, th * 0.07);
      } else if (t.kind === 'frame') {
        g.lineStyle(2, towerColor, 1);
        g.strokeRect(cx - tw / 2 + 2, top - 16 * k, tw - 4, 16 * k);
        g.lineBetween(cx, top - 16 * k, cx, top);
      } else if (t.kind === 'slim') {
        g.lineStyle(2, mix(towerColor, 0xffffff, 0.25), 1).strokeRect(cx - tw / 2 - 2, top - 6, tw + 4, 14);
      }
      // Ventanas encendidas.
      if (P.lights > 0) {
        for (let wy = top + 10; wy < base - 4; wy += 5) {
          for (let wx = cx - tw / 2 + 4; wx < cx + tw / 2 - 3; wx += 4) {
            if (Math.random() < 0.28 * P.lights) windowLights.fillStyle(0xffd9a0, 0.75).fillRect(wx, wy, 2, 2);
          }
        }
      }
      this.beacon(layer, cx, top - (t.kind === 'frame' ? 18 * k : 3));
    }

    // 8. Nubes a la deriva.
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const cloud = this.add.graphics();
      const s = 0.6 + Math.random() * 0.9;
      cloud.fillStyle(P.cloud, P.cloudAlpha * 0.9);
      for (let j = 0; j < 6; j++) cloud.fillEllipse((j - 2.5) * 22 * s, (Math.random() - 0.5) * 10 * s, (50 + Math.random() * 40) * s, (20 + Math.random() * 16) * s);
      cloud.fillStyle(mix(P.cloud, 0x000000, 0.15), P.cloudAlpha * 0.5).fillEllipse(0, 8 * s, 130 * s, 10 * s);
      cloud.x = Math.random() * W;
      cloud.y = H * (0.06 + Math.random() * 0.4);
      cloud.speed = 4 + Math.random() * 9;
      layer.add(cloud);
      this.clouds.push(cloud);
    }

    // 9. Un avión cruzando el cielo de noche o al atardecer.
    if (P.lights > 0.5) this.plane(layer, W, H);

    // Sustituye la capa anterior con un fundido suave.
    layer.setDepth(-1000);
    const previous = this.layer;
    this.layer = layer;
    if (animate && previous) {
      this.tweens.add({ targets: layer, alpha: 1, duration: 1100, ease: 'Sine.inOut', onComplete: () => previous.destroy() });
    } else {
      previous?.destroy();
    }
  }

  /** Luz roja de balizamiento aéreo. */
  beacon(layer, x, y) {
    const glow = this.add.circle(x, y, 6, 0xff2a3a, 0.3).setBlendMode(Phaser.BlendModes.ADD);
    const dot = this.add.circle(x, y, 1.8, 0xff3b4e, 1);
    layer.add([glow, dot]);
    this.tweens.add({ targets: [glow, dot], alpha: 0.15, duration: 700, yoyo: true, repeat: -1, delay: Math.random() * 700, hold: 300 });
  }

  plane(layer, W, H) {
    const body = this.add.container(-40, H * (0.12 + Math.random() * 0.15));
    const white = this.add.circle(0, 0, 1.6, 0xffffff, 1);
    const red = this.add.circle(-6, 0, 1.6, 0xff3b4e, 1);
    body.add([white, red]);
    layer.add(body);
    this.tweens.add({ targets: [white], alpha: 0, duration: 120, yoyo: true, repeat: -1, repeatDelay: 900 });
    this.tweens.add({
      targets: body, x: W + 40, y: body.y - H * 0.06, duration: 38000, repeat: -1, repeatDelay: 9000,
      onRepeat: () => body.setY(H * (0.12 + Math.random() * 0.15)),
    });
  }
}
