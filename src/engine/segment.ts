// Separa a las personas del fondo con un modelo que corre dentro del teléfono (MediaPipe).
// No manda nada a internet: el modelo y su motor van dentro del APK.
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { guidedFilter } from './guided';

/** Lado máximo de la máscara. El modelo trabaja a 256 px, así que más resolución no aporta. */
const MASK_MAX = 1024;

let segmenter: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter> | null = null;

/**
 * MediaPipe arma las rutas como `${base}/archivo.js`, así que la base NO puede terminar en barra:
 * quedaría `/mp//archivo.js` y Android lee los archivos del APK sin corregir la barra doble,
 * por lo que el modelo nunca cargaba en el teléfono (en el navegador sí, porque ahí sí se corrige).
 */
const MP_BASE = new URL('mp', document.baseURI).href.replace(/\/+$/, '');

function assetUrl(file: string) {
  return `${MP_BASE}/${file}`;
}

/** Si algo falla, decimos cuál archivo faltó en vez de un mensaje genérico. */
async function loadFailure(e: unknown): Promise<string> {
  const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'selfie_segmenter.tflite'];
  const checks = await Promise.all(
    files.map(async (f) => {
      try {
        const r = await fetch(assetUrl(f), { method: 'GET' });
        return `${f}: ${r.ok ? 'ok' : r.status}`;
      } catch {
        return `${f}: sin respuesta`;
      }
    }),
  );
  const msg = e instanceof Error ? e.message : String(e);
  return `No pude cargar el modelo para separar al sujeto.\n${msg}\n${checks.join(' · ')}`;
}

async function getSegmenter(): Promise<ImageSegmenter> {
  if (segmenter) return segmenter;
  if (!loading) {
    loading = (async () => {
      const files = await FilesetResolver.forVisionTasks(MP_BASE);
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: assetUrl('selfie_segmenter.tflite') },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      });
      return segmenter;
    })().catch(async (e) => {
      loading = null;
      throw new Error(await loadFailure(e));
    });
  }
  return loading;
}

export interface PersonMask {
  /** Imagen en blanco y negro del mismo encuadre que la foto: blanco = persona, negro = fondo. */
  canvas: HTMLCanvasElement;
  /** Recuadro que ocupa la persona, en fracciones de 0 a 1 de la foto. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

export async function personMask(source: ImageBitmap | HTMLCanvasElement): Promise<PersonMask> {
  const seg = await getSegmenter();

  let input: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) input = source;
  else {
    input = document.createElement('canvas');
    input.width = source.width; input.height = source.height;
    input.getContext('2d')!.drawImage(source, 0, 0);
  }
  const result = seg.segment(input);
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    throw new Error('No encontré personas en esta foto.');
  }

  const w0 = mask.width, h0 = mask.height;
  const raw = mask.getAsFloat32Array();

  // Reajustamos la máscara con los bordes de la foto. A tamaño completo sería
  // lento y no aporta: el modelo no tiene ese detalle. 1024 px basta para el pelo.
  const rk = Math.min(1, 1024 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * rk));
  const h = Math.max(1, Math.round(h0 * rk));

  const gcv = document.createElement('canvas');
  gcv.width = w; gcv.height = h;
  const gctx = gcv.getContext('2d', { willReadFrequently: true })!;
  gctx.drawImage(input, 0, 0, w, h);
  const gpx = gctx.getImageData(0, 0, w, h).data;
  const guide = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    guide[i] = (0.2126 * gpx[i * 4] + 0.7152 * gpx[i * 4 + 1] + 0.0722 * gpx[i * 4 + 2]) / 255;
  }

  const coarse = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h0 - 1, Math.round(y / rk));
    for (let x = 0; x < w; x++) {
      coarse[y * w + x] = raw[sy * w0 + Math.min(w0 - 1, Math.round(x / rk))];
    }
  }

  const radius = Math.max(4, Math.round(Math.max(w, h) / 90));
  const values = guidedFilter(guide, coarse, w, h, radius, 1e-4);
  gcv.width = gcv.height = 1;
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const ctx = full.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let covered = 0;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > 0.5) {
      covered++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const g = v * 255;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  result.close();

  if (covered / values.length < 0.005) throw new Error('No encontré personas en esta foto.');
  const box = { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };

  // Reducimos la máscara: el borde suave sale gratis del filtrado de la GPU y gasta menos memoria.
  const k = Math.min(1, MASK_MAX / Math.max(w, h));
  if (k === 1) return { canvas: full, box };
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w * k));
  small.height = Math.max(1, Math.round(h * k));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, small.width, small.height);
  full.width = full.height = 1;
  return { canvas: small, box };
}
