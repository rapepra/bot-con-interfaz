import { iso, drawBox, depthOf } from './iso.js';
import { DomEvents, emit } from '../bridge/domEvents.js';

/* global Phaser */

/** Recorrido por zonas despejadas del ático (evita el mobiliario). */
const WAYPOINTS = [
  { x: 3.0, y: 8.6 },
  { x: 7.4, y: 8.6 },
  { x: 7.6, y: 3.6 },
  { x: 5.0, y: 2.6 },
  { x: 3.0, y: 4.8 },
];

/**
 * "Graham", el gato de la oficina. Pasea, se sienta a observar el mercado y,
 * si le haces clic, suelta una cita de inversión. Puro alma lo-fi.
 */
export class Cat {
  constructor(scene) {
    this.scene = scene;
    this.pos = { ...WAYPOINTS[0] };
    this.next = 1;
    this.rest = 2000;
    this.hop = 0;

    const g = (this.g = scene.add.graphics());
    const fur = 0xe8954a;
    for (const [lx, ly] of [[-0.18, -0.08], [-0.18, 0.04], [0.1, -0.08], [0.1, 0.04]]) drawBox(g, lx, ly, 0.06, 0.06, 3, 0x9a5b2a, { outline: false });
    drawBox(g, -0.22, -0.1, 0.44, 0.2, 7, fur, { z: 3 });
    drawBox(g, 0.16, -0.11, 0.2, 0.22, 8, 0xf0a35e, { z: 7 });
    const ear = (ex, ey) => {
      const p = iso(ex, ey, 15);
      g.fillStyle(0xd27d38, 1).fillTriangle(p.x - 2.5, p.y + 1, p.x + 2.5, p.y + 1, p.x, p.y - 4);
    };
    ear(0.2, -0.08);
    ear(0.2, 0.06);
    const eye = iso(0.36, -0.02, 11);
    g.fillStyle(0x1b1b1b, 1).fillRect(eye.x - 1, eye.y - 1, 2, 2).fillRect(eye.x + 3, eye.y + 1, 2, 2);
    const t0 = iso(-0.22, 0, 8), t1 = iso(-0.36, 0, 14), t2 = iso(-0.32, 0, 22);
    g.lineStyle(3, fur, 1).strokePoints([t0, t1, t2], false);

    g.setInteractive({ hitArea: new Phaser.Geom.Circle(0, -8, 16), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
    g.on('pointerdown', () => {
      scene.tweens.add({ targets: this, hop: 10, duration: 160, yoyo: true, ease: 'Quad.out' });
      emit(DomEvents.OFFICE_INTERACT, { target: 'cat' });
    });
    this.place(0);
  }

  update(delta) {
    if (this.rest > 0) {
      this.rest -= delta;
      this.place(0);
      return;
    }
    const target = WAYPOINTS[this.next];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = (0.9 * delta) / 1000;
    if (dist <= step) {
      this.pos = { ...target };
      this.next = (this.next + 1) % WAYPOINTS.length;
      if (Math.random() < 0.55) this.rest = 2000 + Math.random() * 6000;
    } else {
      this.pos.x += (dx / dist) * step;
      this.pos.y += (dy / dist) * step;
    }
    // Mirar hacia donde camina (en pantalla).
    this.g.scaleX = dx - dy < 0 ? -1 : 1;
    this.place(this.rest > 0 ? 0 : Math.abs(Math.sin(this.scene.time.now / 90)) * 1.2);
  }

  place(bob) {
    const p = iso(this.pos.x, this.pos.y);
    this.g.setPosition(p.x, p.y - bob - this.hop).setDepth(depthOf(this.pos.x + 0.3, this.pos.y + 0.15, 0.5));
  }
}
