import { price, pct, money, tone, esc } from './format.js';

/**
 * Alerta modal de "venta inminente" con cuenta atrás y el gran botón rojo.
 *
 * `prompt(order)` devuelve una promesa que se resuelve con:
 *   - 'override' → el gestor bloquea la venta
 *   - 'sell'     → el gestor deja vender, o se agota el tiempo
 */
export class OverrideAlert {
  constructor(layer, { seconds = 15 } = {}) {
    this.layer = layer;
    this.seconds = seconds;
  }

  get isOpen() {
    return !this.layer.hidden;
  }

  prompt(order, { queueSize = 1 } = {}) {
    return new Promise((resolve) => {
      const pnl = order.price / order.avgCost - 1;
      const R = 34;
      const circumference = 2 * Math.PI * R;

      this.layer.innerHTML = `
        <div class="override-backdrop"></div>
        <section class="override-card" role="alertdialog" aria-modal="true" aria-labelledby="ov-title" aria-describedby="ov-desc">
          <header class="ov-head">
            <span class="ov-blink">⚠</span>
            <h2 id="ov-title">BOT · ORDEN DE VENTA INMINENTE</h2>
            ${queueSize > 1 ? `<span class="ov-queue">1/${queueSize}</span>` : ''}
          </header>
          <div class="ov-body">
            <div class="ov-asset">
              <span class="ov-ticker">${esc(order.ticker)}</span>
              <span class="ov-name">${esc(order.name)}</span>
              <p id="ov-desc" class="ov-reason">${esc(order.reasonText)}</p>
            </div>
            <div class="ov-timer" aria-live="polite">
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="${R}" class="track"/>
                <circle cx="40" cy="40" r="${R}" class="ring" style="stroke-dasharray:${circumference};stroke-dashoffset:0"/>
              </svg>
              <span class="ov-count">${this.seconds}</span>
            </div>
          </div>
          <dl class="ov-stats">
            <div><dt>Precio</dt><dd>${price(order.price)}</dd></div>
            <div><dt>Valor objetivo</dt><dd>${price(order.targetValue)}</dd></div>
            <div><dt>Plusvalía</dt><dd class="${tone(pnl)}">${pct(pnl)}</dd></div>
            <div><dt>Importe</dt><dd>${money(order.quantity * order.price)}</dd></div>
          </dl>
          <p class="ov-question">¿Crees que <b>${esc(order.ticker)}</b> todavía tiene recorrido? Bloquea al bot y asume el control manual.</p>
          <div class="ov-actions">
            <div class="hazard"><button class="big-red" data-ov="override"><span>OVERRIDE</span><small>BLOQUEAR</small></button></div>
            <button class="ov-let" data-ov="sell">Dejar que el bot venda ▸</button>
          </div>
        </section>`;
      this.layer.hidden = false;
      document.body.classList.add('alerting');

      const ring = this.layer.querySelector('.ring');
      const count = this.layer.querySelector('.ov-count');
      const started = performance.now();
      let raf = 0;

      let decided = false;
      const finish = (decision) => {
        if (decided) return; // doble clic o clic + fin de cuenta atrás
        decided = true;
        cancelAnimationFrame(raf);
        this.layer.querySelector('.override-card').classList.add(decision === 'override' ? 'locked' : 'sold');
        setTimeout(() => {
          this.layer.hidden = true;
          this.layer.innerHTML = '';
          document.body.classList.remove('alerting');
          resolve(decision);
        }, 420);
      };

      const tick = (now) => {
        const elapsed = (now - started) / 1000;
        const remaining = Math.max(0, this.seconds - elapsed);
        ring.style.strokeDashoffset = `${(elapsed / this.seconds) * circumference}`;
        count.textContent = Math.ceil(remaining);
        this.layer.querySelector('.ov-timer').classList.toggle('critical', remaining < 5);
        if (remaining <= 0) return finish('sell');
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      this.layer.querySelectorAll('[data-ov]').forEach((btn) =>
        btn.addEventListener('click', () => finish(btn.dataset.ov), { once: true }),
      );
      // El foco va a la tarjeta, no al botón: una pulsación de teclado
      // despistada nunca debe decidir por el gestor.
      const card = this.layer.querySelector('.override-card');
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
    });
  }
}
