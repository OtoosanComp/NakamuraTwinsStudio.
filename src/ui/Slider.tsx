import { useRef } from 'react';
import type { SliderDef } from '../engine/adjustments';

export function formatValue(def: SliderDef, v: number) {
  if (def.key === 'exposure') return `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`;
  if (def.absolute) return `${Math.round(v)}°`;
  const r = Math.round(v);
  return def.min < 0 && r > 0 ? `+${r}` : `${r}`;
}

interface Props {
  def: SliderDef;
  value: number;
  /** Valor sin tus ajustes (lo que dejó el auto + estilo). Se marca en la barra. */
  base?: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onReset?: () => void;
  onLearn?: (def: SliderDef, v: number) => void;
  label?: string;
  format?: (v: number) => string;
}

export function Slider({ def, value, base, onChange, onStart, onEnd, onReset, onLearn, label, format }: Props) {
  const lastTap = useRef(0);
  const pct = (x: number) => ((x - def.min) / (def.max - def.min)) * 100;
  const zero = def.absolute ? null : pct(Math.min(def.max, Math.max(def.min, 0)));
  const p = pct(value);
  const fill =
    def.gradient ??
    (zero === null
      ? undefined
      : `linear-gradient(90deg, var(--track) ${Math.min(zero, p)}%, var(--accent) ${Math.min(zero, p)}%, var(--accent) ${Math.max(zero, p)}%, var(--track) ${Math.max(zero, p)}%)`);
  const changed = base !== undefined && Math.abs(value - base) > 1e-3;

  return (
    <div className={`slider ${changed ? 'changed' : ''}`}>
      <div className="slider-head">
        <button
          className="slider-label"
          onClick={() => {
            onLearn?.(def, value);
            const now = Date.now();
            if (now - lastTap.current < 350) onReset?.();
            lastTap.current = now;
          }}
          title="Toca para aprender · doble toque para restablecer"
        >
          {label ?? def.label} <span className="q">?</span>
        </button>
        <span className="slider-value">{format ? format(value) : formatValue(def, value)}</span>
      </div>
      <div className="slider-track-wrap">
        {base !== undefined && !def.absolute && (
          <span className="slider-base" style={{ left: `${pct(Math.min(def.max, Math.max(def.min, base)))}%` }} />
        )}
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          style={{ background: fill }}
          onPointerDown={() => onStart?.()}
          onPointerUp={() => onEnd?.()}
          onPointerCancel={() => onEnd?.()}
          onKeyUp={() => onEnd?.()}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(v);
            onLearn?.(def, v);
          }}
        />
      </div>
    </div>
  );
}
