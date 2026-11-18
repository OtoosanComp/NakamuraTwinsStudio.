import { useEffect, useState, type RefObject } from 'react';

/** Calcula el tamaño en pantalla para que una imagen con cierta proporción quepa en su contenedor. */
export function useFit(ref: RefObject<HTMLElement>, aspect: number, pad = 0) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth - pad * 2, h: el.clientHeight - pad * 2 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, pad]);
  if (!box.w || !box.h || !aspect || !isFinite(aspect)) return undefined;
  let w = box.w, h = box.w / aspect;
  if (h > box.h) { h = box.h; w = h * aspect; }
  return { width: Math.floor(w), height: Math.floor(h) };
}
