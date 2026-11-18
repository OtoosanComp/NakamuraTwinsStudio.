import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Grid3x3, Loader2, Sparkles, SwitchCamera, Smartphone } from 'lucide-react';
import { resolveCrop, defaultCrop } from '../engine/adjustments';
import { analyzeImage } from '../engine/analyze';
import { composeAdjustments, initialEdit } from '../engine/editState';
import { PRESETS, loadCustomPresets, type Preset } from '../engine/presets';
import { Renderer } from '../engine/renderer';
import { liveTip, type LiveTip } from '../ai/gemini';
import type { Settings } from '../lib/storage';
import { TwinBubble } from './Twins';
import { useFit } from './useFit';

/**
 * Cámara dentro de la app: ves el estilo EN VIVO, con cuadrícula de tercios,
 * nivel de horizonte y consejos de las gemelas antes de disparar.
 */
export function StudioCamera({ settings, onBack, onCapture, onPhoneCamera, toast }: {
  settings: Settings;
  onBack: () => void;
  onCapture: (blob: Blob, presetId: string | null) => void;
  onPhoneCamera: () => void;
  toast: (m: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>('nolan');
  const [grid, setGrid] = useState(true);
  const [tilt, setTilt] = useState<number | null>(null);
  const [tip, setTip] = useState<LiveTip | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [flash, setFlash] = useState(false);
  const [vAspect, setVAspect] = useState(0);
  const viewRef = useRef<HTMLDivElement>(null);
  const fit = useFit(viewRef, vAspect);
  const presets = useMemo(() => [...PRESETS, ...loadCustomPresets()], []);
  const preset: Preset | undefined = presets.find((p) => p.id === presetId);
  const autoRef = useRef(initialEdit().auto);
  const presetRef = useRef(preset);
  presetRef.current = preset;

  // Abrir la cámara
  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    setReady(false);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
      .then(async (s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const v = videoRef.current!;
        v.srcObject = s;
        await v.play();
        setVAspect(v.videoWidth / v.videoHeight);
        setReady(true);
      })
      .catch(() => setError('No pude abrir la cámara. Revisa que la app tenga permiso de cámara en los ajustes del teléfono.'));
    if (!navigator.mediaDevices) setError('Este dispositivo no permite usar la cámara aquí.');
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  // Dibujar el visor con el estilo en vivo
  useEffect(() => {
    if (!ready || !canvasRef.current || !videoRef.current) return;
    let r: Renderer;
    try { r = new Renderer(canvasRef.current); } catch (e) { setError((e as Error).message); return; }
    const v = videoRef.current;
    let raf = 0, frame = 0;
    const loop = () => {
      const w = v.videoWidth, h = v.videoHeight;
      if (w && h) {
        r.setSource(v, w, h);
        const k = Math.min(1, 1280 / Math.max(w, h));
        const st = { ...initialEdit(), auto: autoRef.current, presetId: presetRef.current?.id ?? null };
        const adj = composeAdjustments(st, presetRef.current);
        r.render(adj, resolveCrop(defaultCrop(), w, h), Math.round(w * k), Math.round(h * k));
        // Cada ~1.5 s recalculamos el "Auto Pro" con lo que ve la cámara
        if (frame++ % 90 === 0) autoRef.current = analyzeImage(v, w, h).auto;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); r.dispose(); };
  }, [ready]);

  // Nivel de horizonte con el giroscopio
  useEffect(() => {
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      const landscape = Math.abs(window.orientation as number) === 90 || window.innerWidth > window.innerHeight;
      setTilt(landscape ? e.beta : e.gamma);
    };
    window.addEventListener('deviceorientation', onOri);
    return () => window.removeEventListener('deviceorientation', onOri);
  }, []);

  const grabFrame = (maxSide = 0): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const k = maxSide ? Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight)) : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c;
  };

  const shoot = () => {
    const c = grabFrame();
    if (!c) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    c.toBlob((b) => b && onCapture(b, presetId), 'image/jpeg', 0.96);
  };

  const askTip = async () => {
    if (!settings.geminiKey) { toast('Pon tu API key de Gemini en Ajustes para pedir consejos.'); return; }
    const c = grabFrame(768);
    if (!c) return;
    setTipLoading(true);
    try {
      const t = await liveTip({
        apiKey: settings.geminiKey, model: settings.geminiModel,
        imageBase64: c.toDataURL('image/jpeg', 0.8).split(',')[1], styleName: preset?.name ?? 'natural',
      });
      setTip(t);
      setTimeout(() => setTip(null), 12000);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setTipLoading(false);
    }
  };

  const level = tilt == null ? null : Math.abs(tilt) < 1.5;

  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted className="hidden-video" />
      <div className="camera-view" ref={viewRef}>
        <div className="canvas-wrap" style={fit}>
          <canvas ref={canvasRef} style={fit} />
          {grid && <div className="grid-overlay"><i /><i /><i /><i /></div>}
          {tilt != null && (
            <div className={`level ${level ? 'ok' : ''}`} style={{ transform: `rotate(${-tilt}deg)` }}>
              <span />
            </div>
          )}
        </div>
        {!ready && !error && <div className="loading"><Loader2 className="spin" /> Abriendo cámara…</div>}
        {error && <p className="error center-abs">{error}</p>}
        {flash && <div className="flash" />}
      </div>

      <header className="camera-top">
        <button className="icon" onClick={onBack} aria-label="Regresar"><ArrowLeft /></button>
        <span className="camera-title">Cámara Studio{level === false && tilt != null ? ` · ${tilt.toFixed(0)}°` : level ? ' · nivelada ✓' : ''}</span>
        <button className={`icon ${grid ? 'on' : ''}`} onClick={() => setGrid(!grid)} aria-label="Cuadrícula"><Grid3x3 /></button>
      </header>

      {tip && (
        <div className="camera-tips" onClick={() => setTip(null)}>
          <TwinBubble id="aiko"><p>{tip.aiko}</p></TwinBubble>
          <TwinBubble id="mei"><p>{tip.mei}</p></TwinBubble>
        </div>
      )}

      <div className="camera-bottom">
        <div className="preset-chips">
          <button className={`chip ${!presetId ? 'active' : ''}`} onClick={() => setPresetId(null)}>Natural</button>
          {presets.map((p) => (
            <button key={p.id} className={`chip ${presetId === p.id ? 'active' : ''}`} onClick={() => setPresetId(p.id)}>
              <i style={{ background: `linear-gradient(135deg, ${p.palette.join(',')})` }} />{p.name}
            </button>
          ))}
        </div>
        <div className="shutter-row">
          <button className="icon big" onClick={askTip} disabled={tipLoading || !ready} aria-label="Consejo de las gemelas">
            {tipLoading ? <Loader2 className="spin" /> : <Sparkles />}
          </button>
          <button className="shutter" onClick={shoot} disabled={!ready} aria-label="Tomar foto" />
          <button className="icon big" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} aria-label="Cambiar cámara">
            <SwitchCamera />
          </button>
        </div>
        <button className="link small" onClick={onPhoneCamera}>
          <Smartphone size={14} /> ¿Quieres máxima calidad o modo Pro? Usa la cámara del teléfono
        </button>
      </div>
    </div>
  );
}
