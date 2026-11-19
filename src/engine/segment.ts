// Separa a las personas del fondo con un modelo que corre dentro del teléfono (MediaPipe).
// No manda nada a internet: el modelo y su motor van dentro del APK.
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

/** Lado máximo de la máscara. El modelo trabaja a 256 px, así que más resolución no aporta. */
const MASK_MAX = 512;

let segmenter: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter> | null = null;

function assetUrl(file: string) {
  return new URL(`mp/${file}`, document.baseURI).href;
}

async function getSegmenter(): Promise<ImageSegmenter> {
  if (segmenter) return segmenter;
  if (!loading) {
    loading = (async () => {
      const files = await FilesetResolver.forVisionTasks(new URL('mp/', document.baseURI).href);
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: assetUrl('selfie_segmenter.tflite') },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      });
      return segmenter;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/**
 * Devuelve una imagen en blanco y negro del mismo encuadre que la foto:
 * blanco = persona, negro = fondo.
 */
export async function personMask(source: ImageBitmap | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  let seg: ImageSegmenter;
  try {
    seg = await getSegmenter();
  } catch {
    throw new Error('No pude cargar el modelo para separar al sujeto. Reinstala la app.');
  }

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

  const w = mask.width, h = mask.height;
  const values = mask.getAsFloat32Array();
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const ctx = full.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let covered = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > 0.5) covered++;
    const g = v * 255;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  result.close();

  if (covered / values.length < 0.01) throw new Error('No encontré personas en esta foto.');

  // Reducimos la máscara: el borde suave sale gratis del filtrado de la GPU y gasta menos memoria.
  const k = Math.min(1, MASK_MAX / Math.max(w, h));
  if (k === 1) return full;
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w * k));
  small.height = Math.max(1, Math.round(h * k));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, small.width, small.height);
  full.width = full.height = 1;
  return small;
}
