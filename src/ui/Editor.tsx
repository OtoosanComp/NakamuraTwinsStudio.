import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Undo2, Redo2, Eye, Save, Download, Share2, MoreVertical, Sparkles, Sun, Palette,
  Droplets, SlidersHorizontal, Crop, Film, Wand2, RotateCcw, Copy, ClipboardPaste, Grid3x3, Loader2, Trash2,
} from 'lucide-react';
import {
  ASPECTS, COLOR, EFFECTS, GRADING, HSL_COLORS, LIGHT, ALL_DEFS, defaultCrop, hslDefs, neutral,
  resolveCrop, type CropState, type PartialAdj, type SliderDef, type Adjustments,
} from '../engine/adjustments';
import { analyzeImage, type Analysis } from '../engine/analyze';
import {
  addToUser, baseValue, composeAdjustments, initialEdit, resetKey, setFinalValue, type EditState,
} from '../engine/editState';
import { PRESETS, loadCustomPresets, saveCustomPresets, type Preset } from '../engine/presets';
import { Renderer } from '../engine/renderer';
import {
  PREVIEW_MAX, exportJpeg, formatShutter, loadPhoto, outputSize, smallJpegBase64, type LoadedPhoto,
} from '../lib/image';
import { saveToGallery, shareImage } from '../lib/platform';
import { projects, uid, type Settings } from '../lib/storage';
import { reviewPhoto, type TwinsReview } from '../ai/gemini';
import { Slider } from './Slider';
import { EXIF_LESSONS, LearnBubble, learnFromSlider, type LearnInfo } from './Learn';
import { TwinAvatar, TwinBubble } from './Twins';
import { useFit } from './useFit';

export interface EditorSource {
  blob: Blob;
  edit?: EditState;
  projectId?: string;
  presetId?: string | null;
}

type Tab = 'estilos' | 'luz' | 'color' | 'mezcla' | 'gradacion' | 'efectos' | 'recorte' | 'gemelas';

const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: 'estilos', label: 'Estilos', icon: Film },
  { id: 'gemelas', label: 'Gemelas', icon: Sparkles },
  { id: 'luz', label: 'Luz', icon: Sun },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'mezcla', label: 'Mezcla', icon: Droplets },
  { id: 'gradacion', label: 'Gradación', icon: SlidersHorizontal },
  { id: 'efectos', label: 'Efectos', icon: Wand2 },
  { id: 'recorte', label: 'Recorte', icon: Crop },
];

