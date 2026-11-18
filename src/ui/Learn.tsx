import type { SliderDef } from '../engine/adjustments';
import { formatValue } from './Slider';

export interface LearnInfo {
  title: string;
  value?: string;
  body: string;
  effect?: string;
  tip?: string;
}

export function learnFromSlider(def: SliderDef, v: number, label?: string): LearnInfo {
  const center = def.absolute ? null : def.min < 0 ? 0 : def.min;
  let effect: string | undefined;
  if (center !== null) {
    if (v > center + def.step / 2) effect = `⬆ ${def.up}`;
    else if (v < center - def.step / 2) effect = `⬇ ${def.down}`;
    else effect = 'En el centro: no cambia nada.';
  }
  return { title: label ?? def.label, value: formatValue(def, v), body: def.what, effect, tip: def.tip };
}

/** Lecciones de los datos de cámara (modo Pro). */
export const EXIF_LESSONS: Record<string, LearnInfo> = {
  iso: {
    title: 'ISO',
    body: 'Qué tanto amplifica el sensor la luz. ISO bajo (50-200) = foto limpia; ISO alto (1600+) = más brillo pero más ruido (granitos).',
    tip: 'En modo Pro, usa el ISO más bajo que puedas y compensa con la velocidad.',
  },
  shutter: {
    title: 'Velocidad de obturación',
    body: 'Cuánto tiempo entra la luz. Rápida (1/500) congela el movimiento; lenta (1/15 o más) deja estelas y puede salir movida.',
    tip: 'Regla práctica sin tripié: no bajes de 1/60 s. Con tripié puedes hacer estelas de autos de noche con 2-5 s.',
  },
  aperture: {
    title: 'Apertura (f/)',
    body: 'Qué tan abierto está el lente. En la mayoría de los celulares es fija; número chico (f/1.7) = entra mucha luz y fondo más borroso.',
  },
  focal: {
    title: 'Distancia focal',
    body: 'Qué tan "zoom" tiene la foto. 24-26 mm es gran angular (mucho espacio), 50 mm se parece a lo que ve el ojo, 70+ mm es teleobjetivo (comprime el fondo, ideal retratos).',
    tip: 'Para retratos aléjate un poco y usa el lente 2x: las caras se deforman menos.',
  },
};

export function LearnBubble({ info, onClose }: { info: LearnInfo | null; onClose: () => void }) {
  if (!info) return null;
  return (
    <div className="learn" onClick={onClose} role="status">
      <div className="learn-head">
        <strong>{info.title}</strong>
        {info.value && <span className="learn-value">{info.value}</span>}
      </div>
      <p>{info.body}</p>
      {info.effect && <p className="learn-effect">{info.effect}</p>}
      {info.tip && <p className="learn-tip">💡 {info.tip}</p>}
    </div>
  );
}
