import { inpaint } from './inpaint';

export interface EraseStroke {
  /** Centro, en fracciones de 0 a 1 de la foto. */
  x: number;
  y: number;
  /** Radio, en fracción del ancho de la foto. */
  r: number;
}

/** Lado máximo al que se resuelve el relleno. Más grande = mejor, pero más lento. */
export const WORK_PREVIEW = 440;
export const WORK_EXPORT = 820;

/**
 * Calcula el relleno de todo lo que marcaste y lo devuelve como una capa del
 * tamaño de la foto: el color es el parche y el alfa dice dónde se aplica.
 */
export function buildEraseFill(
  source: CanvasImageSource,
  w: number,
  h: number,
  strokes: EraseStroke[],
  workMax = WORK_PREVIEW,
): HTMLCanvasElement | null {
  if (!strokes.length) return null;

  // 1. La forma de lo que hay que tapar
  const shape = document.createElement('canvas');
  shape.width = w; shape.height = h;
  const sctx = shape.getContext('2d', { willReadFrequently: true })!;
  sctx.fillStyle = '#fff';
  for (const s of strokes) {
    sctx.beginPath();
    sctx.arc(s.x * w, s.y * h, Math.max(2, s.r * w), 0, Math.PI * 2);
    sctx.fill();
  }

  // 2. Recorte de trabajo: el hueco más un margen, de donde salen los parches
  let x0 = w, y0 = h, x1 = 0, y1 = 0, maxR = 0;
  for (const s of strokes) {
    const r = Math.max(2, s.r * w);
    maxR = Math.max(maxR, r);
    x0 = Math.min(x0, s.x * w - r); x1 = Math.max(x1, s.x * w + r);
    y0 = Math.min(y0, s.y * h - r); y1 = Math.max(y1, s.y * h + r);
  }
  const margin = Math.max(40, maxR * 2.2);
  x0 = Math.max(0, Math.floor(x0 - margin));
  y0 = Math.max(0, Math.floor(y0 - margin));
  x1 = Math.min(w, Math.ceil(x1 + margin));
  y1 = Math.min(h, Math.ceil(y1 + margin));
  const rw = Math.max(16, x1 - x0), rh = Math.max(16, y1 - y0);

  const k = Math.min(1, workMax / Math.max(rw, rh));
  const ww = Math.max(16, Math.round(rw * k));
  const wh = Math.max(16, Math.round(rh * k));

  // 3. Píxeles y hueco a la resolución de trabajo
  const work = document.createElement('canvas');
  work.width = ww; work.height = wh;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  wctx.drawImage(source, x0, y0, rw, rh, 0, 0, ww, wh);
  const img = wctx.getImageData(0, 0, ww, wh);

  const hm = document.createElement('canvas');
  hm.width = ww; hm.height = wh;
  const hctx = hm.getContext('2d', { willReadFrequently: true })!;
  hctx.drawImage(shape, x0, y0, rw, rh, 0, 0, ww, wh);
  const hd = hctx.getImageData(0, 0, ww, wh).data;
  const hole = new Uint8Array(ww * wh);
  let count = 0;
  for (let i = 0; i < ww * wh; i++) {
    // Al reducir, el borde queda a medias: lo contamos como hueco para no dejar restos
    if (hd[i * 4 + 3] > 40) { hole[i] = 1; count++; }
  }
  if (!count || count >= ww * wh * 0.9) return null;

  // 4. Rellenar
  const filled = inpaint(img, hole);

  // 5. Devolverlo al tamaño de la foto, con el alfa de la forma original
  const small = document.createElement('canvas');
  small.width = ww; small.height = wh;
  small.getContext('2d')!.putImageData(filled, 0, 0);

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, ww, wh, x0, y0, rw, rh);
  // Solo se conserva lo que cae dentro de la forma marcada
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(shape, 0, 0);
  return out;
}
