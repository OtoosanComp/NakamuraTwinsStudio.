import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Undo2, Redo2, Eye, Save, Download, Share2, MoreVertical, Sparkles, Sun, Palette,
  Droplets, SlidersHorizontal, Crop, Film, Wand2, RotateCcw, Copy, ClipboardPaste, Grid3x3, Loader2, Trash2, Users, Pipette, TriangleAlert, Eraser, Plus, Minus, Maximize2, Minimize2, Images, Moon, CircleDot,
} from 'lucide-react';
import {
  ASPECTS, COLOR, EFFECTS, GRADING, HSL_COLORS, LIGHT, MASK, ALL_DEFS, cropOnSubject, defaultCrop, hslDefs, neutral,
  resolveCrop, type CropState, type PartialAdj, type SliderDef, type Adjustments,
} from '../engine/adjustments';
import { analyzeImage, type Analysis } from '../engine/analyze';
import {
  addToUser, baseValue, composeAdjustments, composeSubject, initialEdit, resetKey, setFinalValue, type EditState,
} from '../engine/editState';
import { PRESETS, loadCustomPresets, saveCustomPresets, type Preset } from '../engine/presets';
import { personMask, type PersonMask } from '../engine/segment';
import { buildCurveLut, CURVE_IDENTITY, isIdentityCurve } from '../engine/curve';
import { findHealSource, regroupHeal, HEAL_MAX } from '../engine/heal';
import { buildEraseFill } from '../engine/eraseFill';
import type { BrushStroke, LocalFilter } from '../engine/editState';
import { Renderer } from '../engine/renderer';
import {
  PREVIEW_MAX, decodeDetail, exportJpeg, formatShutter, loadPhoto, outputSize, smallJpegBase64, type LoadedPhoto,
} from '../lib/image';
import { pickManyFromGallery, saveToGallery, shareImage } from '../lib/platform';
import { hasAiKey, projects, uid, type Settings } from '../lib/storage';
import { reviewPhoto, type TwinsReview } from '../ai/vision';
import { Slider } from './Slider';
import { CurveEditor } from './CurveEditor';
import { EXIF_LESSONS, LearnBubble, learnFromSlider, type LearnInfo } from './Learn';
import { TwinAvatar, TwinBubble } from './Twins';
import { useFit } from './useFit';

export interface EditorSource {
  blob: Blob;
  edit?: EditState;
  projectId?: string;
  presetId?: string | null;
}

type Tab = 'estilos' | 'luz' | 'color' | 'mezcla' | 'gradacion' | 'efectos' | 'sujeto' | 'quitar' | 'filtros' | 'recorte' | 'gemelas';

const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: 'estilos', label: 'Estilos', icon: Film },
  { id: 'gemelas', label: 'Gemelas', icon: Sparkles },
  { id: 'luz', label: 'Luz', icon: Sun },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'mezcla', label: 'Mezcla', icon: Droplets },
  { id: 'gradacion', label: 'Gradación', icon: SlidersHorizontal },
  { id: 'efectos', label: 'Efectos', icon: Wand2 },
  { id: 'sujeto', label: 'Sujeto', icon: Users },
  { id: 'quitar', label: 'Quitar', icon: Eraser },
  { id: 'filtros', label: 'Filtros', icon: CircleDot },
  { id: 'recorte', label: 'Recorte', icon: Crop },
];

const CLIP_KEY = 'nts.clipboard';

/** Hasta dónde se puede acercar el recorte. */
const ZOOM_MAX = 6;

