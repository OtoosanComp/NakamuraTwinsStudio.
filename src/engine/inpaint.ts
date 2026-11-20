/**
 * Relleno según contenido, al estilo del de Photoshop.
 *
 * En vez de copiar un pedazo de al lado, busca por TODA la foto los trocitos que
 * mejor encajan en el hueco y los cose promediándolos. Es el algoritmo PatchMatch
 * (Barnes et al.), resuelto de grueso a fino para que el relleno tenga sentido
 * también a gran escala y no solo en los bordes.
 *
 * Todo pasa dentro del teléfono: no hay modelo que descargar ni servidor.
 */

/** Lado del trozo que se compara. 7 da buen equilibrio entre detalle y velocidad. */
const P = 7;
const R = (P - 1) / 2;

/** Centros válidos: trozos que no pisan nada del hueco. */
function validCenters(hole: Uint8Array, w: number, h: number) {
  const iw = w + 1;
  const ii = new Int32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ii[(y + 1) * iw + x + 1] =
        hole[y * w + x] + ii[y * iw + x + 1] + ii[(y + 1) * iw + x] - ii[y * iw + x];
    }
  }
  const valid = new Uint8Array(w * h);
  const list: number[] = [];
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const x0 = x - R, y0 = y - R, x1 = x + R + 1, y1 = y + R + 1;
      const sum = ii[y1 * iw + x1] - ii[y0 * iw + x1] - ii[y1 * iw + x0] + ii[y0 * iw + x0];
      if (sum === 0) {
        valid[y * w + x] = 1;
        list.push(y * w + x);
      }
    }
  }
  return { valid, list };
}

/** Suma de diferencias al cuadrado entre dos trozos. Corta en cuanto se pasa del mejor. */
function patchDist(
  c: Float32Array, w: number,
  ax: number, ay: number, bx: number, by: number, best: number,
) {
  let d = 0;
  for (let dy = -R; dy <= R; dy++) {
    let ia = ((ay + dy) * w + ax - R) * 3;
    let ib = ((by + dy) * w + bx - R) * 3;
    for (let dx = -R; dx <= R; dx++) {
      const r = c[ia] - c[ib];
      const g = c[ia + 1] - c[ib + 1];
      const b = c[ia + 2] - c[ib + 2];
      d += r * r + g * g + b * b;
      ia += 3; ib += 3;
    }
    if (d >= best) return d;
  }
  return d;
}

