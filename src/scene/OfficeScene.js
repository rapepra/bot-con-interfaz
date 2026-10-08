import { iso, drawBox, boxSilhouette, shade, depthOf, wallQuadLeft, wallQuadRight, floorQuad } from './iso.js';
import { DomEvents, emit, on } from '../bridge/domEvents.js';

/* global Phaser */

const ROOM = 10; // casillas por lado
const WALL_H = 150; // altura de pared en px

/** Paleta "lo-fi night office": índigos fríos + acentos cálidos y neón. */
const C = {
  bg: 0x0b0a12,
  floorA: 0x5a4034,
  floorB: 0x52392f,
  floorLine: 0x3d2a23,
  wallL: 0x2b3352,
  wallR: 0x232a45,
  wallTop: 0x3c4670,
  baseboard: 0x1a1f33,
  wood: 0x8a5a3b,
  woodLight: 0x9e6c47,
  woodDark: 0x5b3a29,
  rug: 0x6e2639,
  rugTrim: 0xc9a227,
  metal: 0x2a2f3a,
  leather: 0x2b2b38,
  beige: 0xcfc6a8,
  screen: 0x0c2a1d,
  neonGreen: 0x39ff88,
  neonPink: 0xff4fa3,
  amber: 0xffb000,
  red: 0xff3b4e,
  cyan: 0x4de1ff,
  skin: 0xf1c27d,
  shirt: 0x3d7bd9,
  hair: 0x3b2a20,
};

const FONT = '"JetBrains Mono", "IBM Plex Mono", monospace';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  OfficeScene — el despacho isométrico de Capital Club.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todo se dibuja con primitivas (placeholders listos para sprites). La escena
 * no sabe nada de finanzas: solo traduce clics a eventos DOM y reacciona a los
 * estados que le llegan (humor del analista, estado del bot, pulso de mercado).
 */
