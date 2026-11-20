/**
 * Filtro guiado (He, Sun & Tang).
 *
 * El modelo que separa a las personas trabaja internamente a 256x256, así que su
 * recorte llega estirado y los mechones de pelo, los props y los bordes finos
 * salen como papa. Esto reajusta la máscara usando los bordes REALES de la foto:
 * donde la foto tiene un filo, la máscara aprende a seguirlo.
 */

/** Promedio en una ventana cuadrada, en tiempo constante con imagen integral. */
function boxMean(src: Float32Array, out: Float32Array, ii: Float64Array, w: number, h: number, r: number) {
  const iw = w + 1;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      ii[(y + 1) * iw + x + 1] = ii[y * iw + x + 1] + row;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = ii[y1 * iw + x1] - ii[y0 * iw + x1] - ii[y1 * iw + x0] + ii[y0 * iw + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
}

/**
 * Devuelve `p` reajustado para que siga los bordes de `guide`.
 * Ambos van de 0 a 1. `eps` decide cuánto se respeta el borde: más chico, más filo.
 */
export function guidedFilter(
  guide: Float32Array,
  p: Float32Array,
  w: number,
  h: number,
  r: number,
  eps: number,
): Float32Array {
  const n = w * h;
  const ii = new Float64Array((w + 1) * (h + 1));
  const meanI = new Float32Array(n);
  const meanP = new Float32Array(n);
  const corrI = new Float32Array(n);
  const corrIp = new Float32Array(n);
  const tmp = new Float32Array(n);

  boxMean(guide, meanI, ii, w, h, r);
  boxMean(p, meanP, ii, w, h, r);

  for (let i = 0; i < n; i++) tmp[i] = guide[i] * guide[i];
  boxMean(tmp, corrI, ii, w, h, r);
  for (let i = 0; i < n; i++) tmp[i] = guide[i] * p[i];
  boxMean(tmp, corrIp, ii, w, h, r);

  // a y b son la recta que mejor liga la foto con la máscara en cada ventana
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const covIp = corrIp[i] - meanI[i] * meanP[i];
    a[i] = covIp / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }

  const meanA = new Float32Array(n);
  const meanB = new Float32Array(n);
  boxMean(a, meanA, ii, w, h, r);
  boxMean(b, meanB, ii, w, h, r);

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = meanA[i] * guide[i] + meanB[i];
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}