/** Una pasada de PatchMatch más el voto que reconstruye el hueco. */
function solve(
  cur: Float32Array, hole: Uint8Array, w: number, h: number,
  nx: Int32Array, ny: Int32Array, iters: number, rnd: () => number,
) {
  const { valid, list } = validCenters(hole, w, h);
  if (!list.length) return;

  const targets: number[] = [];
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) if (hole[y * w + x]) targets.push(y * w + x);
  }
  if (!targets.length) return;

  // Si aún no hay correspondencia, se empieza con un trozo válido al azar
  for (const t of targets) {
    if (nx[t] < 0) {
      const s = list[(rnd() * list.length) | 0];
      nx[t] = s % w;
      ny[t] = (s / w) | 0;
    }
  }

  const dist = new Float32Array(w * h).fill(Infinity);
  const maxR = Math.max(w, h);
  const accR = new Float32Array(w * h);
  const accG = new Float32Array(w * h);
  const accB = new Float32Array(w * h);
  const accW = new Float32Array(w * h);

  for (let it = 0; it < iters; it++) {
    const forward = it % 2 === 0;
    for (let k = 0; k < targets.length; k++) {
      const t = targets[forward ? k : targets.length - 1 - k];
      const tx = t % w, ty = (t / w) | 0;
      let bx = nx[t], by = ny[t];
      let bd = patchDist(cur, w, tx, ty, bx, by, Infinity);

      // Propagación: si al vecino le sirvió un trozo, a este le sirve el de al lado
      const step = forward ? -1 : 1;
      if (tx - step >= 0 && tx - step < w) {
        const nb = t - step;
        if (nx[nb] >= 0) {
          const sx = nx[nb] + step, sy = ny[nb];
          if (sx >= R && sy >= R && sx < w - R && sy < h - R && valid[sy * w + sx]) {
            const d = patchDist(cur, w, tx, ty, sx, sy, bd);
            if (d < bd) { bd = d; bx = sx; by = sy; }
          }
        }
      }
      if (ty - step >= 0 && ty - step < h) {
        const nb = t - step * w;
        if (nx[nb] >= 0) {
          const sx = nx[nb], sy = ny[nb] + step;
          if (sx >= R && sy >= R && sx < w - R && sy < h - R && valid[sy * w + sx]) {
            const d = patchDist(cur, w, tx, ty, sx, sy, bd);
            if (d < bd) { bd = d; bx = sx; by = sy; }
          }
        }
      }

      // Búsqueda al azar, cada vez más cerca del mejor que llevamos
      for (let rad = maxR; rad >= 1; rad >>= 1) {
        const sx = (bx + (rnd() * 2 - 1) * rad) | 0;
        const sy = (by + (rnd() * 2 - 1) * rad) | 0;
        if (sx < R || sy < R || sx >= w - R || sy >= h - R) continue;
        if (!valid[sy * w + sx]) continue;
        const d = patchDist(cur, w, tx, ty, sx, sy, bd);
        if (d < bd) { bd = d; bx = sx; by = sy; }
      }

      nx[t] = bx; ny[t] = by; dist[t] = bd;
    }

    // Voto: cada pixel del hueco es el promedio de los trozos que lo cubren
    const last = it === iters - 1;
    accR.fill(0); accG.fill(0); accB.fill(0); accW.fill(0);
    for (const t of targets) {
      const tx = t % w, ty = (t / w) | 0;
      const sx = nx[t], sy = ny[t];
      // Los trozos que encajan mejor pesan más. En la última vuelta el peso se
      // vuelve mucho más selectivo: promediar muchos trozos aplana la textura
      // y el relleno se nota como una mancha lisa.
      const base = 1 / (1 + dist[t] * 0.0015);
      const weight = last ? base * base * base * base : base;
      for (let dy = -R; dy <= R; dy++) {
        const py = ty + dy;
        if (py < 0 || py >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const px = tx + dx;
          if (px < 0 || px >= w) continue;
          const pi = py * w + px;
          if (!hole[pi]) continue;
          const si = ((sy + dy) * w + (sx + dx)) * 3;
          accR[pi] += cur[si] * weight;
          accG[pi] += cur[si + 1] * weight;
          accB[pi] += cur[si + 2] * weight;
          accW[pi] += weight;
        }
      }
    }
    for (let i = 0; i < w * h; i++) {
      if (hole[i] && accW[i] > 0) {
        cur[i * 3] = accR[i] / accW[i];
        cur[i * 3 + 1] = accG[i] / accW[i];
        cur[i * 3 + 2] = accB[i] / accW[i];
      }
    }
  }
}

/**
 * Funde el relleno con lo que lo rodea resolviendo la ecuación de Poisson:
 * conserva la textura del relleno pero le ajusta el nivel para que el borde
 * calce exacto. Es lo que quita el escalón de tono que delata un parche.
 */
function blendSeam(data: Float32Array, hole: Uint8Array, w: number, h: number, iters: number) {
  const n = w * h;
  const targets: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (hole[i]) targets.push(i);
    }
  }
  if (!targets.length) return;

  // Lo que hay que conservar es la variación local, no el nivel absoluto
  const lap = new Float32Array(n * 3);
  for (const i of targets) {
    for (let c = 0; c < 3; c++) {
      lap[i * 3 + c] =
        4 * data[i * 3 + c] - data[(i - 1) * 3 + c] - data[(i + 1) * 3 + c]
        - data[(i - w) * 3 + c] - data[(i + w) * 3 + c];
    }
  }

  const out = new Float32Array(data);
  for (let it = 0; it < iters; it++) {
    // Alternamos el sentido del recorrido: la corrección se reparte más rápido
    const fwd = it % 2 === 0;
    for (let k = 0; k < targets.length; k++) {
      const i = targets[fwd ? k : targets.length - 1 - k];
      for (let c = 0; c < 3; c++) {
        const v =
          out[(i - 1) * 3 + c] + out[(i + 1) * 3 + c]
          + out[(i - w) * 3 + c] + out[(i + w) * 3 + c] - lap[i * 3 + c];
        out[i * 3 + c] = v * 0.25;
      }
    }
  }
  for (const i of targets) {
    data[i * 3] = out[i * 3];
    data[i * 3 + 1] = out[i * 3 + 1];
    data[i * 3 + 2] = out[i * 3 + 2];
  }
}

function halve(src: Float32Array, hole: Uint8Array, w: number, h: number) {
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const out = new Float32Array(w2 * h2 * 3);
  const hole2 = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let r = 0, g = 0, b = 0, n = 0, hh = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
          const si = (sy * w + sx) * 3;
          r += src[si]; g += src[si + 1]; b += src[si + 2]; n++;
          hh += hole[sy * w + sx];
        }
      }
      const o = (y * w2 + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
      // Al reducir, el hueco crece: más vale tapar de más que dejar basura
      hole2[y * w2 + x] = hh > 0 ? 1 : 0;
    }
  }
  return { data: out, hole: hole2, w: w2, h: h2 };
}