export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('OfficeScene');
    this.botState = 'idle';
    this.analystMood = 'idle';
    this.leds = [];
    this.disposers = [];
  }

  create() {
    this.cameras.main.setBackgroundColor(C.bg);

    this.buildRoom();
    this.buildWindow();
    this.buildWallDecor();
    this.buildProps();
    this.buildManagerDesk();
    this.buildAnalyst();
    this.buildBotServer();
    this.buildAmbient();

    this.layout();
    this.scale.on('resize', this.layout, this);

    this.disposers.push(
      on(DomEvents.ANALYST_MOOD, ({ mood, message }) => this.setAnalystMood(mood, message)),
      on(DomEvents.BOT_STATE, ({ state }) => this.setBotState(state)),
      on(DomEvents.MARKET_PULSE, (pulse) => this.marketPulse(pulse)),
    );
    this.events.once('shutdown', () => this.disposers.forEach((dispose) => dispose()));

    emit(DomEvents.SCENE_READY);
  }

  /** Encaja la habitación en cualquier tamaño de ventana. */
  layout() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.min(width / 700, (height - 150) / 520), 0.45, 1.9);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(0, 92);
  }

  // ── Estructura ───────────────────────────────────────────────────────────

  buildRoom() {
    const g = this.add.graphics().setDepth(0);

    // Suelo de tarima en damero suave.
    for (let x = 0; x < ROOM; x++) {
      for (let y = 0; y < ROOM; y++) {
        g.fillStyle((x + y) % 2 ? C.floorA : C.floorB, 1).fillPoints(floorQuad(x, y, 1, 1), true);
      }
    }
    g.lineStyle(1, C.floorLine, 0.5);
    for (let i = 0; i <= ROOM; i++) {
      const a = iso(i, 0), b = iso(i, ROOM), c = iso(0, i), d = iso(ROOM, i);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineBetween(c.x, c.y, d.x, d.y);
    }

    // Paredes traseras con zócalo y remate superior.
    const walls = this.add.graphics().setDepth(1);
    walls.fillStyle(C.wallL, 1).fillPoints(wallQuadLeft(0, 0, ROOM, WALL_H), true);
    walls.fillStyle(C.wallR, 1).fillPoints(wallQuadRight(0, 0, ROOM, WALL_H), true);
    // Paneles verticales sutiles (textura de papel pintado retro).
    walls.lineStyle(1, shade(C.wallL, 1.12), 0.35);
    for (let i = 0.5; i < ROOM; i += 0.5) {
      const l0 = iso(0, i, 12), l1 = iso(0, i, WALL_H - 6);
      const r0 = iso(i, 0, 12), r1 = iso(i, 0, WALL_H - 6);
      walls.lineBetween(l0.x, l0.y, l1.x, l1.y);
      walls.lineBetween(r0.x, r0.y, r1.x, r1.y);
    }
    walls.fillStyle(C.baseboard, 1).fillPoints(wallQuadLeft(0, 0, ROOM, 10), true);
    walls.fillStyle(shade(C.baseboard, 0.8), 1).fillPoints(wallQuadRight(0, 0, ROOM, 10), true);
    // Remate superior (grosor de pared).
    walls.fillStyle(C.wallTop, 1);
    walls.fillPoints([iso(0, 0, WALL_H), iso(0, ROOM, WALL_H), iso(-0.25, ROOM, WALL_H), iso(-0.25, -0.25, WALL_H)], true);
    walls.fillPoints([iso(0, 0, WALL_H), iso(ROOM, 0, WALL_H), iso(ROOM, -0.25, WALL_H), iso(-0.25, -0.25, WALL_H)], true);
    // Arista de la esquina.
    const k0 = iso(0, 0, 0), k1 = iso(0, 0, WALL_H);
    walls.lineStyle(2, shade(C.wallR, 0.7), 1).lineBetween(k0.x, k0.y, k1.x, k1.y);
  }

  buildWindow() {
    const x0 = 4.5, w = 2.4, z0 = 46, h = 80;
    const sky = this.add.graphics().setDepth(2);

    // Cielo nocturno en bandas (degradado "pixelado").
    const bands = [0x141a3a, 0x1b2150, 0x272a63, 0x3a2f6e, 0x5a3878];
    bands.forEach((color, i) => {
      sky.fillStyle(color, 1).fillPoints(wallQuadRight(x0, z0 + (h * (bands.length - 1 - i)) / bands.length, w, h / bands.length), true);
    });
    // Luna.
    const moon = iso(x0 + 1.8, 0, z0 + 62);
    sky.fillStyle(0xfff4c9, 1).fillCircle(moon.x, moon.y, 6);
    sky.fillStyle(0xfff4c9, 0.15).fillCircle(moon.x, moon.y, 13);

    // Skyline con ventanas que titilan.
    const buildings = [
      [0.0, 0.35, 34], [0.35, 0.3, 52], [0.65, 0.4, 26], [1.05, 0.25, 60],
      [1.3, 0.45, 38], [1.75, 0.3, 46], [2.05, 0.35, 30],
    ];
    const windowSpots = [];
    for (const [bx, bw, bh] of buildings) {
      sky.fillStyle(0x0d1024, 1).fillPoints(wallQuadRight(x0 + bx, z0, bw, bh), true);
      for (let wz = z0 + 6; wz < z0 + bh - 4; wz += 7) {
        for (let wx = bx + 0.06; wx < bx + bw - 0.06; wx += 0.11) windowSpots.push(wallQuadRight(x0 + wx, wz, 0.05, 3));
      }
    }
    const lights = this.add.graphics().setDepth(2.1);
    const twinkle = () => {
      lights.clear();
      for (const quad of windowSpots) {
        if (Math.random() < 0.38) lights.fillStyle(Math.random() < 0.85 ? 0xffd27a : 0x7ad7ff, 0.9).fillPoints(quad, true);
      }
    };
    twinkle();
    this.time.addEvent({ delay: 1400, loop: true, callback: twinkle });

    // Marco y cruceta.
    const frame = this.add.graphics().setDepth(2.2);
    frame.lineStyle(4, C.woodDark, 1).strokePoints(wallQuadRight(x0, z0, w, h), true);
    frame.lineStyle(2, C.woodDark, 1);
    const m0 = iso(x0 + w / 2, 0, z0), m1 = iso(x0 + w / 2, 0, z0 + h);
    frame.lineBetween(m0.x, m0.y, m1.x, m1.y);
    frame.fillStyle(shade(C.woodDark, 1.2), 1).fillPoints([iso(x0 - 0.05, 0, z0), iso(x0 + w + 0.05, 0, z0), iso(x0 + w + 0.05, 0.18, z0), iso(x0 - 0.05, 0.18, z0)], true);

    // Haz de luz de luna sobre el suelo.
    const beam = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    beam.fillStyle(0x7f9cff, 0.07).fillPoints([iso(x0, 0, z0 + h), iso(x0 + w, 0, z0 + h), iso(x0 + w + 0.8, 3.6), iso(x0 + 0.8, 3.6)], true);
  }

  buildWallDecor() {
    // Rótulo de neón (pared izquierda).
    const signPos = iso(0, 6.2, 118);
    const angle = Math.atan2(-16, 32); // dirección de lectura sobre la pared izquierda
    const neon = this.add
      .text(signPos.x, signPos.y, 'CAPITAL CLUB', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#ffd1ea' })
      .setOrigin(0.5)
      .setRotation(angle)
      .setDepth(6)
      .setShadow(0, 0, '#ff4fa3', 12, true, true);
    this.tweens.add({ targets: neon, alpha: { from: 1, to: 0.82 }, duration: 90, yoyo: true, repeat: -1, repeatDelay: 2600 });
    const sub = iso(0, 5.6, 100);
    this.add
      .text(sub.x, sub.y, '· DEEP VALUE ·', { fontFamily: FONT, fontSize: '9px', color: '#9ff7ff' })
      .setOrigin(0.5)
      .setRotation(angle)
      .setDepth(6)
      .setShadow(0, 0, '#4de1ff', 8, true, true);

    // Póster enmarcado "Margin of Safety" con gráfico.
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(C.woodDark, 1).fillPoints(wallQuadLeft(7.3, 52, 1.9, 62), true);
    g.fillStyle(0xe9dfc4, 1).fillPoints(wallQuadLeft(7.4, 57, 1.7, 52), true);
    const chart = [0.1, 0.25, 0.18, 0.4, 0.33, 0.6, 0.52, 0.85].map((v, i, arr) => iso(0, 9.0 - (i / (arr.length - 1)) * 1.4, 62 + v * 40));
    g.lineStyle(2, 0x1f7a4a, 1).strokePoints(chart, false);
    const mos = iso(0, 8.3, 66);
    this.add.text(mos.x, mos.y, 'MARGIN OF SAFETY', { fontFamily: FONT, fontSize: '6px', color: '#3b2a20' }).setOrigin(0.5).setRotation(angle).setDepth(6.1);

    // Reloj de pared con segundero real.
    const clock = iso(0.9, 0, 112);
    const cg = this.add.graphics().setDepth(6);
    cg.fillStyle(0xf3ead2, 1).fillEllipse(clock.x, clock.y, 22, 26);
    cg.lineStyle(2, C.woodDark, 1).strokeEllipse(clock.x, clock.y, 22, 26);
    const hands = this.add.graphics().setDepth(6.1);
    const drawHands = () => {
      const now = new Date();
      const handAt = (frac, len) => {
        const a = frac * Math.PI * 2 - Math.PI / 2;
        hands.lineBetween(clock.x, clock.y, clock.x + Math.cos(a) * len, clock.y + Math.sin(a) * len * 1.15);
      };
      hands.clear().lineStyle(2, 0x222222, 1);
      handAt(((now.getHours() % 12) + now.getMinutes() / 60) / 12, 5);
      handAt(now.getMinutes() / 60, 8);
      hands.lineStyle(1, C.red, 1);
      handAt(now.getSeconds() / 60, 9);
    };
    drawHands();
    this.time.addEvent({ delay: 1000, loop: true, callback: drawHands });
  }

  buildProps() {
    // Alfombra bajo la mesa del gestor.
    const rug = this.add.graphics().setDepth(7);
    rug.fillStyle(C.rug, 1).fillPoints(floorQuad(3.3, 4.3, 4.2, 3.6), true);
    rug.lineStyle(2, C.rugTrim, 0.8).strokePoints(floorQuad(3.5, 4.5, 3.8, 3.2), true);
    rug.lineStyle(1, C.rugTrim, 0.4).strokePoints(floorQuad(3.7, 4.7, 3.4, 2.8), true);

    // Estantería con lomos de libros (Graham, Buffett, Paramés...).
    const shelf = this.add.graphics().setDepth(depthOf(3.8, 0.65));
    drawBox(shelf, 1.4, 0.1, 2.4, 0.55, 96, C.woodDark);
    const bookColors = [0xb23a48, 0x2e86ab, 0xf6ae2d, 0x3f784c, 0xe8e1d1, 0x6c4f9e, 0xd9734e];
    for (const level of [6, 36, 66]) {
      let u = 1.48;
      while (u < 3.65) {
        const bw = 0.1 + Math.random() * 0.1;
        const bh = 16 + Math.random() * 9;
        drawBox(shelf, u, 0.22, bw, 0.45, bh, bookColors[Math.floor(Math.random() * bookColors.length)], { z: level, outline: false });
        u += bw + 0.015;
      }
      drawBox(shelf, 1.4, 0.15, 2.4, 0.55, 3, shade(C.woodDark, 1.25), { z: level - 3, outline: false });
    }

    // Plantas (porque todo despacho lo-fi necesita una monstera).
    this.plant(9.1, 0.35, 1.1);
    this.plant(0.35, 8.9, 0.9);

    // Dispensador de agua.
    const cooler = this.add.graphics().setDepth(depthOf(0.9, 7.6));
    drawBox(cooler, 0.3, 7.0, 0.6, 0.6, 42, 0xdfe3ea);
    drawBox(cooler, 0.4, 7.1, 0.4, 0.4, 22, 0x6fb8ff, { z: 42 });
    const water = this.add.graphics().setDepth(depthOf(0.9, 7.6, 0.1)).setBlendMode(Phaser.BlendModes.ADD);
    const top = iso(0.6, 7.3, 60);
    water.fillStyle(0x9fd8ff, 0.25).fillEllipse(top.x, top.y, 14, 8);

    // Archivador junto al analista.
    const cab = this.add.graphics().setDepth(depthOf(1.1, 5.7));
    drawBox(cab, 0.3, 5.0, 0.8, 0.7, 46, 0x6c7a89);
    for (const z of [8, 23, 38]) {
      const h0 = iso(1.101, 5.25, z), h1 = iso(1.101, 5.45, z);
      cab.lineStyle(2, 0xd8dee6, 1).lineBetween(h0.x, h0.y, h1.x, h1.y);
    }

    // Lámpara de pie con charco de luz cálido.
    const lamp = this.add.graphics().setDepth(depthOf(9.0, 4.7));
    drawBox(lamp, 8.7, 4.4, 0.3, 0.3, 4, 0x222428);
    drawBox(lamp, 8.82, 4.52, 0.06, 0.06, 80, 0x222428, { outline: false });
    drawBox(lamp, 8.62, 4.32, 0.46, 0.46, 18, 0xf2c57c, { z: 78 });
    const pool = this.add.graphics().setDepth(7.5).setBlendMode(Phaser.BlendModes.ADD);
    const pc = iso(8.85, 4.55);
    pool.fillStyle(0xffb35c, 0.08).fillEllipse(pc.x, pc.y, 220, 110);
    pool.fillStyle(0xffb35c, 0.07).fillEllipse(pc.x, pc.y, 120, 60);
    const halo = this.add.graphics().setDepth(200).setBlendMode(Phaser.BlendModes.ADD);
    const hc = iso(8.85, 4.55, 86);
    halo.fillStyle(0xffd28a, 0.12).fillCircle(hc.x, hc.y, 34);
    this.tweens.add({ targets: halo, alpha: { from: 1, to: 0.8 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Cableado del servidor a la mesa del gestor.
    const cable = this.add.graphics().setDepth(8);
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(iso(7.9, 1.2).x, iso(7.9, 1.2).y),
      new Phaser.Math.Vector2(iso(8.2, 3).x, iso(8.2, 3).y),
      new Phaser.Math.Vector2(iso(6.8, 3.8).x, iso(6.8, 3.8).y),
      new Phaser.Math.Vector2(iso(6.2, 5.2).x, iso(6.2, 5.2).y),
    );
    cable.lineStyle(2, 0x15151c, 1);
    curve.draw(cable, 48);
  }

  plant(x, y, scale = 1) {
    const g = this.add.graphics().setDepth(depthOf(x + 0.5, y + 0.5));
    drawBox(g, x, y, 0.5, 0.5, 18 * scale, 0xb8643c);
    const c = iso(x + 0.25, y + 0.25, 18 * scale);
    const leaves = [
      [-10, -14, 14, 22], [9, -16, 14, 24], [0, -26, 12, 26], [-14, -28, 10, 18], [13, -30, 10, 18], [2, -38, 9, 16],
    ];
    leaves.forEach(([dx, dy, w, h], i) => {
      g.fillStyle(i % 2 ? 0x2f8f5b : 0x3fae6a, 1).fillEllipse(c.x + dx * scale, c.y + dy * scale, w * scale, h * scale);
    });
  }

  buildManagerDesk() {
    const g = this.add.graphics().setDepth(depthOf(6.6, 6.1));
    drawBox(g, 4.0, 5.0, 2.6, 1.1, 24, C.wood, { top: 0xa8744e });
    // Monitor
    drawBox(g, 5.05, 5.25, 0.3, 0.2, 5, 0x1d2027, { z: 24 });
    drawBox(g, 4.65, 5.32, 1.1, 0.12, 26, 0x1d2027, { z: 29 });
    // Teléfono rojo (línea directa con el bróker).
    drawBox(g, 4.2, 5.55, 0.35, 0.35, 5, 0xb3262f, { z: 24 });
    // Taza de café humeante.
    drawBox(g, 6.15, 5.55, 0.16, 0.16, 8, 0xf5f0e6, { z: 24 });
    // Informes anuales apilados.
    drawBox(g, 5.95, 5.1, 0.45, 0.3, 4, 0xe8e1d1, { z: 24, outline: false });
    drawBox(g, 5.97, 5.12, 0.45, 0.3, 4, 0xd8cfb8, { z: 28, outline: false });
    drawBox(g, 5.95, 5.1, 0.45, 0.3, 4, 0xe8e1d1, { z: 32, outline: false });

    // Pantalla del gestor: se repinta según el pulso del mercado.
    this.managerScreen = this.add.graphics().setDepth(depthOf(6.6, 6.1, 0.2));
    this.drawManagerScreen('neutral');

    // Vapor del café.
    const steamBase = iso(6.23, 5.63, 34);
    for (let i = 0; i < 3; i++) {
      const puff = this.add.circle(steamBase.x, steamBase.y, 2, 0xffffff, 0.35).setDepth(depthOf(6.6, 6.1, 0.3));
      this.tweens.add({
        targets: puff, y: steamBase.y - 18, alpha: 0, scale: 2.2, duration: 2200, delay: i * 700, repeat: -1,
        onRepeat: () => puff.setPosition(steamBase.x + Phaser.Math.Between(-2, 2), steamBase.y),
      });
    }

    // Silla del gestor (vacía: es la tuya).
    const chair = this.add.graphics().setDepth(depthOf(5.9, 7.15));
    drawBox(chair, 5.25, 6.65, 0.2, 0.2, 13, 0x1b1b22);
    drawBox(chair, 5.0, 6.45, 0.7, 0.7, 6, C.leather, { z: 13 });
    drawBox(chair, 5.0, 6.98, 0.7, 0.17, 30, C.leather, { z: 19 });

    // Placa con el nombre.
    const plate = iso(5.3, 6.1, 18);
    this.add.text(plate.x, plate.y, 'GESTOR', { fontFamily: FONT, fontSize: '7px', color: '#ffd27a' }).setOrigin(0.5).setDepth(depthOf(6.6, 6.1, 0.4)).setRotation(Math.atan2(16, 32));

    this.makeInteractive('manager', boxSilhouette(4.0, 5.0, 2.6, 2.15, 58), 'GESTOR · PORTFOLIO [F1]', depthOf(6.6, 7.2));

    // Marcador de tutorial hasta el primer clic.
    const mk = iso(5.3, 5.5, 74);
    this.tutorial = this.add
      .text(mk.x, mk.y, '▼ CLIC', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#39ff88' })
      .setOrigin(0.5)
      .setDepth(10001)
      .setShadow(0, 0, '#39ff88', 8, true, true);
    this.tweens.add({ targets: this.tutorial, y: mk.y - 8, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  drawManagerScreen(tone) {
    const g = this.managerScreen.clear();
    const y = 5.441;
    const quad = [iso(4.7, y, 32), iso(5.7, y, 32), iso(5.7, y, 53), iso(4.7, y, 53)];
    g.fillStyle(C.screen, 1).fillPoints(quad, true);
    const color = tone === 'negative' ? C.red : tone === 'positive' ? C.neonGreen : C.amber;
    const series = tone === 'negative' ? [0.8, 0.7, 0.75, 0.5, 0.45, 0.25, 0.2] : tone === 'positive' ? [0.2, 0.3, 0.25, 0.5, 0.55, 0.75, 0.85] : [0.5, 0.55, 0.45, 0.5, 0.55, 0.48, 0.52];
    const pts = series.map((v, i) => iso(4.78 + i * 0.14, y, 35 + v * 15));
    g.lineStyle(1.5, color, 1).strokePoints(pts, false);
    if (!this.screenGlow) {
      this.screenGlow = this.add.graphics().setDepth(depthOf(6.6, 6.1, 0.1)).setBlendMode(Phaser.BlendModes.ADD);
    }
    const c = iso(5.2, 5.9, 25);
    this.screenGlow.clear().fillStyle(color, 0.1).fillEllipse(c.x, c.y, 90, 40);
  }

  buildAnalyst() {
    // Mesa del analista contra la pared izquierda, con CRT beige de los 90.
    const g = this.add.graphics().setDepth(depthOf(1.4, 4.6));
    drawBox(g, 0.3, 2.3, 1.1, 2.3, 24, C.woodLight);
    drawBox(g, 0.45, 2.95, 0.8, 0.85, 24, C.beige, { z: 24 });
    const sx = 1.251;
    g.fillStyle(C.screen, 1).fillPoints([iso(sx, 3.05, 30), iso(sx, 3.7, 30), iso(sx, 3.7, 44), iso(sx, 3.05, 44)], true);
    for (let i = 0; i < 4; i++) {
      const l0 = iso(sx, 3.12, 41 - i * 3), l1 = iso(sx, 3.12 + 0.2 + Math.random() * 0.3, 41 - i * 3);
      g.lineStyle(1, C.amber, 0.9).lineBetween(l0.x, l0.y, l1.x, l1.y);
    }
    // Papeles y carpetas por todas partes: el analista vive aquí.
    drawBox(g, 0.5, 2.4, 0.5, 0.4, 6, 0xf1ece0, { z: 24, outline: false });
    drawBox(g, 0.52, 2.42, 0.5, 0.4, 5, 0xe0d7c2, { z: 30, outline: false });
    drawBox(g, 0.55, 4.0, 0.4, 0.45, 9, 0x2e86ab, { z: 24 });
    // Teclado.
    drawBox(g, 1.05, 3.1, 0.25, 0.55, 2, 0x9a937c, { z: 24, outline: false });

    // Silla.
    const chair = this.add.graphics().setDepth(depthOf(2.45, 3.75));
    drawBox(chair, 1.98, 3.27, 0.18, 0.18, 13, 0x1b1b22);
    drawBox(chair, 1.72, 3.02, 0.7, 0.7, 5, 0x4a3b5c, { z: 13 });

    // El Analista (voxel). En su propio Graphics para animarlo.
    this.npc = this.add.graphics().setDepth(depthOf(2.45, 3.75, 1));
    drawBox(this.npc, 1.42, 3.12, 0.45, 0.13, 6, C.shirt, { z: 26 }); // brazo
    drawBox(this.npc, 1.42, 3.5, 0.45, 0.13, 6, C.shirt, { z: 26 }); // brazo
    drawBox(this.npc, 1.85, 3.1, 0.45, 0.55, 19, C.shirt, { z: 18 }); // torso
    drawBox(this.npc, 1.88, 3.12, 0.08, 0.5, 4, 0xe8e8e8, { z: 33 }); // cuello camisa
    this.drawAnalystHead(C.skin);
    const backrest = this.add.graphics().setDepth(depthOf(2.45, 3.75, 2));
    drawBox(backrest, 2.32, 3.02, 0.14, 0.7, 16, 0x4a3b5c, { z: 18 });

    // Respiración / tecleo sutil.
    this.tweens.add({ targets: this.npc, y: -1.2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Indicadores de humor.
    const head = iso(2.05, 3.38, 64);
    this.analystHeadPos = head;
    this.bulb = this.add.container(head.x, head.y - 10).setDepth(10000).setVisible(false);
    const glow = this.add.circle(0, 0, 20, 0xffe066, 0.28).setBlendMode(Phaser.BlendModes.ADD);
    const bulbBody = this.add.graphics();
    bulbBody.fillStyle(0xffe066, 1).fillCircle(0, -2, 7);
    bulbBody.fillStyle(0xffffff, 0.8).fillCircle(-2, -4, 2);
    bulbBody.fillStyle(0x9aa0a6, 1).fillRect(-3.5, 4, 7, 5);
    bulbBody.lineStyle(1, 0x5f6368, 1).lineBetween(-3.5, 6, 3.5, 6);
    this.bulb.add([glow, bulbBody]);
    this.tweens.add({ targets: this.bulb, y: head.y - 16, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: glow, scale: 1.35, alpha: 0.12, duration: 700, yoyo: true, repeat: -1 });

    this.speech = this.add
      .text(head.x + 14, head.y - 34, '', {
        fontFamily: FONT, fontSize: '9px', color: '#0b0a12', backgroundColor: '#f7f3e3', padding: { x: 5, y: 3 },
      })
      .setOrigin(0, 1)
      .setDepth(10002)
      .setVisible(false);

    this.sweatTimer = this.time.addEvent({ delay: 380, loop: true, paused: true, callback: () => this.spawnSweat() });

    this.makeInteractive('analyst', boxSilhouette(0.3, 2.3, 2.2, 2.3, 60), 'ANALISTA · RESEARCH [F2]', depthOf(2.5, 4.6, 3));
  }

  drawAnalystHead(skin) {
    if (!this.npcHead) {
      this.npcHead = this.add.graphics().setDepth(depthOf(2.45, 3.75, 1.5));
      this.tweens.add({ targets: this.npcHead, y: -1.2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    const g = this.npcHead.clear();
    drawBox(g, 1.9, 3.2, 0.36, 0.36, 15, skin, { z: 37 });
    drawBox(g, 1.98, 3.18, 0.3, 0.4, 5, C.hair, { z: 51 }); // pelo
    drawBox(g, 2.18, 3.18, 0.1, 0.4, 11, C.hair, { z: 41 }); // nuca
    // Gafas de pasta (el analista lee 10-K por diversión).
    const e0 = iso(1.9, 3.3, 45), e1 = iso(1.9, 3.48, 45);
    g.fillStyle(0x111111, 1).fillRect(e0.x - 2, e0.y - 2, 4, 3).fillRect(e1.x - 2, e1.y - 2, 4, 3);
  }

  spawnSweat() {
    const { x, y } = this.analystHeadPos;
    const drop = this.add.ellipse(x + Phaser.Math.Between(-10, 8), y + 6, 3, 5, 0x8fd3ff).setDepth(10000);
    this.tweens.add({ targets: drop, y: drop.y + 22, alpha: 0, duration: 650, ease: 'Quad.in', onComplete: () => drop.destroy() });
  }

  buildBotServer() {
    const x = 7.2, y = 0.2, w = 1.4, d = 0.95, h = 118;
    const g = this.add.graphics().setDepth(depthOf(x + w, y + d));
    drawBox(g, x, y, w, d, h, C.metal);
    const fy = y + d + 0.001; // plano frontal
    // Bahías del rack.
    for (let z = 12; z < 96; z += 14) {
      g.fillStyle(0x1a1d24, 1).fillPoints([iso(x + 0.08, fy, z), iso(x + w - 0.08, fy, z), iso(x + w - 0.08, fy, z + 11), iso(x + 0.08, fy, z + 11)], true);
    }
    // Cara del bot: una pequeña pantalla con ojos.
    g.fillStyle(0x07090d, 1).fillPoints([iso(x + 0.2, fy, 99), iso(x + w - 0.2, fy, 99), iso(x + w - 0.2, fy, 113), iso(x + 0.2, fy, 113)], true);
    // Rejillas laterales.
    for (let i = 0; i < 6; i++) {
      const a = iso(x + w + 0.001, y + 0.15, 20 + i * 14), b = iso(x + w + 0.001, y + d - 0.15, 20 + i * 14);
      g.lineStyle(1, shade(C.metal, 0.5), 1).lineBetween(a.x, a.y, b.x, b.y);
    }

    const depth = depthOf(x + w, y + d, 0.5);
    for (let z = 15; z < 96; z += 14) {
      for (let i = 0; i < 7; i++) {
        const p = iso(x + 0.18 + i * 0.16, fy, z + 5);
        this.leds.push(this.add.rectangle(p.x, p.y, 3, 2, C.neonGreen).setDepth(depth));
      }
    }
    this.eyes = [iso(x + 0.5, fy, 106), iso(x + 0.9, fy, 106)].map((p) =>
      this.add.rectangle(p.x, p.y, 7, 7, C.cyan).setDepth(depth).setRotation(Math.atan2(16, 32)),
    );
    this.eyeGlow = this.add.ellipse(iso(x + 0.7, fy, 106).x, iso(x + 0.7, fy, 106).y, 46, 22, C.cyan, 0.18).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);

    // Baliza superior.
    const top = iso(x + w / 2, y + d / 2, h + 4);
    this.beacon = this.add.circle(top.x, top.y, 5, C.neonGreen).setDepth(depth);
    this.beaconGlow = this.add.circle(top.x, top.y, 18, C.neonGreen, 0.25).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    this.beaconTween = this.tweens.add({ targets: this.beaconGlow, scale: 1.6, alpha: 0.05, duration: 1400, yoyo: true, repeat: -1 });

    // Bocadillo de alerta "!".
    const bubblePos = iso(x + w / 2, y + d / 2, h + 40);
    this.alertBubble = this.add.container(bubblePos.x, bubblePos.y).setDepth(10003).setVisible(false);
    const bubble = this.add.graphics();
    bubble.fillStyle(C.red, 1).fillRoundedRect(-13, -15, 26, 26, 6);
    bubble.fillTriangle(-5, 10, 5, 10, 0, 18);
    bubble.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-13, -15, 26, 26, 6);
    const mark = this.add.text(0, -2, '!', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.alertBubble.add([bubble, mark]);
    this.tweens.add({ targets: this.alertBubble, y: bubblePos.y - 8, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Zzz cuando el autopiloto está apagado.
    this.zzz = this.add.text(top.x + 16, top.y - 10, 'z Z', { fontFamily: FONT, fontSize: '12px', color: '#9ff7ff' }).setDepth(10003).setVisible(false);
    this.tweens.add({ targets: this.zzz, y: top.y - 22, alpha: { from: 1, to: 0.2 }, duration: 1500, repeat: -1 });

    this.time.addEvent({ delay: 140, loop: true, callback: () => this.updateLeds() });
    this.scheduleBlink();

    this.makeInteractive('bot', boxSilhouette(x, y, w, d, h + 10), 'BOT · SERVIDOR [F3]', depthOf(x + w, y + d, 3));
  }

  updateLeds() {
    const t = this.time.now;
    for (const led of this.leds) {
      switch (this.botState) {
        case 'alert':
          led.setFillStyle(C.red).setAlpha(Math.sin(t / 90) > 0 ? 1 : 0.2);
          break;
        case 'trading':
          if (Math.random() < 0.6) led.setFillStyle(C.amber).setAlpha(Math.random() < 0.5 ? 1 : 0.2);
          break;
        case 'sleep':
          led.setFillStyle(C.cyan).setAlpha(0.12);
          break;
        default:
          if (Math.random() < 0.15) led.setFillStyle(Math.random() < 0.8 ? C.neonGreen : C.cyan).setAlpha(Math.random() < 0.6 ? 1 : 0.25);
      }
    }
  }

  scheduleBlink() {
    this.time.delayedCall(Phaser.Math.Between(2200, 4200), () => {
      if (this.botState !== 'sleep') {
        this.tweens.add({ targets: this.eyes, scaleY: 0.1, duration: 80, yoyo: true });
      }
      this.scheduleBlink();
    });
  }

  buildAmbient() {
    // Motas de polvo flotando en la luz.
    for (let i = 0; i < 22; i++) {
      const p = iso(Phaser.Math.FloatBetween(1, 9), Phaser.Math.FloatBetween(1, 9), Phaser.Math.Between(20, 130));
      const mote = this.add.circle(p.x, p.y, 1, 0xfff1d0, 0.5).setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: mote, y: p.y - Phaser.Math.Between(10, 30), x: p.x + Phaser.Math.Between(-12, 12),
        alpha: { from: 0, to: 0.6 }, duration: Phaser.Math.Between(3000, 6000), delay: Phaser.Math.Between(0, 4000),
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }
  }

  // ── Interactividad ───────────────────────────────────────────────────────

  /**
   * Crea un área de clic poligonal con resaltado neón y etiqueta flotante.
   * Al hacer clic emite OFFICE_INTERACT al DOM.
   */
  makeInteractive(id, polygon, label, depth) {
    const hit = this.add.graphics().setDepth(depth);
    const draw = (hover) => {
      hit.clear().fillStyle(C.neonGreen, hover ? 0.07 : 0.001).fillPoints(polygon, true);
      if (hover) hit.lineStyle(2, C.neonGreen, 0.85).strokePoints(polygon, true);
    };
    draw(false);
    hit.setInteractive({ hitArea: new Phaser.Geom.Polygon(polygon), hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true });

    const topY = Math.min(...polygon.map((p) => p.y));
    const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
    const tag = this.add
      .text(cx, topY - 8, label, {
        fontFamily: FONT, fontSize: '10px', color: '#39ff88', backgroundColor: 'rgba(4,12,9,0.88)', padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10010)
      .setAlpha(0);

    hit.on('pointerover', () => {
      draw(true);
      this.tweens.add({ targets: tag, alpha: 1, y: topY - 14, duration: 140 });
    });
    hit.on('pointerout', () => {
      draw(false);
      this.tweens.add({ targets: tag, alpha: 0, y: topY - 8, duration: 140 });
    });
    hit.on('pointerdown', () => {
      this.tweens.add({ targets: hit, alpha: { from: 0.3, to: 1 }, duration: 200 });
      if (id === 'manager' && this.tutorial) {
        this.tutorial.destroy();
        this.tutorial = null;
      }
      emit(DomEvents.OFFICE_INTERACT, { target: id });
    });
  }

  // ── Reacciones a estados externos ────────────────────────────────────────

  setAnalystMood(mood, message = '') {
    this.analystMood = mood;
    this.bulb.setVisible(mood === 'bulb');
    this.sweatTimer.paused = mood !== 'sweat';
    this.drawAnalystHead(mood === 'sweat' ? 0xf5a98a : C.skin);

    this.speechHide?.remove();
    if (message) {
      this.speech.setText(message).setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.speech, alpha: 1, duration: 200 });
      this.speechHide = this.time.delayedCall(6500, () => this.tweens.add({ targets: this.speech, alpha: 0, duration: 300 }));
    } else {
      this.speech.setVisible(false);
    }
  }

  setBotState(state) {
    this.botState = state;
    const color = { alert: C.red, trading: C.amber, sleep: 0x335566 }[state] ?? C.neonGreen;
    this.beacon.setFillStyle(color);
    this.beaconGlow.setFillStyle(color, 0.25);
    this.beaconTween.timeScale = state === 'alert' ? 4 : 1;
    this.alertBubble.setVisible(state === 'alert');
    this.zzz.setVisible(state === 'sleep');
    const eyeColor = state === 'alert' ? C.red : state === 'trading' ? C.amber : C.cyan;
    this.eyes.forEach((eye) => eye.setFillStyle(eyeColor).setScale(1, state === 'sleep' ? 0.15 : 1));
    this.eyeGlow.setFillStyle(eyeColor, state === 'sleep' ? 0.04 : 0.18);
    if (state === 'trading') this.time.delayedCall(1600, () => this.botState === 'trading' && this.setBotState('idle'));
  }

  marketPulse({ tone, magnitude = 0 }) {
    this.drawManagerScreen(tone);
    if (tone === 'negative' && magnitude > 0.08) {
      this.cameras.main.shake(380, Math.min(0.012, 0.004 + magnitude * 0.02));
      this.cameras.main.flash(260, 120, 10, 20);
    } else if (tone === 'positive' && magnitude > 0.08) {
      this.cameras.main.flash(260, 10, 80, 40);
    }
  }
}
