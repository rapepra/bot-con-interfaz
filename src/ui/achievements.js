/**
 * Logros: pequeñas metas que premian jugar como un buen inversor value.
 * Cada `check` recibe el contexto del juego y devuelve true al desbloquearse.
 */
export const ACHIEVEMENTS = [
  { id: 'first_override', icon: '🛑', title: 'Mano firme', desc: 'Haz tu primer OVERRIDE.', check: (c) => c.bot.overrides.length >= 1 },
  {
    id: 'good_override', icon: '🎯', title: 'Instinto de gestor', desc: 'Un override que sube +20% desde el bloqueo.',
    check: (c) => c.bot.overrides.some((o) => (c.price(o.ticker) ?? 0) >= o.price * 1.2),
  },
  { id: 'manual_buy', icon: '🧠', title: 'Convicción propia', desc: 'Haz una compra manual desde el radar.', check: (c) => c.stats.manualBuys >= 1 },
  { id: 'covid', icon: '🦠', title: 'Manos de diamante', desc: 'Llega a 2020 T3 batiendo al índice.', check: (c) => c.snapshot.clock.index >= 22 && c.alpha >= 0 },
  { id: 'beat_cobas', icon: '🥈', title: 'Alumno aventajado', desc: 'Supera a Cobas AM (desde 2016).', check: (c) => c.snapshot.clock.index >= 4 && c.league.fund > c.league['Cobas AM'] },
  {
    id: 'beat_both', icon: '👑', title: 'Rey de la Castellana', desc: 'Supera a Cobas AM y Azvalor a la vez (desde 2017).',
    check: (c) => c.snapshot.clock.index >= 8 && c.league.fund > c.league['Cobas AM'] && c.league.fund > c.league.Azvalor,
  },
  { id: 'double', icon: '💎', title: 'Doblete', desc: 'Duplica el patrimonio del fondo.', check: (c) => c.league.fund >= 200 },
  { id: 'cat', icon: '🐈', title: 'Amigo de Graham', desc: 'Acaricia al gato 5 veces.', check: (c) => c.stats.catPets >= 5 },
];

/** Devuelve los logros recién desbloqueados y los añade al conjunto. */
export function checkAchievements(unlocked, ctx) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.check(ctx)) {
      unlocked.add(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}

/** Citas para el gato filósofo. */
export const QUOTES = [
  '«Mr. Market está para servirte, no para guiarte.» — B. Graham',
  '«Sé temeroso cuando otros son codiciosos.» — W. Buffett',
  '«El precio es lo que pagas; el valor, lo que recibes.» — W. Buffett',
  '«El margen de seguridad es el secreto de la inversión sólida.» — B. Graham',
  '«A corto plazo el mercado es una máquina de votar; a largo, una báscula.» — B. Graham',
  '«La paciencia es la virtud más rentable del inversor.» — Miau',
  '«No es timing del mercado, es tiempo en el mercado.» — Proverbio value',
  '«Compra empresas sin deuda y duerme como un gato.» — Graham (el gato)',
];
