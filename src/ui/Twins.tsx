import type { ReactNode } from 'react';
import { TWINS, type TwinId } from '../ai/twins';

/** Avatar ilustrado de cada gemela. */
export function TwinAvatar({ id, size = 44 }: { id: TwinId; size?: number }) {
  const t = TWINS[id];
  const aiko = id === 'aiko';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="twin-avatar" aria-label={t.name}>
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={t.color} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#120f1a" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#bg-${id})`} stroke={t.color} strokeWidth="2" />
      {/* cabello trasero */}
      <path d={aiko ? 'M14 34 Q12 12 32 11 Q52 12 50 34 L52 50 Q44 44 44 36 L20 36 Q20 44 12 50 Z' : 'M13 36 Q11 12 32 11 Q53 12 51 36 L53 56 L44 56 L44 36 L20 36 L20 56 L11 56 Z'} fill="#1b1726" />
      {/* cara */}
      <ellipse cx="32" cy="35" rx="13" ry="15" fill="#f6d7c3" />
      {/* fleco */}
      <path d={aiko ? 'M18 30 Q20 15 34 16 Q46 17 46 30 Q40 22 33 24 Q26 21 18 30 Z' : 'M18 31 Q19 16 32 16 Q45 16 46 31 L40 25 L36 30 L32 24 L27 30 L23 25 Z'} fill="#1b1726" />
      {/* mechón de color */}
      <path d={aiko ? 'M38 17 Q45 20 46 29 Q42 24 37 23 Z' : 'M20 20 Q23 17 27 17 L22 28 Z'} fill={t.color} />
      {/* ojos */}
      <ellipse cx="26.5" cy="36" rx="2.2" ry={aiko ? 2.8 : 2.2} fill="#1b1726" />
      <ellipse cx="37.5" cy="36" rx="2.2" ry={aiko ? 2.8 : 2.2} fill="#1b1726" />
      <circle cx="27.3" cy="35" r="0.8" fill="#fff" />
      <circle cx="38.3" cy="35" r="0.8" fill="#fff" />
      {/* boca */}
      <path d={aiko ? 'M28.5 42 Q32 45.5 35.5 42' : 'M29.5 43 Q32 44.2 34.5 43'} stroke="#b0555e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* accesorio: Aiko visor de cámara, Mei gafas */}
      {aiko ? (
        <rect x="41" y="10" width="12" height="8" rx="2" fill={t.color} stroke="#1b1726" strokeWidth="1.2" />
      ) : (
        <g stroke={t.color} strokeWidth="1.3" fill="none">
          <circle cx="26.5" cy="36" r="4.4" />
          <circle cx="37.5" cy="36" r="4.4" />
          <path d="M30.9 36 L33.1 36" />
        </g>
      )}
    </svg>
  );
}

export function TwinBubble({ id, children, title }: { id: TwinId; children: ReactNode; title?: string }) {
  const t = TWINS[id];
  return (
    <div className={`twin-bubble twin-${id}`} style={{ ['--twin' as string]: t.color }}>
      <TwinAvatar id={id} size={40} />
      <div className="twin-bubble-body">
        <div className="twin-name">
          {t.name} <span>· {title ?? t.role}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