const CLIP_KEY = 'nts.clipboard';

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
  const dragStart = useRef<EditState | null>(null);
  const learnTimer = useRef<number>();

  const allPresets = useMemo(() => [...PRESETS, ...custom], [custom]);
  const preset = allPresets.find((p) => p.id === edit.presetId);
  const adj = useMemo(() => composeAdjustments(edit, preset), [edit, preset]);
  const stageRef = useRef<HTMLDivElement>(null);
  const outAspect = useMemo(() => {
    if (!photo) return 0;
    const r = resolveCrop(edit.crop, photo.previewW, photo.previewH);
    return r.w / r.h;
  }, [photo, edit.crop]);
  const fit = useFit(stageRef, outAspect, 8);

  // ---------- Cargar la foto ----------
  useEffect(() => {
    let alive = true;
    loadPhoto(source.blob)
      .then((p) => {
        if (!alive) return;
        const a = analyzeImage(p.preview, p.previewW, p.previewH);
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
      const r = new Renderer(canvasRef.current);
      r.setSource(photo.preview, photo.previewW, photo.previewH);
      rendererRef.current = r;
    } catch (e) {
      setLoadError(String((e as Error).message));
    }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null; };
  }, [photo]);

  // ---------- Dibujar ----------
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !photo) return;
    const id = requestAnimationFrame(() => {
      const { rect, w, h } = outputSize(edit.crop, photo.previewW, photo.previewH, PREVIEW_MAX);
      r.render(bypass ? neutral() : adj, rect, w, h, bypass);
    });
    return () => cancelAnimationFrame(id);
  }, [adj, edit.crop, bypass, photo]);

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
    learnTimer.current = window.setTimeout(() => setLearn(null), 4500);
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
        if (dragStart.current && dragStart.current !== edit) commit(edit, dragStart.current);
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

  // ---------- Recorte: arrastrar para mover ----------
  const drag = useRef<{ x: number; y: number; crop: CropState } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (tab !== 'recorte' || !photo) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop: edit.crop };
    dragStart.current = edit;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !photo || !canvasRef.current) return;
    const rect = resolveCrop(d.crop, photo.previewW, photo.previewH);
    const scale = rect.w / canvasRef.current.getBoundingClientRect().width;
    const dx = (e.clientX - d.x) * scale, dy = (e.clientY - d.y) * scale;
    const cs = Math.cos(rect.angle), sn = Math.sin(rect.angle);
    const rx = dx * cs - dy * sn, ry = dx * sn + dy * cs;
    // Usamos la posición real (ya limitada) como punto de partida para que se sienta natural
    const cx = rect.cx / photo.previewW - rx / photo.previewW;
    const cy = rect.cy / photo.previewH - ry / photo.previewH;
    setEdit((st) => ({ ...st, crop: { ...st.crop, cx: Math.min(1, Math.max(0, cx)), cy: Math.min(1, Math.max(0, cy)) } }));
  };
  const onPointerUp = () => {
    if (drag.current && dragStart.current) commit(edit, dragStart.current);
    drag.current = null;
    dragStart.current = null;
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

  const runExport = async (mode: 'gallery' | 'share') => {
    if (!photo) return;
    setMenu(false);
    setBusy('Revelando en alta calidad…');
    try {
      const jpeg = await exportJpeg(photo, adj, edit.crop);
      if (mode === 'gallery') {
        const where = await saveToGallery(jpeg);
        toast(`¡Listo! Foto guardada en ${where}`);
      } else {
        await shareImage(jpeg, preset ? `Editada con estilo ${preset.name} en Nakamura Twins Studio` : undefined);
      }
    } catch (e) {
      toast(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
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
    if (!settings.geminiKey) { onOpenSettings(); return; }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const r = await reviewPhoto({
        apiKey: settings.geminiKey, model: settings.geminiModel,
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
                    onEnd={() => { if (dragStart.current) commit(edit, dragStart.current); dragStart.current = null; }}
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
            {hist && <Histogram data={hist} />}
            {LIGHT.map((d) => sliderFor(d))}
          </div>
        );
      case 'color':
        return <div className="panel">{COLOR.map((d) => sliderFor(d))}</div>;
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
        return <div className="panel">{EFFECTS.map((d) => sliderFor(d))}</div>;
      case 'recorte':
        return (
          <div className="panel">
            <p className="muted small">Arrastra la foto para encuadrar. La cuadrícula de tercios te ayuda: pon lo importante en las líneas o cruces.</p>
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
              def={{ key: 'contrast', label: 'Enderezar', min: -20, max: 20, step: 0.1, what: 'Gira la foto para que el horizonte o los edificios queden rectos.', up: 'Gira a la derecha (sentido del reloj).', down: 'Gira a la izquierda.', tip: 'Un horizonte chueco es el error #1 de encuadre. Fíjate en el mar, el piso o las líneas de los edificios.' }}
              value={edit.crop.angle}
              onStart={() => { dragStart.current = edit; }}
              onChange={(v) => setEdit((s) => ({ ...s, crop: { ...s.crop, angle: v } }))}
              onEnd={() => { if (dragStart.current) commit(edit, dragStart.current); dragStart.current = null; }}
              format={(v) => `${v.toFixed(1)}°`}
              onReset={() => apply((s) => ({ ...s, crop: { ...s.crop, angle: 0 } }))}
              onLearn={(d, v) => showLearn({ ...learnFromSlider(d, v), value: `${v.toFixed(1)}°` })}
            />
            <Slider
              def={{ key: 'contrast', label: 'Acercar', min: 1, max: 3, step: 0.01, what: 'Recorta más cerca del sujeto.', up: 'Más cerca: quitas distracciones.', down: 'Más lejos.', tip: 'Si algo no suma a la historia de la foto, recórtalo.' }}
              value={edit.crop.zoom}
              onStart={() => { dragStart.current = edit; }}
              onChange={(v) => setEdit((s) => ({ ...s, crop: { ...s.crop, zoom: v } }))}
              onEnd={() => { if (dragStart.current) commit(edit, dragStart.current); dragStart.current = null; }}
              format={(v) => `${v.toFixed(2)}×`}
              onReset={() => apply((s) => ({ ...s, crop: { ...s.crop, zoom: 1 } }))}
              onLearn={(d, v) => showLearn({ ...learnFromSlider(d, v), value: `${v.toFixed(2)}×`, effect: undefined })}
            />
            <button className="btn ghost small" onClick={() => apply((s) => ({ ...s, crop: defaultCrop() }))}><RotateCcw size={14} /> Quitar recorte</button>
          </div>
        );
      case 'gemelas':
        return (
          <div className="panel">
            {!review && !reviewLoading && (
              <div className="twins-intro">
                <div className="twins-pair"><TwinAvatar id="aiko" size={56} /><TwinAvatar id="mei" size={56} /></div>
                <p>Las gemelas ven tu foto y te dicen cómo mejorar el <b>encuadre</b>, la <b>luz</b> y el <b>color</b>, y qué estilo le queda mejor.</p>
                {!settings.geminiKey && <p className="muted small">Necesitas poner tu API key de Gemini en Ajustes.</p>}
              </div>
            )}
            {reviewError && <p className="error">{reviewError}</p>}
            <button className="btn primary wide" onClick={askTwins} disabled={reviewLoading}>
              {reviewLoading ? <><Loader2 className="spin" size={18} /> Las gemelas están viendo tu foto…</> : <><Sparkles size={18} /> {review ? 'Preguntar otra vez' : 'Pedir opinión a las gemelas'}</>}
            </button>
            {review && <ReviewView review={review} presets={allPresets}
              onPreset={(id) => { const p = allPresets.find((x) => x.id === id); if (p) choosePreset(p); }}
              onCrop={applyReviewCrop}
              onAdjust={() => { apply((s) => addToUser(s, review.ajustes)); toast('Apliqué los ajustes que sugirió Mei. Mira qué cambió en cada pestaña.'); }}
            />}
          </div>
        );
    }
  };

  const ex = photo?.exif;
  const showGrid = tab === 'recorte' || grid;

  return (
    <div className="editor">
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
        </div>
        <button className="icon" onClick={saveProject} aria-label="Guardar"><Save /></button>
        <button className="icon accent" onClick={() => runExport('gallery')} aria-label="Exportar a galería"><Download /></button>
        <button className="icon" onClick={() => setMenu(!menu)} aria-label="Más"><MoreVertical /></button>
        {menu && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => runExport('gallery')}><Download size={16} /> Exportar a la galería (JPG máxima calidad)</button>
            <button onClick={() => runExport('share')}><Share2 size={16} /> Compartir…</button>
            <button onClick={() => { setMenu(false); saveProject(); }}><Save size={16} /> Guardar en "Mis fotos"</button>
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

      <section className="controls">{panel()}</section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {busy && <div className="busy"><Loader2 className="spin" size={32} /><p>{busy}</p></div>}
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
      <TwinBubble id="aiko">
        <p>{review.aiko.resumen}</p>
        <ul>{review.aiko.consejos.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {review.aiko.proxima_vez && <p className="next">📸 Próxima vez: {review.aiko.proxima_vez}</p>}
        {review.recorte && (
          <>
            <p className="small">✂️ {review.recorte.porque}</p>
            <button className="btn small" onClick={onCrop}><Crop size={14} /> Aplicar recorte de Aiko ({review.recorte.aspecto})</button>
          </>
        )}
      </TwinBubble>
      <TwinBubble id="mei">
        <p>{review.mei.resumen}</p>
        <ul>{review.mei.consejos.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {review.mei.proxima_vez && <p className="next">💡 Próxima vez: {review.mei.proxima_vez}</p>}
        {p && (
          <>
            <p className="small">🎨 Estilo recomendado: <b>{p.name}</b>. {review.estilo.porque}</p>
            <button className="btn small" onClick={() => onPreset(p.id)}><Film size={14} /> Usar {p.name}</button>
          </>
        )}
        {nAdj > 0 && <button className="btn small" onClick={onAdjust}><Wand2 size={14} /> Aplicar los {nAdj} ajustes de Mei</button>}
      </TwinBubble>
      {review.leccion && <div className="lesson"><b>📚 Lección del día</b><p>{review.leccion}</p></div>}
    </div>
  );
}

