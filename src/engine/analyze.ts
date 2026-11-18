import type { PartialAdj } from './adjustments';

export interface Analysis {
  auto: PartialAdj;
  notes: string[];
  stats: { median: number; p2: number; p98: number; clipped: number; crushed: number; meanSat: number; castR: number; castB: number };
  histogram: number[];
}

/** Analiza una versión pequeña de la foto y propone una corrección base, como lo haría un fotógrafo. */
export function analyzeImage(source: CanvasImageSource, w: number, h: number): Analysis {
  const S = 256;
  const k = Math.min(1, S / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;

  const hist = new Array(256).fill(0);
  let n = 0, satSum = 0, rSum = 0, gSum = 0, bSum = 0, neutralN = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    hist[l]++;
    n++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    satSum += s;
    // "mundo gris": solo tonos medios poco saturados para estimar la dominante de color
    if (l > 40 && l < 220 && s < 0.35) { rSum += r; gSum += g; bSum += b; neutralN++; }
  }
  const pct = (p: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= p * n) return i / 255; }
    return 1;
  };
  const p2 = pct(0.02), median = pct(0.5), p98 = pct(0.98);
  const clipped = (hist[254] + hist[255]) / n;
  const crushed = (hist[0] + hist[1]) / n;
  const meanSat = satSum / n;
  const castR = neutralN > 50 ? rSum / gSum - 1 : 0;
  const castB = neutralN > 50 ? bSum / gSum - 1 : 0;

  const auto: PartialAdj = {};
  const notes: string[] = [];
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  // Exposición: llevar el tono medio hacia ~0.46
  const target = 0.46;
  const ev = clamp(Math.log2(target / Math.max(median, 0.02)) * 0.55, -1.2, 1.5);
  if (Math.abs(ev) > 0.08) {
    auto.exposure = Math.round(ev * 20) / 20;
    notes.push(ev > 0 ? 'La foto estaba algo oscura: subí la exposición.' : 'La foto estaba algo clara: bajé la exposición.');
  }
  // Recuperar luces quemadas / abrir sombras
  if (clipped > 0.01 || p98 > 0.97) { auto.highlights = -Math.round(clamp(20 + clipped * 900, 20, 70)); notes.push('Había zonas casi blancas: recuperé las altas luces.'); }
  if (crushed > 0.02 || median < 0.3) { auto.shadows = Math.round(clamp(15 + crushed * 600 + (0.3 - median) * 80, 10, 55)); notes.push('Las sombras estaban cerradas: las abrí para ver más detalle.'); }
  // Puntos de blanco y negro
  if (p98 < 0.9) auto.whites = Math.round(clamp((0.94 - p98) * 160, 0, 40));
  if (p2 > 0.08) auto.blacks = -Math.round(clamp((p2 - 0.04) * 180, 0, 35));
  // Contraste si la imagen es plana
  const range = p98 - p2;
  if (range < 0.7) { auto.contrast = Math.round(clamp((0.75 - range) * 70, 0, 25)); notes.push('La imagen se veía plana: agregué contraste.'); }
  // Balance de blancos
  const tempFix = clamp(-(castR - castB) * 120, -30, 30);
  const tintFix = clamp(((castR + castB) / 2) * 140, -25, 25);
  if (Math.abs(tempFix) > 4) { auto.temperature = Math.round(tempFix * 0.6); notes.push(tempFix < 0 ? 'Tenía dominante cálida: neutralicé el balance de blancos.' : 'Tenía dominante fría: neutralicé el balance de blancos.'); }
  if (Math.abs(tintFix) > 4) auto.tint = Math.round(tintFix * 0.6);
  // Color apagado
  if (meanSat < 0.18) { auto.vibrance = Math.round(clamp((0.22 - meanSat) * 150, 5, 30)); notes.push('Colores apagados: subí la intensidad.'); }
  auto.sharpen = 15;
  if (!notes.length) notes.push('¡La foto ya venía bien expuesta! Solo la afiné un poco.');

  const hmax = Math.max(...hist.slice(2, 254), 1);
  const histogram = [];
  for (let i = 0; i < 64; i++) {
    let s = 0;
    for (let j = 0; j < 4; j++) s += hist[i * 4 + j];
    histogram.push(Math.min(1, s / 4 / hmax));
  }
  return { auto, notes, stats: { median, p2, p98, clipped, crushed, meanSat, castR, castB }, histogram };
}
