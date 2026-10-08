import { iso, drawBox, shade, depthOf, wallQuadRight, floorQuad } from './iso.js';
import { TIME_OF_DAY, mix } from './timeOfDay.js';

/* global Phaser */

const ROOM = 10;
const WALL_H = 150;
const TOWER_DEPTH = 1400; // px de fachada bajo el suelo (se pierde en la bruma)
const FONT = '"JetBrains Mono", "IBM Plex Mono", monospace';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Penthouse — convierte el despacho en el ático de un rascacielos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • Fachada de muro cortina bajo el suelo, con rótulo corporativo.
 *  • Pared derecha de cristal de suelo a techo (se ve Madrid a través).
 *  • Barandilla de vidrio, mástil con baliza, nubes que pasan por debajo.
 *  • Iluminación según la hora del día y mejoras de oficina según el rango.
 */
export class Penthouse {
  constructor(scene) {
    this.scene = scene;
    this.tod = null;
    this.lowClouds = [];
    this.fish = [];
    this.upgrades = [];
  }

  // ── Construcción ─────────────────────────────────────────────────────────

  buildExterior() {
    const s = this.scene;
    this.facade = s.add.graphics().setDepth(-30);
    this.facadeLights = s.add.graphics().setDepth(-29);
    this.fog = s.add.graphics().setDepth(-28);

    const signPos = iso(5, ROOM, -58);
    this.sign = s.add
      .text(signPos.x, signPos.y, '◆ CAPITAL CLUB', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setRotation(Math.atan2(16, 32))
      .setDepth(-27);
    const floorPos = iso(ROOM, 5, -40);
    this.floorTag = s.add
      .text(floorPos.x, floorPos.y, 'PLANTA 58 · CASTELLANA', { fontFamily: FONT, fontSize: '10px', color: '#cfe6ff' })
      .setOrigin(0.5)
      .setRotation(Math.atan2(-16, 32))
      .setDepth(-27)
      .setAlpha(0.7);

    // Nubes bajas que cruzan por delante de la torre (¡estamos muy alto!).
    for (let i = 0; i < 6; i++) {
      const cloud = s.add.graphics().setDepth(-10);
      cloud.spec = Array.from({ length: 6 }, () => ({ dx: (Math.random() - 0.5) * 220, dy: (Math.random() - 0.5) * 30, w: 90 + Math.random() * 120, h: 30 + Math.random() * 24 }));
      cloud.x = -900 + Math.random() * 1800;
      cloud.y = 430 + Math.random() * 520;
      cloud.speed = 6 + Math.random() * 10;
      this.lowClouds.push(cloud);
    }
  }

  buildGlassWall() {
    const s = this.scene;
    this.glass = s.add.graphics().setDepth(1);
    this.sunbeam = s.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
  }

  buildRailingAndMast() {
    const s = this.scene;
    // Barandilla de vidrio en los bordes abiertos del ático.
    const rail = s.add.graphics().setDepth(9400);
    const h = 26;
    const edges = [
      [iso(0, ROOM, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, h), iso(0, ROOM, h)],
      [iso(ROOM, 0, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, h), iso(ROOM, 0, h)],
    ];
    for (const quad of edges) {
      rail.fillStyle(0xcfeaff, 0.09).fillPoints(quad, true);
      rail.lineStyle(2, 0xe6edf5, 0.85).lineBetween(quad[3].x, quad[3].y, quad[2].x, quad[2].y);
      rail.lineStyle(1, 0xffffff, 0.25).lineBetween(quad[0].x, quad[0].y, quad[1].x, quad[1].y);
    }
    for (let i = 0; i <= ROOM; i += 2.5) {
      for (const [a, b] of [[iso(i, ROOM, 0), iso(i, ROOM, h)], [iso(ROOM, i, 0), iso(ROOM, i, h)]]) {
        rail.lineStyle(2, 0xb9c3cf, 0.8).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // Canto del forjado: el borde del edificio.
    const slab = s.add.graphics().setDepth(-1);
    slab.fillStyle(0xd7dae3, 1).fillPoints([iso(0, ROOM, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, -14), iso(0, ROOM, -14)], true);
    slab.fillStyle(0xaab0bf, 1).fillPoints([iso(ROOM, 0, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, -14), iso(ROOM, 0, -14)], true);

    // Mástil de comunicaciones con baliza.
    const mast = s.add.graphics().setDepth(1.5);
    drawBox(mast, -0.42, -0.42, 0.14, 0.14, 130, 0x4a5068, { z: WALL_H });
    drawBox(mast, -0.55, -0.55, 0.4, 0.4, 4, 0x3a3f55, { z: WALL_H });
    const dish = iso(-0.35, -0.35, WALL_H + 80);
    mast.fillStyle(0xdfe3ea, 1).fillEllipse(dish.x + 9, dish.y, 10, 16);
    const top = iso(-0.35, -0.35, WALL_H + 134);
    const glow = s.add.circle(top.x, top.y, 10, 0xff2a3a, 0.35).setDepth(1.6).setBlendMode(Phaser.BlendModes.ADD);
    const dot = s.add.circle(top.x, top.y, 3, 0xff3b4e, 1).setDepth(1.6);
    s.tweens.add({ targets: [glow, dot], alpha: 0.12, duration: 600, yoyo: true, repeat: -1, hold: 500 });

    // Luz ambiente de la hora del día: multiplica solo sobre la silueta del ático
    // (el cielo y la fachada ya se pintan con la paleta de su hora).
    this.tint = s.add.graphics().setDepth(9500).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.tintShape = [iso(0, 0, WALL_H), iso(ROOM, 0, WALL_H), iso(ROOM, 0, 0), iso(ROOM, ROOM, 0), iso(0, ROOM, 0), iso(0, ROOM, WALL_H)];
    this.tintColor = 0xffffff;
  }

  /** Mejoras desbloqueables por rango (0 = Becario … 4 = Leyenda). */
  buildUpgrades() {
    const s = this.scene;
    const make = (minLevel, maxLevel, depth, draw) => {
      const g = s.add.graphics().setDepth(depth).setAlpha(0).setVisible(false);
      draw(g);
      this.upgrades.push({ g, minLevel, maxLevel, on: false });
      return g;
    };

    // Becario: la caja de cartón con tus cosas…
    make(0, 0, depthOf(7.5, 8.1), (g) => {
      drawBox(g, 6.9, 7.6, 0.6, 0.5, 18, 0xb98a55);
      const a = iso(6.9, 8.1, 18), b = iso(7.5, 8.1, 18);
      g.lineStyle(1, 0x7a5a35, 1).lineBetween(a.x, a.y - 1, b.x, b.y - 1);
      drawBox(g, 7.0, 7.7, 0.12, 0.12, 10, 0x3fae6a, { z: 18 }); // un cactus triste
    });

    // Gestor Value: toro dorado sobre peana de mármol.
    make(2, 9, depthOf(8.7, 8.1), (g) => {
      drawBox(g, 8.0, 7.4, 0.7, 0.7, 22, 0x2c2f3a, { top: 0x464a5a });
      drawBox(g, 8.1, 7.6, 0.45, 0.24, 9, 0xd4af37, { z: 27 });
      drawBox(g, 8.48, 7.62, 0.18, 0.2, 9, 0xe6c35c, { z: 30 });
      for (const leg of [[8.12, 7.62], [8.12, 7.78], [8.47, 7.62], [8.47, 7.78]]) drawBox(g, leg[0], leg[1], 0.06, 0.06, 5, 0xb8952b, { z: 22 });
      const h = iso(8.6, 7.72, 40);
      g.lineStyle(2, 0xfff1b8, 1).lineBetween(h.x - 6, h.y, h.x - 10, h.y - 6).lineBetween(h.x + 2, h.y + 2, h.x + 7, h.y - 4);
    });

    // Discípulo de Graham: acuario con peces.
    make(3, 9, depthOf(0.9, 8.8), (g) => {
      drawBox(g, 0.3, 7.85, 0.6, 0.95, 20, 0x2a2420);
      drawBox(g, 0.32, 7.87, 0.56, 0.91, 32, 0x2f8fd0, { z: 20, top: 0x7fd0ff });
      g.fillStyle(0x0a3d5c, 0.35).fillPoints([iso(0.32, 8.78, 20), iso(0.88, 8.78, 20), iso(0.88, 8.78, 27), iso(0.32, 8.78, 27)], true);
      for (const x of [0.45, 0.62, 0.78]) {
        const p = iso(x, 8.78, 22);
        g.fillStyle(0x3fae6a, 1).fillEllipse(p.x, p.y - 4, 3, 10);
      }
    });
    for (let i = 0; i < 3; i++) {
      const fish = s.add.ellipse(0, 0, 6, 3, [0xff8c42, 0xffe066, 0xff4fa3][i]).setDepth(depthOf(0.9, 8.8, 0.2)).setVisible(false);
      fish.phase = Math.random() * Math.PI * 2;
      fish.z = 30 + i * 6;
      this.fish.push(fish);
    }

    // Leyenda Value: trofeo dorado sobre la mesa del gestor + foco.
    const trophy = make(4, 9, depthOf(6.6, 6.1, 0.3), (g) => {
      drawBox(g, 4.25, 5.15, 0.22, 0.22, 4, 0x3a2a1a, { z: 24 });
      drawBox(g, 4.3, 5.2, 0.12, 0.12, 6, 0xd4af37, { z: 28 });
      drawBox(g, 4.22, 5.12, 0.28, 0.28, 9, 0xf2cf5a, { z: 34 });
      const c = iso(4.36, 5.26, 60);
      g.fillStyle(0xfff3b0, 0.18).fillCircle(c.x, c.y, 26);
    });
    trophy.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  setTimeOfDay(tod) {
    if (tod === this.tod) return;
    const first = this.tod === null;
    this.tod = tod;
    const P = TIME_OF_DAY[tod];
    this.drawFacade(P);
    this.drawGlass(P);
    this.drawLowClouds(P);

    const night = P.lights > 0.5;
    this.sign.setColor(night ? '#ffe3f1' : '#f4f7ff').setShadow(0, 0, night ? '#ff4fa3' : '#000000', night ? 16 : 2, true, true);

    // Lámparas más presentes cuanto más oscuro.
    this.scene.lampLights?.forEach((light) => light.setAlpha(P.lamp));

    // Fundido de la luz ambiente.
    const from = this.tintColor;
    if (first) this.paintTint(P.tint);
    else {
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: 1100, ease: 'Sine.inOut',
        onUpdate: (tw) => this.paintTint(mix(from, P.tint, tw.getValue())),
      });
    }
  }

  paintTint(color) {
    this.tintColor = color;
    this.tint.clear().fillStyle(color, 1).fillPoints(this.tintShape, true);
  }

  setLevel(level) {
    for (const u of this.upgrades) {
      const on = level >= u.minLevel && level <= u.maxLevel;
      if (on === u.on) continue;
      u.on = on;
      if (on) {
        u.g.setVisible(true).setY(-14);
        this.scene.tweens.add({ targets: u.g, alpha: 1, y: 0, duration: 650, ease: 'Back.out' });
      } else {
        this.scene.tweens.add({ targets: u.g, alpha: 0, duration: 300, onComplete: () => u.g.setVisible(false) });
      }
    }
    const aquarium = this.upgrades[2];
    this.fish.forEach((f) => f.setVisible(aquarium.on));
  }

  update(delta) {
    for (const cloud of this.lowClouds) {
      cloud.x += (cloud.speed * delta) / 1000;
      if (cloud.x > 1100) cloud.x = -1100;
    }
    for (const fish of this.fish) {
      if (!fish.visible) continue;
      fish.phase += delta / 1400;
      const x = 0.42 + 0.36 * (0.5 + 0.5 * Math.sin(fish.phase));
      const p = iso(x, 8.79, fish.z);
      fish.setPosition(p.x, p.y).setScale(Math.cos(fish.phase) >= 0 ? 1 : -1, 1);
    }
  }

  // ── Dibujo dependiente de la hora ───────────────────────────────────────

  drawFacade(P) {
    const g = this.facade.clear();
    const D = TOWER_DEPTH;
    const left = [iso(0, ROOM, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, -D), iso(0, ROOM, -D)];
    const right = [iso(ROOM, 0, 0), iso(ROOM, ROOM, 0), iso(ROOM, ROOM, -D), iso(ROOM, 0, -D)];
    g.fillStyle(P.facade, 1).fillPoints(left, true);
    g.fillStyle(shade(P.facade, 0.72), 1).fillPoints(right, true);

    // Reflejo del cielo en el vidrio (franja diagonal).
    g.fillStyle(P.glass, 0.12).fillPoints([iso(2, ROOM, 0), iso(4.5, ROOM, 0), iso(4.5, ROOM, -D), iso(2, ROOM, -D)], true);
    g.fillStyle(P.glass, 0.08).fillPoints([iso(ROOM, 6, 0), iso(ROOM, 8, 0), iso(ROOM, 8, -D), iso(ROOM, 6, -D)], true);

    // Montantes y forjados.
    const mullion = shade(P.facade, 0.55);
    for (let i = 0; i <= ROOM; i += 1) {
      const a = iso(i, ROOM, -14), b = iso(i, ROOM, -D);
      const c = iso(ROOM, i, -14), d = iso(ROOM, i, -D);
      g.lineStyle(2, mullion, 0.9).lineBetween(a.x, a.y, b.x, b.y).lineBetween(c.x, c.y, d.x, d.y);
    }
    for (let z = -14; z > -D; z -= 34) {
      const a = iso(0, ROOM, z), b = iso(ROOM, ROOM, z), c = iso(ROOM, 0, z);
      g.lineStyle(3, mullion, 0.85).lineBetween(a.x, a.y, b.x, b.y).lineBetween(b.x, b.y, c.x, c.y);
    }

    // Ventanas encendidas (oficinas de abajo trabajando hasta tarde): dos por módulo.
    const L = this.facadeLights.clear();
    const pane = (face, u, z, color, alpha) => {
      const pts = face === 'left'
        ? [iso(u, ROOM, z + 8), iso(u + 0.32, ROOM, z + 8), iso(u + 0.32, ROOM, z + 24), iso(u, ROOM, z + 24)]
        : [iso(ROOM, u, z + 8), iso(ROOM, u + 0.32, z + 8), iso(ROOM, u + 0.32, z + 24), iso(ROOM, u, z + 24)];
      L.fillStyle(color, alpha).fillPoints(pts, true);
    };
    for (let z = -48; z > -D + 40; z -= 34) {
      for (let u = 0.12; u < ROOM; u += 0.5) {
        if (P.lights > 0) {
          if (Math.random() < 0.3 * P.lights) pane('left', u, z, 0xffd38a, 0.6);
          if (Math.random() < 0.26 * P.lights) pane('right', u, z, 0xffd38a, 0.45);
        } else if (Math.random() < 0.12) {
          pane('left', u, z, 0xffffff, 0.1);
        }
      }
    }

    // Bruma: la torre se disuelve hacia la ciudad.
    const F = this.fog.clear();
    for (let z = -260, a = 0.05; z > -D; z -= 70, a = Math.min(0.9, a + 0.06)) {
      F.fillStyle(P.city, a);
      F.fillPoints([iso(0, ROOM, z), iso(ROOM, ROOM, z), iso(ROOM, ROOM, z - 70), iso(0, ROOM, z - 70)], true);
      F.fillPoints([iso(ROOM, 0, z), iso(ROOM, ROOM, z), iso(ROOM, ROOM, z - 70), iso(ROOM, 0, z - 70)], true);
    }
  }

  drawGlass(P) {
    const g = this.glass.clear();
    g.fillStyle(P.glass, 0.14).fillPoints(wallQuadRight(0, 10, ROOM, WALL_H - 10), true);
    // Reflejos diagonales.
    for (const x of [0.6, 3.4, 6.2, 8.4]) {
      g.fillStyle(0xffffff, 0.055).fillPoints([iso(x, 0, 10), iso(x + 0.5, 0, 10), iso(x + 1.5, 0, WALL_H), iso(x + 1.0, 0, WALL_H)], true);
    }
    // Carpintería: montantes y travesaños.
    g.lineStyle(3, 0x1b2030, 1);
    for (let x = 0; x <= ROOM; x += 2) {
      const a = iso(x, 0, 10), b = iso(x, 0, WALL_H);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const t0 = iso(0, 0, 112), t1 = iso(ROOM, 0, 112);
    g.lineStyle(2, 0x1b2030, 0.9).lineBetween(t0.x, t0.y, t1.x, t1.y);

    // Luz que entra por el ventanal y cae sobre el suelo.
    const sb = this.sunbeam.clear();
    const color = P.sun?.color ?? 0x8fa6ff;
    const alpha = P.sun ? 0.1 : 0.05;
    sb.fillStyle(color, alpha).fillPoints([iso(1.5, 0.3), iso(7.5, 0.3), iso(8.8, 4.8), iso(2.8, 4.8)], true);
    sb.fillStyle(color, alpha * 0.8).fillPoints(floorQuad(3.2, 1.2, 4, 2.2), true);
  }

  drawLowClouds(P) {
    for (const cloud of this.lowClouds) {
      cloud.clear().fillStyle(P.cloud, P.cloudAlpha * 0.85);
      for (const c of cloud.spec) cloud.fillEllipse(c.dx, c.dy, c.w, c.h);
    }
  }
}
