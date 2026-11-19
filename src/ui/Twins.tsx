import type { ReactNode } from 'react';
import { TWINS, type TwinId } from '../ai/twins';

/**
 * Avatar ilustrado de cada gemela.
 * Yami: cabello cobrizo largo, ojos verdes, moño de cosplayer.
 * Tsuki: corte hongo lila, ojos grises, lentes de nerd y una nota musical.
 */
export function TwinAvatar({ id, size = 44 }: { id: TwinId; size?: number }) {
  const t = TWINS[id];
  const yami = id === 'yami';
  const hair = yami ? '#b5542f' : '#b98fe0';
  const hairDark = yami ? '#8c3d20' : '#8f6ab5';
  const eye = yami ? '#3f7d4e' : '#6b7280';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="twin-avatar" aria-label={t.name}>
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={t.color} stopOpacity="0.5" />
          <stop offset="100%" stopColor="#120f1a" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#bg-${id})`} stroke={t.color} strokeWidth="2" />

      {yami ? (
        /* melena larga cobriza */
        <path d="M13 36 Q11 11 32 10 Q53 11 51 36 L54 57 Q46 52 45 38 L19 38 Q18 52 10 57 Z" fill={hair} />
      ) : (
        /* corte hongo corto lila */
        <path d="M14 34 Q13 11 32 10 Q51 11 50 34 L50 41 Q45 36 44 33 L20 33 Q19 36 14 41 Z" fill={hair} />
      )}

      {/* cara, piel porcelana */}
      <ellipse cx="32" cy="35" rx="13" ry="15" fill="#f8e2d8" />

      {/* fleco */}
      {yami ? (
        <path d="M18 31 Q19 15 32 15 Q46 16 46 31 Q41 22 33 24 Q26 21 18 31 Z" fill={hair} />
      ) : (
        <path d="M18 32 Q18 15 32 15 Q46 15 46 32 L41 25 L37 31 L32 24 L27 31 L23 25 Z" fill={hair} />
      )}
      <path d={yami ? 'M41 17 Q47 21 46 30 Q43 24 39 23 Z' : 'M20 19 Q24 16 28 16 L23 29 Z'} fill={hairDark} />

      {/* ojos */}
      <ellipse cx="26.5" cy="36" rx="2.3" ry={yami ? 2.9 : 2.3} fill={eye} />
      <ellipse cx="37.5" cy="36" rx="2.3" ry={yami ? 2.9 : 2.3} fill={eye} />
      <circle cx="27.3" cy="35" r="0.8" fill="#fff" />
      <circle cx="38.3" cy="35" r="0.8" fill="#fff" />

      {/* boca */}
      <path
        d={yami ? 'M28.5 42 Q32 45.5 35.5 42' : 'M29.5 43 Q32 44.2 34.5 43'}
        stroke="#b0555e" strokeWidth="1.4" fill="none" strokeLinecap="round"
      />

      {yami ? (
        /* moño de cosplayer */
        <g fill={t.color}>
          <path d="M40 14 L48 10 L48 19 Z" />
          <path d="M48 10 L56 13 L50 20 Z" />
          <circle cx="48" cy="15" r="2.4" fill="#fff" opacity="0.85" />
        </g>
      ) : (
        <>
          {/* lentes */}
          <g stroke="#e8e3f2" strokeWidth="1.3" fill="none">
            <circle cx="26.5" cy="36" r="4.6" />
            <circle cx="37.5" cy="36" r="4.6" />
            <path d="M31.1 36 L32.9 36" />
          </g>
          {/* nota musical */}
          <g fill={t.color}>
            <path d="M50 11 L50 21" stroke={t.color} strokeWidth="1.6" />
            <path d="M50 11 Q54 12 55 14 L50 14 Z" />
            <ellipse cx="48" cy="21" rx="2.6" ry="2" />
          </g>
        </>
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
