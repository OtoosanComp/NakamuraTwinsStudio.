import {
  ALL_DEFS, DEF_BY_KEY, clampAdj, defaultCrop, neutral,
  type AdjKey, type Adjustments, type CropState, type PartialAdj,
} from './adjustments';
import type { Preset } from './presets';

/**
 * Una edición se arma en capas, como en Lightroom:
 *   resultado = automático + estilo × intensidad + tus ajustes
 * Así puedes cambiar de estilo sin perder lo que moviste a mano.
 */
export interface EditState {
  autoOn: boolean;
  auto: PartialAdj;
  presetId: string | null;
  amount: number; // 0..1.5
  user: PartialAdj;
  crop: CropState;
}

export function initialEdit(): EditState {
  return { autoOn: true, auto: {}, presetId: null, amount: 1, user: {}, crop: defaultCrop() };
}

/** Valor antes de tus ajustes manuales (automático + estilo). */
export function baseValue(st: EditState, preset: Preset | undefined, key: AdjKey): number {
  const def = DEF_BY_KEY[key];
  const n = neutral()[key];
  // Los tonos y el tamaño de grano son valores fijos, no se "suman"
  if (def.absolute || key === 'grainSize') return preset?.adj[key] ?? n;
  const a = st.autoOn ? st.auto[key] ?? 0 : 0;
  const p = preset?.adj[key] ?? 0;
  return n + a + p * st.amount;
}

export function composeAdjustments(st: EditState, preset: Preset | undefined): Adjustments {
  const out = neutral();
  for (const d of ALL_DEFS) {
    const base = baseValue(st, preset, d.key);
    const u = st.user[d.key];
    out[d.key] = clampAdj(d.key, d.absolute ? u ?? base : base + (u ?? 0));
  }
  return out;
}

/** Cuando mueves un control, se guarda la diferencia en tu capa de ajustes. */
export function setFinalValue(st: EditState, preset: Preset | undefined, key: AdjKey, value: number): EditState {
  const def = DEF_BY_KEY[key];
  const user = { ...st.user };
  if (def.absolute) user[key] = value;
  else {
    const diff = value - baseValue(st, preset, key);
    if (Math.abs(diff) < 1e-6) delete user[key];
    else user[key] = diff;
  }
  return { ...st, user };
}

export function resetKey(st: EditState, key: AdjKey): EditState {
  const user = { ...st.user };
  delete user[key];
  return { ...st, user };
}

/** Suma cambios (por ejemplo los que sugiere la IA) a tu capa de ajustes. */
export function addToUser(st: EditState, delta: PartialAdj): EditState {
  const user = { ...st.user };
  for (const [k, v] of Object.entries(delta) as [AdjKey, number][]) {
    if (!DEF_BY_KEY[k] || typeof v !== 'number' || !isFinite(v)) continue;
    if (DEF_BY_KEY[k].absolute) user[k] = v;
    else user[k] = (user[k] ?? 0) + v;
  }
  return { ...st, user };
}
