/**
 * Curva de tonos: mueves unos puntos y la app traduce eso a una tabla de 256 valores
 * que la GPU aplica a cada canal. Es la herramienta clásica de contraste a medida.
 */

/** Valores de salida en x = 0, 0.25, 0.5, 0.75 y 1. Recta = no cambia nada. */
export const CURVE_IDENTITY = [0, 0.25, 0.5, 0.75, 1];

export function isIdentityCurve(p: number[]) {
  return p.length === CURVE_IDENTITY.length && p.every((v, i) => Math.abs(v - CURVE_IDENTITY[i]) < 0.002);
}

/**
 * Interpolación cúbica monótona (Fritsch-Carlson): pasa por los puntos sin
 * inventar ondas, que en una curva de tonos se verían como halos.
 */
export function buildCurveLut(points: number[]): Uint8Array {
  const n = points.length;
  const xs = points.map((_, i) => i / (n - 1));
  const h = (i: number) => xs[i + 1] - xs[i];
  const slope = (i: number) => (points[i + 1] - points[i]) / h(i);

  const m = new Array<number>(n).fill(0);
  m[0] = slope(0);
  m[n - 1] = slope(n - 2);
  for (let i = 1; i < n - 1; i++) {
    const a = slope(i - 1), b = slope(i);
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  // Limitar las pendientes para que la curva nunca se devuelva
  for (let i = 0; i < n - 1; i++) {
    const d = slope(i);
    if (d === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d, b = m[i + 1] / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }

  const lut = new Uint8Array(256);
  for (let j = 0; j < 256; j++) {
    const x = j / 255;
    const i = Math.min(n - 2, Math.max(0, Math.floor(x * (n - 1))));
    const hh = h(i);
    const t = (x - xs[i]) / hh;
    const t2 = t * t, t3 = t2 * t;
    const y =
      points[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * hh * (t3 - 2 * t2 + t) +
      points[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * hh * (t3 - t2);
    lut[j] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}