export function Editor({ source, settings, onBack, onOpenSettings, toast }: {
  source: EditorSource;
  settings: Settings;
  onBack: () => void;
  onOpenSettings: () => void;
  toast: (m: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(source.edit ?? initialEdit());
  const [past, setPast] = useState<EditState[]>([]);
  const [future, setFuture] = useState<EditState[]>([]);
  const [tab, setTab] = useState<Tab>('estilos');
  const [hslColor, setHslColor] = useState<(typeof HSL_COLORS)[number]>(HSL_COLORS[0]);
  const [bypass, setBypass] = useState(false);
  const [learn, setLearn] = useState<LearnInfo | null>(null);
  const [custom, setCustom] = useState<Preset[]>(loadCustomPresets);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(source.projectId);
  const [review, setReview] = useState<TwinsReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [grid, setGrid] = useState(false);
  const [hist, setHist] = useState<number[][] | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [mask, setMask] = useState<PersonMask | null>(null);
  const [maskBusy, setMaskBusy] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [showMask, setShowMask] = useState(false);
  /** Copia a mayor resolución que se carga sola al acercar, para ver el detalle real. */
  const [detail, setDetail] = useState<{ bmp: ImageBitmap; w: number; h: number } | null>(null);
  const detailBusy = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mx: number; my: number; crop: CropState; baseX: number; baseY: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const [picking, setPicking] = useState(false);
  /** 'off' = los dedos encuadran; si no, el dedo pinta. */
  const [paint, setPaint] = useState<'off' | 'add' | 'sub' | 'heal' | 'erase' | 'clonar' | 'dodge' | 'burn'>('off');
  const [brushSize, setBrushSize] = useState(0.07);
  const painting = useRef(false);
  const movingLocal = useRef(false);
  const lastPaint = useRef<{ x: number; y: number } | null>(null);
  /** Dónde empezó el trazo actual dentro de edit.heal, para recalcular el origen al soltar. */
  const healGroup = useRef(0);
  /** Origen elegido a mano para el sello de clonar. */
  const cloneSource = useRef<{ x: number; y: number } | null>(null);
  const [cloneSet, setCloneSet] = useState(false);
  const sampleDataRef = useRef<ImageData | null>(null);
  /** Sube de 1 cuando hay que resubir todo a la GPU y volver a dibujar. */
  const [gen, setGen] = useState(0);
  const [fill, setFill] = useState<HTMLCanvasElement | null>(null);
  const [fillBusy, setFillBusy] = useState(false);
  /** Sube al soltar el dedo: el relleno es caro y solo debe correr una vez por trazo. */
  const [eraseTick, setEraseTick] = useState(0);
  const [localSel, setLocalSel] = useState(0);
  const eraseRef = useRef(edit.erase);
  eraseRef.current = edit.erase;
  const [clip, setClip] = useState(false);
  /** Pantalla completa: la foto ocupa todo y las barras quedan encima, translúcidas. */
  const [full, setFull] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  const [batch, setBatch] = useState<{ done: number; total: number; fallos: number } | null>(null);
  const cancelBatch = useRef(false);
  const sampleRef = useRef<CanvasRenderingContext2D | null>(null);
  const dragStart = useRef<EditState | null>(null);
  const learnTimer = useRef<number>();

  const allPresets = useMemo(() => [...PRESETS, ...custom], [custom]);
  const preset = allPresets.find((p) => p.id === edit.presetId);
  // Solo estos campos entran en los ajustes. Si dependiera de `edit` entero,
  // cada toque del pincel volvería a dibujar toda la foto sin necesidad.
  const adj = useMemo(
    () => composeAdjustments(edit, preset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edit.autoOn, edit.auto, edit.presetId, edit.amount, edit.user, preset],
  );
  const subjectPreset = allPresets.find((p) => p.id === edit.subjectPresetId);
  const subjAdj = useMemo(
    () => composeSubject(edit, subjectPreset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edit.autoOn, edit.auto, edit.user, edit.maskOn, edit.subjectAmount, subjectPreset],
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const srcW = detail?.w ?? photo?.previewW ?? 1;
  const srcH = detail?.h ?? photo?.previewH ?? 1;
  const outAspect = useMemo(() => {
    if (!photo) return 0;
    const r = resolveCrop(edit.crop, srcW, srcH);
    return r.w / r.h;
  }, [photo, edit.crop, srcW, srcH]);
  const fit = useFit(stageRef, outAspect, 8);
  const outPx = useMemo(() => {
    if (!photo) return null;
    return outputSize(edit.crop, photo.fullW, photo.fullH, 99999);
  }, [photo, edit.crop]);

  // ---------- Cargar la foto ----------
  useEffect(() => {
    let alive = true;
    setDetail(null);
    loadPhoto(source.blob)
      .then((p) => {
        if (!alive) return;
        const a = analyzeImage(p.preview, p.previewW, p.previewH, p.exif.iso);
        setPhoto(p);
        setAnalysis(a);
        setEdit((st) => (source.edit ? { ...st, auto: a.auto } : { ...st, auto: a.auto, presetId: source.presetId ?? null }));
      })
      .catch((e) => alive && setLoadError(String(e.message ?? e)));
    return () => { alive = false; };
  }, [source]);

  useEffect(() => {
    if (!photo || !canvasRef.current) return;
    try {
      const r = new Renderer(canvasRef.current, true, () => setGen((g) => g + 1));
      r.setSource(detail?.bmp ?? photo.preview, srcW, srcH);
      rendererRef.current = r;
    } catch (e) {
      setLoadError(String((e as Error).message));
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, [photo]);

  // Al acercar cargamos la foto a resolución real; al alejar la soltamos para no gastar memoria.
  useEffect(() => {
    if (!photo) return;
    const zoom = edit.crop.zoom;
    if (zoom > 1.5 && !detail && !detailBusy.current && !busy && pointers.current.size === 0) {
      detailBusy.current = true;
      const max = Math.min(rendererRef.current?.maxTexture ?? 4096, 4096);
      decodeDetail(photo.blob, max)
        .then((bmp) => setDetail({ bmp, w: bmp.width, h: bmp.height }))
        .catch(() => {})
        .finally(() => { detailBusy.current = false; });
    } else if (zoom <= 1.2 && detail) {
      detail.bmp.close();
      setDetail(null);
    }
  }, [edit.crop.zoom, photo, detail, busy]);

  // Cambiar de fuente obliga a volver a subir la textura.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !photo) return;
    r.setSource(detail?.bmp ?? photo.preview, srcW, srcH);
  }, [detail, photo, srcW, srcH, gen]);

  useEffect(() => { sampleRef.current = null; sampleDataRef.current = null; }, [photo]);

  // Con 11 pestañas no caben todas: traemos la activa a la vista al cambiarla.
  useEffect(() => {
    const el = tabsRef.current?.querySelector('button.active');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);

  // Al regresar de otra app el lienzo puede venir vacío: forzamos un redibujado.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setGen((g) => g + 1); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);


  // ---------- Gotero de balance de blancos ----------
  /** Copia de la foto original para leer colores. Se crea la primera vez que usas el gotero. */
  const sampleCtx = useCallback(() => {
    if (sampleRef.current || !photo) return sampleRef.current;
    const k = Math.min(1, 1024 / Math.max(photo.previewW, photo.previewH));
    const c = document.createElement('canvas');
    c.width = Math.round(photo.previewW * k);
    c.height = Math.round(photo.previewH * k);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(photo.preview, 0, 0, c.width, c.height);
    sampleRef.current = ctx;
    return ctx;
  }, [photo]);

  /** Del punto que tocaste en pantalla al píxel de la foto, deshaciendo recorte y giro. */
  const imagePointAt = (clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv || !photo) return null;
    const r = cv.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const rect = resolveCrop(edit.crop, srcW, srcH);
    const qx = (u - 0.5) * rect.w, qy = (v - 0.5) * rect.h;
    const cs = Math.cos(rect.angle), sn = Math.sin(rect.angle);
    return { x: rect.cx + qx * cs - qy * sn, y: rect.cy + qx * sn + qy * cs };
  };

  /** Píxeles de la foto, leídos una sola vez: los usa el buscador de parches. */
  const sampleData = useCallback(() => {
    if (sampleDataRef.current) return sampleDataRef.current;
    const ctx = sampleCtx();
    if (!ctx) return null;
    sampleDataRef.current = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    return sampleDataRef.current;
  }, [sampleCtx]);

  /** Toca un gris o blanco: calculamos temperatura y matiz que lo dejan neutro. */
  const pickWhiteBalance = (clientX: number, clientY: number) => {
    const ctx = sampleCtx();
    const pt = imagePointAt(clientX, clientY);
    if (!ctx || !pt || !photo) return;
    const scale = ctx.canvas.width / srcW;
    const px = pt.x * scale;
    const py = pt.y * scale;

    const S = 7;
    const x0 = Math.max(0, Math.min(ctx.canvas.width - S, Math.round(px) - (S >> 1)));
    const y0 = Math.max(0, Math.min(ctx.canvas.height - S, Math.round(py) - (S >> 1)));
    const d = ctx.getImageData(x0, y0, S, S).data;
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    const n = d.length / 4;
    const lin = (x: number) => Math.pow(Math.max(x / n, 2) / 255, 2.2);
    const Rl = lin(R), Gl = lin(G), Bl = lin(B);

    // Resolvemos la temperatura y el matiz que igualan los tres canales.
    // ±1.5 porque las luces de escenario necesitan más corrección que un ±1
    const clampU = (x: number) => Math.max(-1.5, Math.min(1.5, x));
    const K = Gl * (1 / Rl + 1 / Bl);
    const ti = clampU((K - 2) / (0.16 + 0.18 * K));
    const t = clampU((Gl * (1 - 0.18 * ti) * (1 / Rl - 1 / Bl)) / 0.64);

    let next = setFinalValue(edit, preset, 'temperature', Math.round(t * 100));
    next = setFinalValue(next, preset, 'tint', Math.round(ti * 100));
    commit(next, edit);
    setPicking(false);
    showLearn({
      title: 'Balance de blancos con gotero',
      body: 'Tomé el color de ese punto y calculé la temperatura y el matiz que lo dejan gris neutro.',
      tip: 'Funciona mejor sobre algo que sabes que es blanco o gris: una pared, una tela blanca o el blanco de los ojos.',
    });
  };

  // ---------- Pincel y objetos quitados ----------
  const strokeCanvas = useCallback((strokes: BrushStroke[]) => {
    if (!strokes.length || !photo) return null;
    const W = 512;
    const H = Math.max(1, Math.round((W * photo.previewH) / photo.previewW));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080'; // gris = no toca nada
    ctx.fillRect(0, 0, W, H);
    for (const st of strokes) {
      const r = Math.max(1, st.r * W);
      const col = st.add ? '255,255,255' : '0,0,0';
      const g = ctx.createRadialGradient(st.x * W, st.y * H, 0, st.x * W, st.y * H, r);
      g.addColorStop(0, `rgba(${col},1)`);
      g.addColorStop(0.65, `rgba(${col},1)`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(st.x * W, st.y * H, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }, [photo]);

  const brushCanvas = useMemo(() => strokeCanvas(edit.brush), [strokeCanvas, edit.brush]);
  const dodgeCanvas = useMemo(() => strokeCanvas(edit.dodge), [strokeCanvas, edit.dodge]);

  useEffect(() => { rendererRef.current?.setBrush(brushCanvas); }, [brushCanvas, photo, gen]);
  useEffect(() => { rendererRef.current?.setDodge(dodgeCanvas); }, [dodgeCanvas, photo, gen]);
  useEffect(() => { rendererRef.current?.setHeal(edit.heal); }, [edit.heal, photo, gen]);
  useEffect(() => { rendererRef.current?.setLocal(edit.local); }, [edit.local, photo, gen]);
  useEffect(() => { rendererRef.current?.setFill(fill); }, [fill, photo, gen]);

  // El relleno según contenido es caro, así que corre una sola vez: al soltar el dedo.
  useEffect(() => {
    if (!photo) return;
    const strokes = eraseRef.current;
    if (!strokes.length) { setFill(null); setFillBusy(false); return; }
    let alive = true;
    setFillBusy(true);
    const id = window.setTimeout(() => {
      try {
        const f = buildEraseFill(photo.preview, photo.previewW, photo.previewH, strokes);
        if (alive) setFill(f);
      } catch {
        if (alive) toast('No pude rellenar esa zona. Marca un poco menos de una vez.');
      } finally {
        if (alive) setFillBusy(false);
      }
    }, 60);
    return () => { alive = false; clearTimeout(id); };
  }, [eraseTick, photo, toast]);

  // ---------- Curva de tonos ----------
  useEffect(() => {
    rendererRef.current?.setCurve(isIdentityCurve(edit.curve) ? null : buildCurveLut(edit.curve));
  }, [edit.curve, photo, gen]);

  // ---------- Máscara del sujeto ----------
  useEffect(() => {
    rendererRef.current?.setMask(edit.maskOn ? mask?.canvas ?? null : null);
  }, [mask, edit.maskOn, photo, gen]);

  const runMask = useCallback(async (silent = false) => {
    if (!photo) return;
    setMaskBusy(true);
    setMaskError(null);
    try {
      const m = await personMask(photo.preview);
      setMask(m);
      if (!silent) setEdit((st) => ({ ...st, maskOn: true }));
    } catch (e) {
      setMaskError((e as Error).message);
      if (silent) setEdit((st) => ({ ...st, maskOn: false }));
    } finally {
      setMaskBusy(false);
    }
  }, [photo]);

  // Si abres una foto guardada que ya usaba la separación, la recalculamos sola.
  useEffect(() => {
    if (photo && edit.maskOn && !mask && !maskBusy && !maskError) runMask(true);
  }, [photo, edit.maskOn, mask, maskBusy, maskError, runMask]);

  // ---------- Dibujar ----------
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !photo) return;
    const id = requestAnimationFrame(() => {
      const { rect, w, h } = outputSize(edit.crop, srcW, srcH, PREVIEW_MAX);
      r.renderSplit(bypass ? neutral() : adj, subjAdj, rect, w, h, { bypass, showMask, clip });
    });
    return () => cancelAnimationFrame(id);
  }, [adj, subjAdj, edit.crop, edit.curve, edit.heal, edit.local, fill, brushCanvas, dodgeCanvas, bypass, photo, mask, showMask, clip, detail, srcW, srcH, gen]);

  // ---------- Histograma de la foto editada ----------
  useEffect(() => {
    if (!photo) return;
    const t = window.setTimeout(() => {
      const c = canvasRef.current;
      if (!c || !c.width) return;
      const s = document.createElement('canvas');
      const k = 160 / Math.max(c.width, c.height);
      s.width = Math.max(1, Math.round(c.width * k)); s.height = Math.max(1, Math.round(c.height * k));
      const ctx = s.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(c, 0, 0, s.width, s.height);
      const d = ctx.getImageData(0, 0, s.width, s.height).data;
      const h = [new Array(64).fill(0), new Array(64).fill(0), new Array(64).fill(0)];
      for (let i = 0; i < d.length; i += 4) { h[0][d[i] >> 2]++; h[1][d[i + 1] >> 2]++; h[2][d[i + 2] >> 2]++; }
      const mx = Math.max(...h.flatMap((x) => x.slice(1, 63)), 1);
      setHist(h.map((ch) => ch.map((v) => Math.min(1, v / mx))));
    }, 300);
    return () => clearTimeout(t);
  }, [adj, edit.crop, photo]);

  // ---------- Historial (deshacer / rehacer) ----------
  const commit = useCallback((next: EditState, prev: EditState) => {
    setPast((p) => [...p.slice(-60), prev]);
    setFuture([]);
    setEdit(next);
  }, []);
  const apply = (fn: (s: EditState) => EditState) => commit(fn(edit), edit);
  /**
   * Para gestos y pincel: el estado ya se fue actualizando con setEdit, así que
   * aquí solo se apunta el punto de partida. Volver a escribirlo borraría lo último.
   */
  const pushHistory = useCallback((prev: EditState | null) => {
    if (!prev) return;
    setPast((p) => [...p.slice(-60), prev]);
    setFuture([]);
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [edit, ...f]);
    setEdit(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, edit]);
    setEdit(future[0]);
    setFuture((f) => f.slice(1));
  };

  const showLearn = (info: LearnInfo) => {
    if (!settings.showTips) return;
    setLearn(info);
    clearTimeout(learnTimer.current);
    learnTimer.current = window.setTimeout(() => setLearn(null), 9000);
  };

  // ---------- Controles ----------
  const sliderFor = (def: SliderDef, label?: string) => (
    <Slider
      key={def.key}
      def={def}
      label={label}
      value={adj[def.key]}
      base={baseValue(edit, preset, def.key)}
      onStart={() => { dragStart.current = edit; }}
      onChange={(v) => setEdit((st) => setFinalValue(st, preset, def.key, v))}
      onEnd={() => {
        pushHistory(dragStart.current);
        dragStart.current = null;
      }}
      onReset={() => apply((s) => resetKey(s, def.key))}
      onLearn={(d, v) => showLearn(learnFromSlider(d, v, label ? `${label} · ${d.label}` : undefined))}
    />
  );

  const choosePreset = (p: Preset | null) => {
    apply((s) => ({ ...s, presetId: p?.id ?? null }));
    if (p) showLearn({ title: `${p.name} · ${p.subtitle}`, body: p.recipe.split('. ')[0] + '. Toca "Cómo se hace este look" para ver la receta completa.', tip: p.suggestAspect ? 'Prueba el recorte 2.39:1 en la pestaña Recorte.' : undefined });
  };

  // ---------- Encuadre con los dedos: pellizcar, arrastrar y doble toque ----------

  const fingers = () => [...pointers.current.values()];
  const midpoint = (pts: { x: number; y: number }[]) => ({
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  });

  /** Guarda el estado del que parte el gesto, para que el movimiento sea relativo a él. */
  const beginGesture = () => {
    const pts = fingers();
    if (!pts.length || !photo) { gesture.current = null; return; }
    const m = midpoint(pts);
    const base = resolveCrop(edit.crop, srcW, srcH);
    gesture.current = {
      dist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      mx: m.x, my: m.y, crop: edit.crop, baseX: base.cx, baseY: base.cy,
    };
  };

  /** Doble toque: acerca al punto que tocaste, o regresa a la foto completa. */
  const doubleTapZoom = (clientX: number, clientY: number) => {
    if (!photo) return;
    if (edit.crop.zoom > 1.05) {
      apply((st) => ({ ...st, crop: { ...st.crop, zoom: 1 } }));
      return;
    }
    const pt = imagePointAt(clientX, clientY);
    if (!pt) return;
    apply((st) => ({
      ...st,
      crop: { ...st.crop, zoom: 2.5, cx: pt.x / srcW, cy: pt.y / srcH },
    }));
  };

  /** Añade un toque de pincel o un parche en el punto que tocaste. */
  const paintAt = (clientX: number, clientY: number) => {
    const pt = imagePointAt(clientX, clientY);
    if (!pt || !photo) return;
    const x = pt.x / srcW, y = pt.y / srcH;
    // Separamos los toques para no acumular miles
    const last = lastPaint.current;
    const gap = paint === 'heal' || paint === 'clonar' ? brushSize * 1.2 : brushSize * 0.35;
    if (last && Math.hypot(x - last.x, (y - last.y) * (srcH / srcW)) < gap) return;
    lastPaint.current = { x, y };

    if (paint === 'erase') {
      setEdit((st) => ({ ...st, erase: [...st.erase, { x, y, r: brushSize }] }));
    } else if (paint === 'clonar' || paint === 'heal') {
      if (edit.heal.length >= HEAL_MAX) { toast(`Máximo ${HEAL_MAX} toques de sello por foto.`); return; }
      const data = sampleData();
      if (!data) return;
      const stroke = cloneSource.current
        ? { x, y, r: brushSize, dx: cloneSource.current.x - x, dy: cloneSource.current.y - y, fix: [0, 0, 0] as [number, number, number] }
        : findHealSource(data, x, y, brushSize);
      setEdit((st) => ({ ...st, heal: [...st.heal, stroke] }));
    } else if (paint === 'dodge' || paint === 'burn') {
      const stroke: BrushStroke = { x, y, r: brushSize, add: paint === 'dodge' };
      setEdit((st) => ({ ...st, dodge: [...st.dodge, stroke] }));
    } else {
      const stroke: BrushStroke = { x, y, r: brushSize, add: paint === 'add' };
      setEdit((st) => ({ ...st, brush: [...st.brush, stroke], maskOn: true }));
    }
  };

  /** Arrastra el centro del filtro local seleccionado. */
  const moveLocal = (clientX: number, clientY: number) => {
    const pt = imagePointAt(clientX, clientY);
    if (!pt) return;
    setEdit((st) => {
      const next = [...st.local];
      if (!next[localSel]) return st;
      next[localSel] = { ...next[localSel], cx: pt.x / srcW, cy: pt.y / srcH };
      return { ...st, local: next };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (picking) { pickWhiteBalance(e.clientX, e.clientY); return; }
    if (!photo) return;
    // En el sello de clonar, el primer toque marca de dónde copiar
    if (paint === 'clonar' && !cloneSet) {
      const pt = imagePointAt(e.clientX, e.clientY);
      if (pt) {
        cloneSource.current = { x: pt.x / srcW, y: pt.y / srcH };
        setCloneSet(true);
        showLearn({
          title: 'Origen marcado',
          body: 'De aquí se va a copiar. Ahora pinta encima de lo que quieres tapar.',
          tip: 'Elige un pedazo con la misma luz y textura que el lugar a tapar.',
        });
      }
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);

    // En la pestaña de filtros, un dedo mueve el centro del filtro elegido
    if (tab === 'filtros' && edit.local[localSel] && pointers.current.size === 0) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      movingLocal.current = true;
      dragStart.current = edit;
      moveLocal(e.clientX, e.clientY);
      return;
    }

    if (paint !== 'off') {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        painting.current = true;
        lastPaint.current = null;
        healGroup.current = edit.heal.length;
        dragStart.current = edit;
        paintAt(e.clientX, e.clientY);
      } else {
        // Un segundo dedo deja de pintar y pasa a encuadrar, para poder acercarse
        painting.current = false;
        beginGesture();
      }
      return;
    }

    if (pointers.current.size === 0) {
      const now = Date.now();
      const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 40;
      if (now - lastTap.current.t < 320 && near) {
        lastTap.current = { t: 0, x: 0, y: 0 };
        doubleTapZoom(e.clientX, e.clientY);
        return;
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      dragStart.current = edit;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (movingLocal.current) { moveLocal(e.clientX, e.clientY); return; }
    if (painting.current) { paintAt(e.clientX, e.clientY); return; }
    const g = gesture.current;
    const cv = canvasRef.current;
    if (!g || !photo || !cv) return;
    const pts = fingers();
    const m = midpoint(pts);

    // Dos dedos: la separación entre ellos manda el acercamiento.
    let zoom = g.crop.zoom;
    if (pts.length >= 2 && g.dist > 10) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      zoom = Math.min(ZOOM_MAX, Math.max(1, g.crop.zoom * (d / g.dist)));
    }

    // Mover: lo que se desplazó el centro de los dedos, en píxeles de la foto.
    const cur = resolveCrop({ ...g.crop, zoom }, srcW, srcH);
    const scale = cur.w / cv.getBoundingClientRect().width;
    const dx = (m.x - g.mx) * scale, dy = (m.y - g.my) * scale;
    const cs = Math.cos(cur.angle), sn = Math.sin(cur.angle);
    const rx = dx * cs - dy * sn, ry = dx * sn + dy * cs;
    const cx = (g.baseX - rx) / srcW;
    const cy = (g.baseY - ry) / srcH;
    setEdit((st) => ({
      ...st,
      crop: { ...st.crop, zoom, cx: Math.min(1, Math.max(0, cx)), cy: Math.min(1, Math.max(0, cy)) },
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) { if (!painting.current) beginGesture(); return; }
    // Al soltar, todo el trazo se tapa con un solo origen bien elegido
    if (painting.current && paint === 'heal') {
      const data = sampleData();
      if (data) {
        setEdit((st) => {
          const group = st.heal.slice(healGroup.current);
          if (!group.length) return st;
          const fixed = regroupHeal(data, group, srcW / srcH);
          return { ...st, heal: [...st.heal.slice(0, healGroup.current), ...fixed] };
        });
      }
    }
    movingLocal.current = false;
    if (painting.current && paint === 'erase') setEraseTick((t) => t + 1);
    painting.current = false;
    lastPaint.current = null;
    pushHistory(dragStart.current);
    dragStart.current = null;
    gesture.current = null;
  };

  // ---------- Guardar / exportar ----------
  const thumb = () => {
    const c = canvasRef.current!;
    const t = document.createElement('canvas');
    const k = 360 / Math.max(c.width, c.height);
    t.width = Math.round(c.width * k); t.height = Math.round(c.height * k);
    t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.8);
  };

  const saveProject = async () => {
    if (!photo) return;
    const id = projectId ?? uid();
    const now = Date.now();
    await projects.put({ id, created: now, updated: now, original: photo.blob, edit, thumb: thumb(), presetName: preset?.name });
    setProjectId(id);
    toast('Guardado en "Mis fotos". Puedes seguir editándola cuando quieras.');
  };

  const runExport = async (mode: 'gallery' | 'share', limit?: number) => {
    if (!photo) return;
    setMenu(false);
    setBusy('Revelando en alta calidad…');
    // Soltamos la copia de alta resolución: revelar pide mucha memoria de golpe
    if (detail) { detail.bmp.close(); setDetail(null); }
    try {
      const jpeg = await exportJpeg(photo, adj, edit.crop, {
        mask: edit.maskOn ? mask : null,
        subjAdj,
        brush: edit.maskOn ? brushCanvas : null,
        dodge: dodgeCanvas,
        local: edit.local,
        curve: isIdentityCurve(edit.curve) ? null : buildCurveLut(edit.curve),
        heal: edit.heal,
        erase: edit.erase,
        limit,
      });
      if (mode === 'gallery') {
        const where = await saveToGallery(jpeg);
        toast(`¡Listo! Foto guardada en ${where}`);
      } else {
        await shareImage(jpeg, preset ? `Editada con estilo ${preset.name} en Nakamura Twins Studio` : undefined);
      }
    } catch (e) {
      const msg = (e as Error).message ?? '';
      toast(
        /decoded|decode/i.test(msg)
          ? 'No pude leer la foto original. Ábrela otra vez desde la galería y vuelve a exportar.'
          : `No se pudo exportar: ${msg}`,
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * Aplica el estilo y los ajustes de esta foto a varias más y las guarda en la galería.
   * No copia el recorte fino ni los parches: eso es de cada foto.
   */
  const runBatch = async () => {
    setMenu(false);
    const files = await pickManyFromGallery();
    if (!files.length) return;
    cancelBatch.current = false;
    setBatch({ done: 0, total: files.length, fallos: 0 });
    let fallos = 0;
    for (let i = 0; i < files.length; i++) {
      if (cancelBatch.current) break;
      try {
        const ph = await loadPhoto(files[i]);
        const a = analyzeImage(ph.preview, ph.previewW, ph.previewH, ph.exif.iso);
        const st: EditState = {
          ...edit,
          auto: a.auto,
          // El encuadre fino, los parches y el pincel son de la foto original
          crop: { ...defaultCrop(), aspect: edit.crop.aspect, angle: edit.crop.angle },
          heal: [],
          brush: [],
        };
        let m: PersonMask | null = null;
        if (edit.maskOn) m = await personMask(ph.preview).catch(() => null);
        const jpeg = await exportJpeg(ph, composeAdjustments(st, preset), st.crop, {
          mask: m,
          subjAdj: composeSubject(st, subjectPreset),
          curve: isIdentityCurve(st.curve) ? null : buildCurveLut(st.curve),
        });
        await saveToGallery(jpeg);
      } catch {
        fallos++;
      }
      setBatch({ done: i + 1, total: files.length, fallos });
    }
    setBatch(null);
    toast(fallos ? `Listo, con ${fallos} foto(s) que no se pudieron abrir.` : `Listo: ${files.length} foto(s) guardadas en la galería.`);
  };

  const copyAdjustments = () => {
    localStorage.setItem(CLIP_KEY, JSON.stringify({ presetId: edit.presetId, amount: edit.amount, user: edit.user }));
    setMenu(false);
    toast('Ajustes copiados. Ábrelos en otra foto y usa "Pegar ajustes".');
  };
  const pasteAdjustments = () => {
    setMenu(false);
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return toast('No hay ajustes copiados.');
    const c = JSON.parse(raw) as Pick<EditState, 'presetId' | 'amount' | 'user'>;
    apply((s) => ({ ...s, ...c }));
    toast('Ajustes pegados.');
  };
  const resetAll = () => {
    setMenu(false);
    apply((s) => ({ ...initialEdit(), auto: s.auto }));
  };

  const saveAsPreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const out: PartialAdj = {};
    const n = neutral();
    for (const d of ALL_DEFS) {
      const v = adj[d.key];
      if (d.absolute || d.key === 'grainSize') out[d.key] = v;
      else {
        const auto = edit.autoOn ? edit.auto[d.key] ?? 0 : 0;
        const delta = v - n[d.key] - auto;
        if (Math.abs(delta) > 1e-3) out[d.key] = Math.round(delta * 100) / 100;
      }
    }
    const p: Preset = {
      id: 'custom-' + uid(), name, subtitle: 'mi estilo', custom: true,
      palette: ['#222', '#555', '#999', '#ddd'], recipe: 'Un estilo creado por ti. ¡Ya eres colorista!', adj: out,
    };
    const list = [...custom, p];
    setCustom(list);
    saveCustomPresets(list);
    setNewPresetName('');
    apply((s) => ({ ...s, presetId: p.id, amount: 1, user: {} }));
    toast(`Estilo "${name}" guardado.`);
  };
  const deletePreset = (p: Preset) => {
    const list = custom.filter((c) => c.id !== p.id);
    setCustom(list);
    saveCustomPresets(list);
    if (edit.presetId === p.id) apply((s) => ({ ...s, presetId: null }));
  };

  // ---------- Gemelas (IA) ----------
  const askTwins = async () => {
    if (!photo) return;
    if (!hasAiKey(settings)) { onOpenSettings(); return; }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const r = await reviewPhoto({
        settings,
        imageBase64: smallJpegBase64(photo.preview, photo.previewW, photo.previewH, 1024),
        exif: photo.exif, presets: allPresets, currentPresetId: edit.presetId,
      });
      setReview(r);
    } catch (e) {
      setReviewError((e as Error).message);
    } finally {
      setReviewLoading(false);
    }
  };

  const applyReviewCrop = () => {
    const rc = review?.recorte;
    if (!rc) return;
    const aspect = ASPECTS.find((a) => a.label === rc.aspecto)?.value ?? null;
    apply((s) => ({ ...s, crop: { aspect, zoom: rc.zoom, cx: rc.cx, cy: rc.cy, angle: rc.angulo } }));
    setTab('recorte');
  };

  // ---------- Render ----------
  if (loadError) {
    return (
      <div className="screen center">
        <p className="error">{loadError}</p>
        <button className="btn" onClick={onBack}><ArrowLeft size={18} /> Regresar</button>
      </div>
    );
  }

  const panel = () => {
    switch (tab) {
      case 'estilos':
        return (
          <div className="panel">
            <div className="auto-row">
              <label className="switch">
                <input type="checkbox" checked={edit.autoOn} onChange={(e) => apply((s) => ({ ...s, autoOn: e.target.checked }))} />
                <span /> Auto Pro
              </label>
              <span className="muted small">{analysis ? analysis.notes[0] : 'Analizando…'}</span>
            </div>
            {edit.autoOn && analysis && analysis.notes.length > 1 && (
              <ul className="auto-notes">{analysis.notes.slice(1).map((n) => <li key={n}>{n}</li>)}</ul>
            )}
            <div className="preset-strip">
              <button className={`preset-card ${!edit.presetId ? 'active' : ''}`} onClick={() => choosePreset(null)}>
                <div className="preset-swatch none">∅</div>
                <span>Natural</span>
              </button>
              {allPresets.map((p) => (
                <button key={p.id} className={`preset-card ${edit.presetId === p.id ? 'active' : ''}`} onClick={() => choosePreset(p)}>
                  <div className="preset-swatch" style={{ background: `linear-gradient(135deg, ${p.palette.join(',')})` }} />
                  <span>{p.name}</span>
                  <small>{p.subtitle}</small>
                </button>
              ))}
            </div>
            {preset && (
              <>
                  <Slider
                    def={{ key: 'contrast', label: 'Intensidad del estilo', min: 0, max: 150, step: 1, what: 'Qué tan fuerte se aplica el estilo. 100 es la receta original.', up: 'Look más marcado.', down: 'Look más sutil y natural.' }}
                    value={Math.round(edit.amount * 100)}
                    onStart={() => { dragStart.current = edit; }}
                    onChange={(v) => setEdit((s) => ({ ...s, amount: v / 100 }))}
                    onEnd={() => { pushHistory(dragStart.current); dragStart.current = null; }}
                    onReset={() => apply((s) => ({ ...s, amount: 1 }))}
                    format={(v) => `${v}%`}
                    onLearn={(d, v) => showLearn({ title: d.label, value: `${v}%`, body: d.what })}
                  />
                <details className="recipe">
                  <summary>🎬 Cómo se hace este look</summary>
                  <p>{preset.recipe}</p>
                  {preset.custom && <button className="btn ghost small" onClick={() => deletePreset(preset)}><Trash2 size={14} /> Borrar este estilo</button>}
                </details>
              </>
            )}
            <div className="save-preset">
              <input placeholder="Nombre para guardar como tu estilo…" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} />
              <button className="btn small" disabled={!newPresetName.trim()} onClick={saveAsPreset}><Save size={14} /> Guardar estilo</button>
            </div>
          </div>
        );
      case 'luz':
        return (
          <div className="panel">
            <button className={`btn small ${clip ? 'primary' : ''}`} onClick={() => {
              setClip(!clip);
              if (!clip) showLearn({
                title: 'Avisar quemados y pegados',
                body: 'Marca en rojo lo que salió blanco total y en azul lo que salió negro total. Ahí ya no hay detalle que recuperar.',
                tip: 'En cosplay con traje blanco, revisa esto siempre antes de entregar: el rojo sobre la tela significa que perdiste la textura.',
              });
            }}>
              <TriangleAlert size={14} /> {clip ? 'Ocultar avisos' : 'Avisar quemados y pegados'}
            </button>
            {hist && <Histogram data={hist} />}
            {LIGHT.map((d) => sliderFor(d))}
            <div className="section-head">
              <p className="section-title">Curva de tonos</p>
              {!isIdentityCurve(edit.curve) && (
                <button className="link small" onClick={() => apply((st) => ({ ...st, curve: [...CURVE_IDENTITY] }))}>
                  Enderezar
                </button>
              )}
            </div>
            <p className="muted small">
              Arrastra los puntos: izquierda son las sombras y derecha las luces. Bajar las sombras y subir las luces
              (una "S") da contraste de cine sin tocar el color.
            </p>
            <CurveEditor
              points={edit.curve}
              onChange={(pts) => {
                if (!dragStart.current) dragStart.current = edit;
                setEdit((st) => ({ ...st, curve: pts }));
              }}
              onCommit={() => { pushHistory(dragStart.current); dragStart.current = null; }}
              onLearn={(label, v) => showLearn({
                title: `Curva · ${label}`,
                value: `${Math.round(v * 100)}%`,
                body: 'Cambias qué tan claro sale ese rango de tonos, sin tocar los demás.',
                tip: 'Si la curva queda muy empinada en una zona, ahí ganas contraste; donde queda plana, lo pierdes.',
              })}
            />
          </div>
        );
      case 'color':
        return (
          <div className="panel">
            <button className={`btn small ${picking ? 'primary' : ''}`} onClick={() => setPicking(!picking)}>
              <Pipette size={14} /> {picking ? 'Toca un gris o blanco de la foto…' : 'Gotero de balance de blancos'}
            </button>
            {COLOR.map((d) => sliderFor(d))}
          </div>
        );
      case 'mezcla':
        return (
          <div className="panel">
            <p className="muted small">Elige un color y cambia solo ese. Así se hacen los looks de cine.</p>
            <div className="hsl-dots">
              {HSL_COLORS.map((c) => (
                <button key={c.id} className={`hsl-dot ${hslColor.id === c.id ? 'active' : ''}`} style={{ background: c.swatch }} onClick={() => setHslColor(c)} aria-label={c.label} />
              ))}
            </div>
            <div className="hsl-title" style={{ color: hslColor.swatch }}>{hslColor.label}</div>
            {hslDefs(hslColor).map((d) => sliderFor(d, hslColor.label))}
          </div>
        );
      case 'gradacion':
        return (
          <div className="panel">
            <p className="muted small">Pinta de color las sombras, los medios tonos y las luces por separado. Es la herramienta favorita de los coloristas de cine.</p>
            <GradeWheels adj={adj} />
            {GRADING.map((d) => sliderFor(d))}
          </div>
        );
      case 'efectos':
        return (
          <div className="panel">
            <p className="section-title">Aclarar y quemar</p>
            <p className="muted small">
              Pinta luz donde quieras volumen y sombra donde quieras peso: en el pómulo, en el traje,
              en el fondo. Respeta lo que ya está quemado o pegado, así que no arruina el detalle.
            </p>
            <div className="row">
              <button className={`btn small ${paint === 'dodge' ? 'primary' : ''}`}
                onClick={() => { setPaint(paint === 'dodge' ? 'off' : 'dodge'); setPicking(false); }}>
                <Sun size={14} /> Aclarar
              </button>
              <button className={`btn small ${paint === 'burn' ? 'primary' : ''}`}
                onClick={() => { setPaint(paint === 'burn' ? 'off' : 'burn'); setPicking(false); }}>
                <Moon size={14} /> Quemar
              </button>
              <button className="btn ghost small" disabled={!edit.dodge.length}
                onClick={() => apply((st) => ({ ...st, dodge: [] }))}>
                <RotateCcw size={14} /> Limpiar
              </button>
            </div>
            {(paint === 'dodge' || paint === 'burn') && (
              <Slider
                def={{ key: 'contrast', label: 'Tamaño del pincel', min: 2, max: 25, step: 0.5, what: 'Qué tan grande es el círculo que pintas.', up: 'Más grande.', down: 'Más chico.' }}
                value={brushSize * 100}
                format={(v) => `${v.toFixed(1)}%`}
                onChange={(v) => setBrushSize(v / 100)}
              />
            )}
            <p className="section-title">Efectos</p>
            {EFFECTS.map((d) => sliderFor(d))}
          </div>
        );
      case 'sujeto':
        return (
          <div className="panel">
            <p className="muted small">
              El teléfono busca a las personas y las separa del fondo. Todo pasa dentro del teléfono: no se manda nada a internet.
            </p>
            {!mask && !edit.brush.length && (
              <button className="btn primary wide" onClick={() => runMask()} disabled={maskBusy}>
                {maskBusy
                  ? <><Loader2 className="spin" size={18} /> Buscando a las personas…</>
                  : <><Users size={18} /> Separar sujeto del fondo</>}
              </button>
            )}
            {maskError && <p className="error">{maskError}</p>}
            {(mask || edit.brush.length > 0) && (
              <>
                <div className="auto-row">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={edit.maskOn}
                      onChange={(e) => apply((st) => ({ ...st, maskOn: e.target.checked }))}
                    />
                    <span /> Sujeto y fondo por separado
                  </label>
                  <button
                    className="btn ghost small"
                    onPointerDown={() => setShowMask(true)}
                    onPointerUp={() => setShowMask(false)}
                    onPointerLeave={() => setShowMask(false)}
                  ><Eye size={14} /> Ver recorte</button>
                </div>
                {edit.maskOn ? (
                  <>
                    <p className="section-title">Estilo solo para la persona</p>
                    <p className="muted small">
                      El fondo se queda con el estilo que elegiste en Estilos. Aquí le pones otro a la persona:
                      por ejemplo fondo <b>Caballero de la Noche</b> y persona <b>Calle B/N</b>.
                    </p>
                    <div className="preset-strip">
                      <button
                        className={`preset-card ${!edit.subjectPresetId ? 'active' : ''}`}
                        onClick={() => apply((st) => ({ ...st, subjectPresetId: null }))}
                      >
                        <div className="preset-swatch none">=</div>
                        <span>El mismo</span>
                        <small>que el fondo</small>
                      </button>
                      {allPresets.map((p) => (
                        <button
                          key={p.id}
                          className={`preset-card ${edit.subjectPresetId === p.id ? 'active' : ''}`}
                          onClick={() => apply((st) => ({ ...st, subjectPresetId: p.id }))}
                        >
                          <div className="preset-swatch" style={{ background: `linear-gradient(135deg, ${p.palette.join(',')})` }} />
                          <span>{p.name}</span>
                          <small>{p.subtitle}</small>
                        </button>
                      ))}
                    </div>
                    {edit.subjectPresetId && (
                      <Slider
                        def={{ key: 'contrast', label: 'Intensidad en la persona', min: 0, max: 150, step: 1, what: 'Qué tan fuerte se aplica el estilo solo a la persona.', up: 'Más marcado.', down: 'Más sutil.' }}
                        value={Math.round(edit.subjectAmount * 100)}
                        format={(v) => `${v}%`}
                        onStart={() => { dragStart.current = edit; }}
                        onChange={(v) => setEdit((st) => ({ ...st, subjectAmount: v / 100 }))}
                        onEnd={() => { pushHistory(dragStart.current); dragStart.current = null; }}
                        onReset={() => apply((st) => ({ ...st, subjectAmount: 1 }))}
                        onLearn={(d, v) => showLearn({ title: d.label, value: `${v}%`, body: d.what })}
                      />
                    )}
                    <p className="section-title">Corregir el recorte a mano</p>
                    <p className="muted small">
                      Si la IA dejó fuera una peluca, un prop o unas alas, píntalo. Con dos dedos te acercas sin salir.
                    </p>
                    <div className="row">
                      <button className={`btn small ${paint === 'add' ? 'primary' : ''}`}
                        onClick={() => { setPaint(paint === 'add' ? 'off' : 'add'); setPicking(false); }}>
                        <Plus size={14} /> Añadir
                      </button>
                      <button className={`btn small ${paint === 'sub' ? 'primary' : ''}`}
                        onClick={() => { setPaint(paint === 'sub' ? 'off' : 'sub'); setPicking(false); }}>
                        <Minus size={14} /> Borrar
                      </button>
                      <button className="btn ghost small" disabled={!edit.brush.length}
                        onClick={() => apply((st) => ({ ...st, brush: [] }))}>
                        <RotateCcw size={14} /> Limpiar
                      </button>
                    </div>
              <Slider
                def={{ key: 'contrast', label: 'Tamaño del pincel', min: 2, max: 25, step: 0.5, what: 'Qué tan grande es el círculo que pintas con el dedo.', up: 'Más grande: avanzas rápido.', down: 'Más chico: para detalles como el pelo.' }}
                value={brushSize * 100}
                format={(v) => `${v.toFixed(1)}%`}
                onChange={(v) => setBrushSize(v / 100)}
              />
                    <p className="section-title">Ajustes finos</p>
                    {MASK.map((d) => sliderFor(d))}
                  </>
                ) : (
                  <p className="muted small">Enciende el interruptor para ajustar al sujeto y al fondo por separado.</p>
                )}
                <button className="btn ghost small" onClick={() => { setMask(null); setDetail(null); }}>
                  <RotateCcw size={14} /> Buscar personas otra vez
                </button>
              </>
            )}
          </div>
        );
      case 'quitar':
        return (
          <div className="panel">
            <div className="chips">
              <button className={`chip ${paint !== 'clonar' ? 'active' : ''}`}
                onClick={() => { setPaint('off'); setCloneSet(false); cloneSource.current = null; }}>
                Borrar objeto
              </button>
              <button className={`chip ${paint === 'clonar' ? 'active' : ''}`}
                onClick={() => { setPaint('clonar'); setCloneSet(false); cloneSource.current = null; setPicking(false); }}>
                Sello de clonar
              </button>
            </div>

            {paint === 'clonar' ? (
              <>
                <p className="muted small">
                  Tú decides de dónde se copia. Primero toca un pedazo limpio (el origen) y luego pinta encima
                  de lo que quieres tapar. Sirve cuando el automático se equivoca.
                </p>
                <p className="out-size">
                  {cloneSet ? '✓ Origen marcado. Ahora pinta encima del objeto.' : 'Toca primero el pedazo del que quieres copiar.'}
                </p>
                <div className="row">
                  <button className="btn ghost small" onClick={() => { setCloneSet(false); cloneSource.current = null; }}>
                    <Pipette size={14} /> Cambiar el origen
                  </button>
                  <button className="btn ghost small" disabled={!edit.heal.length}
                    onClick={() => apply((st) => ({ ...st, heal: [] }))}>
                    <RotateCcw size={14} /> Limpiar sello
                  </button>
                </div>
                <p className="out-size">{edit.heal.length} de {HEAL_MAX} toques de sello</p>
              </>
            ) : (
              <>
                <p className="muted small">
                  <b>Pinta encima de todo el objeto</b> sin levantar el dedo. Al soltar, la app busca en toda la foto
                  los pedazos que mejor encajan y reconstruye el fondo, hasta patrones como un muro de ladrillo.
                </p>
                <button
                  className={`btn wide ${paint === 'erase' ? 'primary' : ''}`}
                  onClick={() => { setPaint(paint === 'erase' ? 'off' : 'erase'); setPicking(false); }}
                >
                  <Eraser size={16} /> {paint === 'erase' ? 'Pintando… (toca aquí para terminar)' : 'Borrar objeto'}
                </button>
                {fillBusy && <p className="out-size"><Loader2 className="spin" size={12} /> Reconstruyendo el fondo…</p>}
                {paint === 'erase' && <p className="muted small">Con dos dedos te acercas sin salir del modo.</p>}
                <div className="row">
                  <button className="btn ghost small" disabled={!edit.erase.length}
                    onClick={() => { apply((st) => ({ ...st, erase: [] })); setEraseTick((t) => t + 1); }}>
                    <RotateCcw size={14} /> Empezar de nuevo
                  </button>
                </div>
              </>
            )}
            <Slider
              def={{ key: 'contrast', label: 'Tamaño del pincel', min: 2, max: 25, step: 0.5, what: 'Qué tan grande es el círculo que pintas con el dedo.', up: 'Más grande: avanzas rápido.', down: 'Más chico: para detalles.' }}
              value={brushSize * 100}
              format={(v) => `${v.toFixed(1)}%`}
              onChange={(v) => setBrushSize(v / 100)}
            />
          </div>
        );
      case 'filtros': {
        const lf = edit.local[localSel];
        const setLf = (patch: Partial<LocalFilter>, commitIt = true) => {
          const fn = (st: EditState) => {
            const next = [...st.local];
            next[localSel] = { ...next[localSel], ...patch };
            return { ...st, local: next };
          };
          if (commitIt) apply(fn); else setEdit(fn);
        };
        const addFilter = (type: 'radial' | 'lineal') => {
          if (edit.local.length >= 3) { toast('Hasta 3 filtros por foto.'); return; }
          apply((st) => ({ ...st, local: [...st.local, { ...({ type: 'radial', cx: 0.5, cy: 0.5, size: 0.3, angle: 0, feather: 0.5, invert: false, exposure: 0, temperature: 0, saturation: 0 } as LocalFilter), type, angle: type === 'lineal' ? 90 : 0 }] }));
          setLocalSel(edit.local.length);
        };
        const lfSlider = (label: string, key: keyof LocalFilter, min: number, max: number, step: number, what: string, fmt?: (v: number) => string) => (
          <Slider
            def={{ key: 'contrast', label, min, max, step, what, up: 'Sube el efecto.', down: 'Lo baja.' }}
            value={lf[key] as number}
            format={fmt}
            onStart={() => { dragStart.current = edit; }}
            onChange={(v) => setLf({ [key]: v } as Partial<LocalFilter>, false)}
            onEnd={() => { pushHistory(dragStart.current); dragStart.current = null; }}
            onReset={() => setLf({ [key]: 0 } as Partial<LocalFilter>)}
            onLearn={(d, v) => showLearn({ title: d.label, value: String(Math.round(v * 100) / 100), body: what })}
          />
        );
        return (
          <div className="panel">
            <p className="muted small">
              Afectan solo una parte de la foto, sin pincel: el <b>radial</b> para una cara o un sujeto,
              el <b>degradado</b> para un cielo o un piso. Arrastra sobre la foto para moverlo.
            </p>
            <div className="row">
              <button className="btn small" onClick={() => addFilter('radial')}><CircleDot size={14} /> Radial</button>
              <button className="btn small" onClick={() => addFilter('lineal')}><SlidersHorizontal size={14} /> Degradado</button>
            </div>
            {edit.local.length > 1 && (
              <div className="chips">
                {edit.local.map((f, i) => (
                  <button key={i} className={`chip ${i === localSel ? 'active' : ''}`} onClick={() => setLocalSel(i)}>
                    {f.type === 'radial' ? 'Radial' : 'Degradado'} {i + 1}
                  </button>
                ))}
              </div>
            )}
            {!lf ? (
              <p className="muted small">Agrega uno para empezar.</p>
            ) : (
              <>
                {lfSlider('Luz', 'exposure', -2, 2, 0.02, 'Aclara u oscurece solo la zona del filtro.', (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`)}
                {lfSlider('Temperatura', 'temperature', -100, 100, 1, 'Calienta o enfría solo esa zona.')}
                {lfSlider('Saturación', 'saturation', -100, 100, 1, 'Sube o baja el color solo en esa zona.')}
                {lfSlider('Tamaño', 'size', 0.05, 1.2, 0.01, 'Qué tan grande es la zona que abarca.', (v) => `${Math.round(v * 100)}%`)}
                {lfSlider('Suavidad del borde', 'feather', 0.05, 1, 0.01, 'Qué tan difuminado es el paso entre dentro y fuera.', (v) => `${Math.round(v * 100)}%`)}
                {lf.type === 'lineal' && lfSlider('Giro', 'angle', -180, 180, 1, 'Hacia dónde cae el degradado.', (v) => `${Math.round(v)}°`)}
                <div className="row">
                  <button className={`btn small ${lf.invert ? 'primary' : ''}`} onClick={() => setLf({ invert: !lf.invert })}>
                    <RotateCcw size={14} /> {lf.invert ? 'Afecta fuera' : 'Afecta dentro'}
                  </button>
                  <button className="btn ghost small" onClick={() => {
                    apply((st) => ({ ...st, local: st.local.filter((_, i) => i !== localSel) }));
                    setLocalSel(0);
                  }}><Trash2 size={14} /> Quitar filtro</button>
                </div>
              </>
            )}
          </div>
        );
      }
      case 'recorte':
        return (
          <div className="panel">
            <p className="muted small">
              <b>Pellizca con dos dedos</b> sobre la foto para acercar y <b>arrastra</b> para mover.
              Doble toque acerca de golpe al punto que tocaste.
            </p>
            <Slider
              def={{ key: 'contrast', label: 'Acercar', min: 1, max: ZOOM_MAX, step: 0.01, what: 'Recorta más cerca del sujeto para que el fondo estorbe menos.', up: 'Más cerca: la persona llena el cuadro.', down: 'Más lejos, hasta la foto completa.', tip: 'Es el mismo zoom del pellizco. Al acercar pierdes píxeles: abajo ves con cuántos te quedas.' }}
              value={edit.crop.zoom}
              onStart={() => { dragStart.current = edit; }}
              onChange={(v) => setEdit((s) => ({ ...s, crop: { ...s.crop, zoom: v } }))}
              onEnd={() => { pushHistory(dragStart.current); dragStart.current = null; }}
              format={(v) => `${v.toFixed(2)}×`}
              onReset={() => apply((s) => ({ ...s, crop: { ...s.crop, zoom: 1 } }))}
              onLearn={(d, v) => showLearn({ ...learnFromSlider(d, v), value: `${v.toFixed(2)}×`, effect: undefined })}
            />
            {outPx && (
              <p className={`out-size ${Math.min(outPx.w, outPx.h) < 1000 ? 'warn' : ''}`}>
                Te queda una foto de <b>{outPx.w} × {outPx.h} px</b>
                {Math.min(outPx.w, outPx.h) < 1000 ? ' · ya es poca resolución para imprimir' : ''}
              </p>
            )}
            <div className="chips">
              {ASPECTS.map((a) => (
                <button
                  key={a.label}
                  className={`chip ${edit.crop.aspect === a.value ? 'active' : ''}`}
                  onClick={() => { apply((s) => ({ ...s, crop: { ...s.crop, aspect: a.value } })); showLearn({ title: `Formato ${a.label}`, body: a.hint }); }}
                >{a.label}</button>
              ))}
            </div>
            <Slider
              def={{ key: 'contrast', label: 'Enderezar', min: -20, max: 20, step: 0.1, what: 'Gira la foto para que el horizonte o los edificios queden rectos.', up: 'Gira a la derecha (sentido del reloj).', down: 'Gira a la izquierda.', tip: 'Un horizonte chueco es el error #1 de encuadre. Fíjate en el piso o las líneas de los edificios.' }}
              value={edit.crop.angle}
              onStart={() => { dragStart.current = edit; }}
              onChange={(v) => setEdit((s) => ({ ...s, crop: { ...s.crop, angle: v } }))}
              onEnd={() => { pushHistory(dragStart.current); dragStart.current = null; }}
              format={(v) => `${v.toFixed(1)}°`}
              onReset={() => apply((s) => ({ ...s, crop: { ...s.crop, angle: 0 } }))}
              onLearn={(d, v) => showLearn({ ...learnFromSlider(d, v), value: `${v.toFixed(1)}°` })}
            />
            <div className="row">
              <button
                className="btn small"
                disabled={!mask || !photo}
                onClick={() => {
                  if (!mask || !photo) return;
                  apply((st) => ({ ...st, crop: cropOnSubject(st.crop, mask.box, photo.previewW, photo.previewH) }));
                  showLearn({
                    title: 'Centrar en la persona',
                    body: 'Usé el recorte que ya calculó el teléfono para poner a la persona en el centro y llenar el cuadro.',
                    tip: 'Después muévelo con el dedo: dejar aire del lado hacia donde mira se ve más natural que el centro exacto.',
                  });
                }}
              ><Users size={14} /> Centrar en la persona</button>
              <button className="btn ghost small" onClick={() => apply((s) => ({ ...s, crop: defaultCrop() }))}><RotateCcw size={14} /> Quitar recorte</button>
            </div>
            {!mask && <p className="muted small">El centrado automático necesita "Separar sujeto del fondo" (pestaña Sujeto). El pellizco y el arrastre funcionan siempre.</p>}
          </div>
        );
      case 'gemelas':
        return (
          <div className="panel">
            {!review && !reviewLoading && (
              <div className="twins-intro">
                <div className="twins-pair"><TwinAvatar id="tsuki" size={56} /><TwinAvatar id="yami" size={56} /></div>
                <p>Las gemelas ven tu foto y te dicen cómo mejorar el <b>encuadre</b>, la <b>luz</b> y el <b>color</b>, y qué estilo le queda mejor.</p>
                {!hasAiKey(settings) && <p className="muted small">Necesitas poner tu API key en Ajustes.</p>}
              </div>
            )}
            {reviewError && <p className="error">{reviewError}</p>}
            <button className="btn primary wide" onClick={askTwins} disabled={reviewLoading}>
              {reviewLoading ? <><Loader2 className="spin" size={18} /> Las gemelas están viendo tu foto…</> : <><Sparkles size={18} /> {review ? 'Preguntar otra vez' : 'Pedir opinión a las gemelas'}</>}
            </button>
            {review && <ReviewView review={review} presets={allPresets}
              onPreset={(id) => { const p = allPresets.find((x) => x.id === id); if (p) choosePreset(p); }}
              onCrop={applyReviewCrop}
              onAdjust={() => { apply((s) => addToUser(s, review.ajustes)); toast('Apliqué los ajustes que sugirió Yami. Mira qué cambió en cada pestaña.'); }}
            />}
          </div>
        );
    }
  };

  const ex = photo?.exif;
  const showGrid = tab === 'recorte' || grid;

  return (
    <div className={`editor ${full ? 'full' : ''}`}>
      <header className="topbar">
        <button className="icon" onClick={onBack} aria-label="Regresar"><ArrowLeft /></button>
        <div className="topbar-mid">
          <button className="icon" onClick={undo} disabled={!past.length} aria-label="Deshacer"><Undo2 /></button>
          <button className="icon" onClick={redo} disabled={!future.length} aria-label="Rehacer"><Redo2 /></button>
          <button
            className={`icon ${bypass ? 'on' : ''}`}
            onPointerDown={() => setBypass(true)} onPointerUp={() => setBypass(false)} onPointerLeave={() => setBypass(false)}
            aria-label="Mantén para ver el original"
          ><Eye /></button>
            <button className={`icon ${grid ? 'on' : ''}`} onClick={() => setGrid(!grid)} aria-label="Cuadrícula"><Grid3x3 /></button>
          <button
            className={`icon ${full ? 'on' : ''}`}
            onClick={() => { setFull(!full); setPanelHidden(false); }}
            aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >{full ? <Minimize2 /> : <Maximize2 />}</button>
        </div>
        <button className="icon" onClick={saveProject} aria-label="Guardar"><Save /></button>
        <button className="icon accent" onClick={() => runExport('gallery')} aria-label="Exportar a galería"><Download /></button>
        <button className="icon" onClick={() => setMenu(!menu)} aria-label="Más"><MoreVertical /></button>
        {menu && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => runExport('gallery')}><Download size={16} /> Exportar a la galería (JPG máxima calidad)</button>
            <button onClick={() => runExport('gallery', 2048)}><Download size={16} /> Exportar para redes (2048 px)</button>
            <button onClick={() => runExport('share')}><Share2 size={16} /> Compartir…</button>
            <button onClick={() => { setMenu(false); saveProject(); }}><Save size={16} /> Guardar en "Mis fotos"</button>
            <button onClick={runBatch}><Images size={16} /> Aplicar este estilo a más fotos…</button>
            <button onClick={copyAdjustments}><Copy size={16} /> Copiar ajustes</button>
            <button onClick={pasteAdjustments}><ClipboardPaste size={16} /> Pegar ajustes</button>
            <button onClick={resetAll}><RotateCcw size={16} /> Restablecer todo</button>
          </div>
        )}
      </header>

      <div
        ref={stageRef}
        className={`stage ${tab === 'recorte' ? 'cropping' : ''}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={() => setMenu(false)}
      >
        {!photo && <div className="loading"><Loader2 className="spin" /> Abriendo foto…</div>}
        <div className="canvas-wrap" style={fit}>
          <canvas ref={canvasRef} style={fit} />
          {showGrid && photo && <div className="grid-overlay"><i /><i /><i /><i /></div>}
          {tab === 'filtros' && photo && edit.local[localSel] && (() => {
            const f = edit.local[localSel];
            const r = resolveCrop(edit.crop, srcW, srcH);
            const cs = Math.cos(-r.angle), sn = Math.sin(-r.angle);
            const px = f.cx * srcW - r.cx, py = f.cy * srcH - r.cy;
            const qx = px * cs - py * sn, qy = px * sn + py * cs;
            const cxp = (qx / r.w + 0.5) * 100, cyp = (qy / r.h + 0.5) * 100;
            const rxp = (f.size * srcW / r.w) * 100, ryp = (f.size * srcW / r.h) * 100;
            return (
              <svg className="local-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                {f.type === 'radial'
                  ? <ellipse cx={cxp} cy={cyp} rx={rxp} ry={ryp} />
                  : <line
                      x1={cxp - Math.cos((f.angle + 90) * Math.PI / 180) * 90}
                      y1={cyp - Math.sin((f.angle + 90) * Math.PI / 180) * 90}
                      x2={cxp + Math.cos((f.angle + 90) * Math.PI / 180) * 90}
                      y2={cyp + Math.sin((f.angle + 90) * Math.PI / 180) * 90}
                    />}
                <circle cx={cxp} cy={cyp} r="1.4" className="local-dot" />
              </svg>
            );
          })()}
          {tab === 'quitar' && photo && edit.erase.length > 0 && (
            <svg className="erase-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              {edit.erase.map((e, i) => {
                const r = resolveCrop(edit.crop, srcW, srcH);
                const cs = Math.cos(-r.angle), sn = Math.sin(-r.angle);
                const px = e.x * srcW - r.cx, py = e.y * srcH - r.cy;
                const qx = px * cs - py * sn, qy = px * sn + py * cs;
                return (
                  <ellipse
                    key={i}
                    cx={(qx / r.w + 0.5) * 100}
                    cy={(qy / r.h + 0.5) * 100}
                    rx={(e.r * srcW / r.w) * 100}
                    ry={(e.r * srcW / r.h) * 100}
                  />
                );
              })}
            </svg>
          )}
        </div>
        {bypass && <div className="badge">Original</div>}
      </div>

      {ex && (ex.iso || ex.exposureTime) && (
        <div className="exif-strip">
          {ex.iso && <button onClick={() => showLearn({ ...EXIF_LESSONS.iso, value: `ISO ${ex.iso}` })}>ISO {ex.iso}</button>}
          {ex.exposureTime && <button onClick={() => showLearn({ ...EXIF_LESSONS.shutter, value: formatShutter(ex.exposureTime) })}>{formatShutter(ex.exposureTime)}</button>}
          {ex.fNumber && <button onClick={() => showLearn({ ...EXIF_LESSONS.aperture, value: `f/${ex.fNumber!.toFixed(1)}` })}>f/{ex.fNumber.toFixed(1)}</button>}
          {ex.focal35 && <button onClick={() => showLearn({ ...EXIF_LESSONS.focal, value: `${ex.focal35} mm` })}>{ex.focal35} mm</button>}
          {photo && <span>{photo.fullW}×{photo.fullH}</span>}
        </div>
      )}

      <LearnBubble info={learn} onClose={() => setLearn(null)} />

      {!(full && panelHidden) && <section className="controls">{panel()}</section>}

      <nav className="tabs" ref={tabsRef}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => {
              // En pantalla completa, volver a tocar la pestaña abierta esconde el panel
              if (full && tab === t.id) { setPanelHidden((h) => !h); return; }
              setTab(t.id); setPaint('off'); setPicking(false); setPanelHidden(false);
            }}
          >
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {busy && <div className="busy"><Loader2 className="spin" size={32} /><p>{busy}</p></div>}
      {batch && (
        <div className="busy">
          <Loader2 className="spin" size={32} />
          <p>Revelando {batch.done + 1} de {batch.total}…</p>
          <p className="muted small">Se guardan en la galería conforme van saliendo.</p>
          <button className="btn small" onClick={() => { cancelBatch.current = true; }}>Detener</button>
        </div>
      )}
    </div>
  );
}

function Histogram({ data }: { data: number[][] }) {
  const path = (ch: number[]) =>
    'M0,40 ' + ch.map((v, i) => `L${(i / 63) * 200},${40 - v * 38}`).join(' ') + ' L200,40 Z';
  return (
    <div className="histogram" title="Histograma: a la izquierda las sombras, a la derecha las luces">
      <svg viewBox="0 0 200 40" preserveAspectRatio="none">
        <path d={path(data[0])} fill="rgba(255,70,70,.45)" />
        <path d={path(data[1])} fill="rgba(70,255,120,.4)" />
        <path d={path(data[2])} fill="rgba(80,140,255,.45)" />
      </svg>
      <div className="histogram-labels"><span>sombras</span><span>medios</span><span>luces</span></div>
    </div>
  );
}

function GradeWheels({ adj }: { adj: Adjustments }) {
  const wheel = (label: string, hue: number, sat: number) => {
    const r = 22 * (sat / 100), a = (hue * Math.PI) / 180;
    return (
      <div className="wheel">
        <div className="wheel-disc">
          <span className="wheel-dot" style={{ transform: `translate(${Math.cos(a) * r}px, ${-Math.sin(a) * r}px)` }} />
        </div>
        <small>{label}</small>
      </div>
    );
  };
  return (
    <div className="wheels">
      {wheel('Sombras', adj.gradeShadowHue, adj.gradeShadowSat)}
      {wheel('Medios', adj.gradeMidHue, adj.gradeMidSat)}
      {wheel('Luces', adj.gradeHighHue, adj.gradeHighSat)}
    </div>
  );
}

function ReviewView({ review, presets, onPreset, onCrop, onAdjust }: {
  review: TwinsReview;
  presets: Preset[];
  onPreset: (id: string) => void;
  onCrop: () => void;
  onAdjust: () => void;
}) {
  const p = presets.find((x) => x.id === review.estilo.id);
  const nAdj = Object.keys(review.ajustes).length;
  const score = (label: string, v: number) => (
    <div className="score"><b>{Math.round(v)}</b><small>{label}</small><i style={{ width: `${v * 10}%` }} /></div>
  );
  return (
    <div className="review">
      {review.escena && <p className="muted">📷 {review.escena}</p>}
      <div className="scores">
        {score('Encuadre', review.puntuacion.composicion)}
        {score('Luz', review.puntuacion.luz)}
        {score('Color', review.puntuacion.color)}
      </div>
      <TwinBubble id="tsuki">
        <p>{review.tsuki.resumen}</p>
        <ul>{review.tsuki.consejos.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {review.tsuki.proxima_vez && <p className="next">📸 Próxima vez: {review.tsuki.proxima_vez}</p>}
        {review.recorte && (
          <>
            <p className="small">✂️ {review.recorte.porque}</p>
            <button className="btn small" onClick={onCrop}><Crop size={14} /> Aplicar recorte de Tsuki ({review.recorte.aspecto})</button>
          </>
        )}
      </TwinBubble>
      <TwinBubble id="yami">
        <p>{review.yami.resumen}</p>
        <ul>{review.yami.consejos.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {review.yami.proxima_vez && <p className="next">💡 Próxima vez: {review.yami.proxima_vez}</p>}
        {p && (
          <>
            <p className="small">🎨 Estilo recomendado: <b>{p.name}</b>. {review.estilo.porque}</p>
            <button className="btn small" onClick={() => onPreset(p.id)}><Film size={14} /> Usar {p.name}</button>
          </>
        )}
        {nAdj > 0 && <button className="btn small" onClick={onAdjust}><Wand2 size={14} /> Aplicar los {nAdj} ajustes de Yami</button>}
      </TwinBubble>
      {review.leccion && <div className="lesson"><b>📚 Lección del día</b><p>{review.leccion}</p></div>}
    </div>
  );
}