/**
 * Rellena `hole` (1 = tapar) dentro de `img`. Devuelve los píxeles ya rellenos.
 * La foto que entra debería estar recortada alrededor del objeto y no pasar de
 * unos 400 px de lado: el resultado se vuelve a escalar después.
 */
export function inpaint(img: ImageData, hole: Uint8Array, onProgress?: (f: number) => void): ImageData {
  const w = img.width, h = img.height;
  let seed = 1234567;
  const rnd = () => {
    // Generador propio: así el mismo hueco siempre da el mismo relleno
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const base = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    base[i * 3] = img.data[i * 4];
    base[i * 3 + 1] = img.data[i * 4 + 1];
    base[i * 3 + 2] = img.data[i * 4 + 2];
  }

  // Pirámide de grueso a fino
  const levels: { data: Float32Array; hole: Uint8Array; w: number; h: number }[] = [
    { data: base, hole, w, h },
  ];
  while (Math.max(levels[0].w, levels[0].h) > 48 && levels.length < 6) {
    const top = levels[0];
    levels.unshift(halve(top.data, top.hole, top.w, top.h));
  }

  // En el nivel más chico arrancamos con el color promedio de lo que rodea al hueco
  {
    const lv = levels[0];
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < lv.w * lv.h; i++) {
      if (!lv.hole[i]) { r += lv.data[i * 3]; g += lv.data[i * 3 + 1]; b += lv.data[i * 3 + 2]; n++; }
    }
    if (n) {
      for (let i = 0; i < lv.w * lv.h; i++) {
        if (lv.hole[i]) { lv.data[i * 3] = r / n; lv.data[i * 3 + 1] = g / n; lv.data[i * 3 + 2] = b / n; }
      }
    }
  }

  let nx: Int32Array | null = null, ny: Int32Array | null = null;
  for (let l = 0; l < levels.length; l++) {
    const lv = levels[l];
    const cx = new Int32Array(lv.w * lv.h).fill(-1);
    const cy = new Int32Array(lv.w * lv.h).fill(-1);
    if (nx && ny) {
      // Heredamos la correspondencia del nivel anterior, al doble de escala
      const pw = levels[l - 1].w, ph = levels[l - 1].h;
      for (let y = 0; y < lv.h; y++) {
        for (let x = 0; x < lv.w; x++) {
          const px = Math.min(pw - 1, x >> 1), py = Math.min(ph - 1, y >> 1);
          const pi = py * pw + px;
          if (nx[pi] >= 0) {
            cx[y * lv.w + x] = Math.min(lv.w - R - 1, Math.max(R, nx[pi] * 2));
            cy[y * lv.w + x] = Math.min(lv.h - R - 1, Math.max(R, ny[pi] * 2));
          }
        }
      }
    }
    // Los niveles finos cuestan mucho más, así que llevan menos vueltas
    const iters = l === levels.length - 1 ? 4 : l === levels.length - 2 ? 5 : 6;
    solve(lv.data, lv.hole, lv.w, lv.h, cx, cy, iters, rnd);
    nx = cx; ny = cy;
    onProgress?.((l + 1) / levels.length);

    // Lo resuelto aquí sirve de arranque para el siguiente nivel
    if (l < levels.length - 1) {
      const nxt = levels[l + 1];
      for (let y = 0; y < nxt.h; y++) {
        for (let x = 0; x < nxt.w; x++) {
          const i = y * nxt.w + x;
          if (!nxt.hole[i]) continue;
          const sx = Math.min(lv.w - 1, x >> 1), sy = Math.min(lv.h - 1, y >> 1);
          const si = (sy * lv.w + sx) * 3;
          nxt.data[i * 3] = lv.data[si];
          nxt.data[i * 3 + 1] = lv.data[si + 1];
          nxt.data[i * 3 + 2] = lv.data[si + 2];
        }
      }
    }
  }

  const fin = levels[levels.length - 1];
  blendSeam(fin.data, fin.hole, fin.w, fin.h, 260);

  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4] = Math.max(0, Math.min(255, fin.data[i * 3]));
    out.data[i * 4 + 1] = Math.max(0, Math.min(255, fin.data[i * 3 + 1]));
    out.data[i * 4 + 2] = Math.max(0, Math.min(255, fin.data[i * 3 + 2]));
    out.data[i * 4 + 3] = 255;
  }
  return out;
}
