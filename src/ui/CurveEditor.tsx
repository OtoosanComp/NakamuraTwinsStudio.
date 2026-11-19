import { useRef, useState } from 'react';
import { buildCurveLut, CURVE_IDENTITY } from '../engine/curve';

const SIZE = 260;

/** Nombre de cada punto, para que se entienda qué zona de la foto mueves. */
const LABELS = ['Negros', 'Sombras', 'Medios', 'Luces', 'Blancos'];

export function CurveEditor({ points, onChange, onCommit, onLearn }: {
  points: number[];
  onChange: (p: number[]) => void;
  onCommit: () => void;
  onLearn?: (label: string, value: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const lut = buildCurveLut(points);
  // La línea de la curva sale de la misma tabla que usa la GPU: lo que ves es lo que se aplica.
  const path = Array.from({ length: 64 }, (_, i) => {
    const x = (i / 63) * SIZE;
    const y = SIZE - (lut[Math.round((i / 63) * 255)] / 255) * SIZE;
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const nearest = (px: number) => {
    let best = 0, bestD = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs((i / (points.length - 1)) * SIZE - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  const posOf = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };

  const move = (i: number, y: number) => {
    const v = Math.max(0, Math.min(1, 1 - y / SIZE));
    const next = [...points];
    next[i] = v;
    onChange(next);
    onLearn?.(LABELS[i], v);
  };

  return (
    <div className="curve">
      <svg
        ref={ref}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const { x, y } = posOf(e);
          const i = nearest(x);
          setDrag(i);
          move(i, y);
        }}
        onPointerMove={(e) => { if (drag !== null) move(drag, posOf(e).y); }}
        onPointerUp={() => { if (drag !== null) { setDrag(null); onCommit(); } }}
        onPointerCancel={() => setDrag(null)}
      >
        <rect width={SIZE} height={SIZE} rx="10" fill="#0c0a12" />
        {[1, 2, 3].map((i) => (
          <g key={i} stroke="#ffffff14">
            <line x1={(i * SIZE) / 4} y1="0" x2={(i * SIZE) / 4} y2={SIZE} />
            <line x1="0" y1={(i * SIZE) / 4} x2={SIZE} y2={(i * SIZE) / 4} />
          </g>
        ))}
        <line x1="0" y1={SIZE} x2={SIZE} y2="0" stroke="#ffffff22" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        {points.map((v, i) => (
          <circle
            key={i}
            cx={(i / (points.length - 1)) * SIZE}
            cy={SIZE - v * SIZE}
            r={drag === i ? 11 : 8}
            fill="#fff"
            stroke="var(--accent)"
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="curve-axis">
        <span>sombras</span><span>medios</span><span>luces</span>
      </div>
    </div>
  );
}

export { CURVE_IDENTITY };
