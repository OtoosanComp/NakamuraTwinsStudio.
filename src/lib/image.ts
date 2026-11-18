// Carga de fotos (con datos EXIF) y exportación en alta resolución.
import { resolveCrop, type Adjustments, type CropState } from '../engine/adjustments';
import { Renderer } from '../engine/renderer';

export interface ExifInfo {
  model?: string;
  iso?: number;
  exposureTime?: number; // segundos
  fNumber?: number;
  focalLength?: number;
  focal35?: number;
  orientation?: number;
}

export interface LoadedPhoto {
  blob: Blob;
  /** Versión para editar en pantalla (lado largo ≤ 2048 px) */
  preview: ImageBitmap | HTMLCanvasElement;
  previewW: number;
  previewH: number;
  /** Tamaño real de la foto, ya rotada */
  fullW: number;
  fullH: number;
  exif: ExifInfo;
}

export const PREVIEW_MAX = 2048;
export const EXPORT_MAX = 6000;

/** Lee tamaño y EXIF de un JPEG sin decodificar toda la imagen. */
export async function readJpegMeta(blob: Blob): Promise<{ w?: number; h?: number; exif: ExifInfo }> {
  const buf = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer());
  const exif: ExifInfo = {};
  if (buf.byteLength < 4 || buf.getUint16(0) !== 0xffd8) return { exif };
  let off = 2, w: number | undefined, h: number | undefined;
  while (off + 4 < buf.byteLength) {
    if (buf.getUint8(off) !== 0xff) break;
    const marker = buf.getUint8(off + 1);
    const len = buf.getUint16(off + 2);
    if (marker === 0xe1 && buf.getUint32(off + 4) === 0x45786966) parseExif(buf, off + 10, exif);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      h = buf.getUint16(off + 5);
      w = buf.getUint16(off + 7);
      break;
    }
    off += 2 + len;
  }
  return { w, h, exif };
}

function parseExif(v: DataView, tiff: number, out: ExifInfo) {
  try {
    const le = v.getUint16(tiff) === 0x4949;
    const u16 = (o: number) => v.getUint16(tiff + o, le);
    const u32 = (o: number) => v.getUint32(tiff + o, le);
    const rational = (o: number) => { const d = u32(o + 4); return d ? u32(o) / d : undefined; };
    const readIfd = (ifd: number, cb: (tag: number, type: number, count: number, valOff: number) => void) => {
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        cb(u16(e), u16(e + 2), u32(e + 4), e + 8);
      }
    };
    let exifIfd = 0;
    readIfd(u32(4), (tag, type, count, vo) => {
      if (tag === 0x0112) out.orientation = u16(vo);
      if (tag === 0x8769) exifIfd = u32(vo);
      if (tag === 0x0110 && type === 2) {
        const p = count > 4 ? u32(vo) : vo;
        let s = '';
        for (let i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(tiff + p + i));
        out.model = s.trim();
      }
    });
    if (exifIfd) readIfd(exifIfd, (tag, _t, _c, vo) => {
      if (tag === 0x829a) out.exposureTime = rational(u32(vo));
      if (tag === 0x829d) out.fNumber = rational(u32(vo));
      if (tag === 0x8827) out.iso = u16(vo);
      if (tag === 0x920a) out.focalLength = rational(u32(vo));
      if (tag === 0xa405) out.focal35 = u16(vo);
    });
  } catch {
    /* EXIF dañado: lo ignoramos */
  }
}

export function formatShutter(t?: number) {
  if (!t) return '—';
  return t >= 1 ? `${t.toFixed(1)} s` : `1/${Math.round(1 / t)} s`;
}

async function decode(blob: Blob, maxSide: number, meta: { w?: number; h?: number; exif: ExifInfo }) {
  let w = meta.w, h = meta.h;
  const swap = (meta.exif.orientation ?? 1) >= 5;
  if (w && h && swap) [w, h] = [h, w];
  if (w && h) {
    const k = Math.min(1, maxSide / Math.max(w, h));
    try {
      const bmp = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
        resizeWidth: Math.round(w * k), resizeHeight: Math.round(h * k), resizeQuality: 'high',
      });
      // Algunos navegadores redimensionan antes de rotar: si la forma no coincide, decodificamos normal
      if (Math.abs(bmp.width / bmp.height - w / h) < 0.02) return { bmp, fullW: w, fullH: h };
      bmp.close();
    } catch { /* probar sin redimensionar */ }
  }
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const fw = full.width, fh = full.height;
  const k = Math.min(1, maxSide / Math.max(fw, fh));
  if (k === 1) return { bmp: full, fullW: fw, fullH: fh };
  const bmp = await createImageBitmap(full, { resizeWidth: Math.round(fw * k), resizeHeight: Math.round(fh * k), resizeQuality: 'high' });
  full.close();
  return { bmp, fullW: fw, fullH: fh };
}

export async function loadPhoto(blob: Blob): Promise<LoadedPhoto> {
  const meta = await readJpegMeta(blob).catch(() => ({ exif: {} as ExifInfo }));
  let res;
  try {
    res = await decode(blob, PREVIEW_MAX, meta);
  } catch {
    throw new Error('No pude abrir esta foto. Si es RAW (DNG) o HEIC, expórtala primero como JPG desde la galería.');
  }
  return {
    blob, preview: res.bmp, previewW: res.bmp.width, previewH: res.bmp.height,
    fullW: res.fullW, fullH: res.fullH, exif: meta.exif,
  };
}

/** Tamaño de salida para un recorte, limitado a un lado máximo. */
export function outputSize(crop: CropState, srcW: number, srcH: number, maxSide: number) {
  const r = resolveCrop(crop, srcW, srcH);
  const k = Math.min(1, maxSide / Math.max(r.w, r.h));
  return { rect: r, w: Math.max(1, Math.round(r.w * k)), h: Math.max(1, Math.round(r.h * k)) };
}

/** Revela la foto en alta resolución y la devuelve como JPEG. */
export async function exportJpeg(photo: LoadedPhoto, adj: Adjustments, crop: CropState, quality = 0.95): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const r = new Renderer(canvas);
  try {
    const maxSide = Math.min(r.maxTexture, EXPORT_MAX);
    const meta = await readJpegMeta(photo.blob).catch(() => ({ exif: {} as ExifInfo }));
    const { bmp } = await decode(photo.blob, maxSide, meta);
    r.setSource(bmp, bmp.width, bmp.height);
    const { rect, w, h } = outputSize(crop, bmp.width, bmp.height, maxSide);
    r.render(adj, rect, w, h);
    bmp.close();
    return await new Promise<Blob>((ok, bad) =>
      canvas.toBlob((b) => (b ? ok(b) : bad(new Error('No se pudo crear el JPG'))), 'image/jpeg', quality),
    );
  } finally {
    r.dispose(true);
    canvas.width = canvas.height = 1;
  }
}

/** Foto pequeña en JPEG base64 (para mandarla a la IA o como miniatura). */
export function smallJpegBase64(src: CanvasImageSource, w: number, h: number, maxSide = 1024, q = 0.85): string {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q).split(',')[1];
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result as string);
    fr.onerror = () => bad(fr.error);
    fr.readAsDataURL(blob);
  });
}
