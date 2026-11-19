// Todo lo que toca el teléfono: cámara, galería, guardar y compartir.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Media } from '@capacitor-community/media';
import { blobToDataUrl } from './image';

export const isNative = Capacitor.isNativePlatform();
export const ALBUM = 'Nakamura Twins Studio';

/** Abre la galería del teléfono y regresa la foto original (sin recomprimir). */
export function pickFromGallery(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `NTS_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

let albumPath: string | null = null;
async function ensureAlbum(): Promise<string> {
  if (albumPath) return albumPath;
  const { path } = await Media.getAlbumsPath();
  try { await Media.createAlbum({ name: ALBUM }); } catch { /* ya existe */ }
  albumPath = `${path}/${ALBUM}`;
  return albumPath;
}

/** Guarda el JPG terminado en la galería del teléfono (álbum "Nakamura Twins Studio"). */
export async function saveToGallery(jpeg: Blob): Promise<string> {
  const name = stamp();
  if (!isNative) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(jpeg);
    a.download = `${name}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return `${name}.jpg (descargas)`;
  }
  const album = await ensureAlbum();
  await Media.savePhoto({ path: await blobToDataUrl(jpeg), albumIdentifier: album, fileName: name });
  return `Galería › ${ALBUM}`;
}

/** Comparte la foto con WhatsApp, Instagram, etc. */
export async function shareImage(jpeg: Blob, text?: string) {
  const name = `${stamp()}.jpg`;
  if (!isNative) {
    const file = new File([jpeg], name, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
    else await saveToGallery(jpeg);
    return;
  }
  const data = (await blobToDataUrl(jpeg)).split(',')[1];
  const res = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
  await Share.share({ title: 'Nakamura Twins Studio', text, files: [res.uri] });
}
