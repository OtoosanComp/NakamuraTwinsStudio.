/**
 * Quitar objetos: por cada toque buscamos, cerca, un pedazo de foto que se parezca
 * al borde de lo que quieres tapar, y lo copiamos encima con el borde difuminado.
 * Es lo mismo que hace el "parche" de un editor de escritorio, en versión ligera.
 */

export interface HealStroke {
  /** Centro de lo que se tapa, en fracciones de 0 a 1 de la foto. */
  x: number;
  y: number;
  /** Radio, en fracción del ancho de la foto. */
  r: number;
  /** De dónde se copia, como desplazamiento en las mismas unidades que x e y. */
  dx: number;
  dy: number;
  /** Corrección de color para que no se note el parche (−1 a 1 por canal). */
  fix: [number, number, number];
}

export const HEAL_MAX = 20;

const RING_POINTS = 20;

/** Promedio del anillo alrededor de un punto: es lo que tiene que coincidir para que no se note. */
function ring(data: ImageData, cx: number, cy: number, radius: number) {
  const { width: W, height: H, data: px } = data;
  const out: number[] = [];
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < RING_POINTS; i++) {
    const a = (i / RING_POINTS) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * radius);
    const y = Math.round(cy + Math.sin(a) * radius);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const o = (y * W + x) * 4;
    out.push(px[o], px[o + 1], px[o + 2]);
    r += px[o]; g += px[o + 1]; b += px[o + 2];
    n++;
  }
  return { samples: out, mean: [r / n, g / n, b / n] as [number, number, number] };
}

/**
 * Escoge de dónde copiar. Prueba alrededor en varias direcciones y distancias
 * y se queda con el pedazo cuyo contorno más se parece al del objeto.
 */
export function findHealSource(data: ImageData, x: number, y: number, r: number, searchR = r): HealStroke {
  const { width: W, height: H } = data;
  const cx = x * W, cy = y * H;
  const pr = Math.max(3, r * W);
  // El anillo que tiene que coincidir se mide sobre TODO lo que se está tapando,
  // no sobre cada toque: si no, dentro de un objeto grande copiaría del mismo objeto.
  const sr = Math.max(pr, searchR * W);
  const target = ring(data, cx, cy, sr * 1.35);

  let best: { dx: number; dy: number; fix: [number, number, number] } | null = null;
  let bestScore = Infinity;

  if (target) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (const mult of [2.1, 3.2, 4.4]) {
        const ox = Math.cos(ang) * sr * mult;
        const oy = Math.sin(ang) * sr * mult;
        const sx = cx + ox, sy = cy + oy;
        // El parche completo tiene que caber dentro de la foto
        if (sx - sr * 1.4 < 0 || sy - sr * 1.4 < 0 || sx + sr * 1.4 >= W || sy + sr * 1.4 >= H) continue;
        const cand = ring(data, sx, sy, sr * 1.35);
        if (!cand) continue;
        let score = 0;
        for (let i = 0; i < cand.samples.length; i++) {
          const d = cand.samples[i] - target.samples[i];
          score += d * d;
        }
        // Preferimos lo más cercano cuando empatan: el parecido local es más fiable
        score *= 1 + (mult - 2.1) * 0.12;
        if (score < bestScore) {
          bestScore = score;
          const fix: [number, number, number] = [
            Math.max(-0.15, Math.min(0.15, (target.mean[0] - cand.mean[0]) / 255)),
            Math.max(-0.15, Math.min(0.15, (target.mean[1] - cand.mean[1]) / 255)),
            Math.max(-0.15, Math.min(0.15, (target.mean[2] - cand.mean[2]) / 255)),
          ];
          best = { dx: ox / W, dy: oy / H, fix };
        }
      }
    }
  }

  // Si no cupo ningún parche (objeto en una esquina), copiamos de al lado sin corregir
  if (!best) {
    const away = x < 0.5 ? 1 : -1;
    best = { dx: away * Math.max(r, searchR) * 2.4, dy: 0, fix: [0, 0, 0] };
  }
  return { x, y, r, ...best };
}

/**
 * Un trazo entero se tapa con UN solo origen: se calcula sobre el círculo que
 * envuelve todos los toques, para que el borde que se compara caiga ya en el fondo.
 */
export function regroupHeal(data: ImageData, strokes: HealStroke[], aspect: number): HealStroke[] {
  if (!strokes.length) return strokes;
  const cx = strokes.reduce((a, s) => a + s.x, 0) / strokes.length;
  const cy = strokes.reduce((a, s) => a + s.y, 0) / strokes.length;
  let radius = 0;
  for (const s of strokes) {
    const d = Math.hypot(s.x - cx, (s.y - cy) / aspect);
    radius = Math.max(radius, d + s.r);
  }
  const found = findHealSource(data, cx, cy, radius, radius);
  return strokes.map((s) => ({ ...s, dx: found.dx, dy: found.dy, fix: found.fix }));
}
