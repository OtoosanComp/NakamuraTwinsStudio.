import { useEffect, useState } from 'react';
import { ArrowLeft, Aperture, Camera, Images, Settings as Gear, Trash2, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { TWINS } from '../ai/twins';
import { projects, GEMINI_MODELS, type Project, type Settings } from '../lib/storage';
import { TwinAvatar, TwinBubble } from './Twins';

const GREETINGS = [
  ['¿Qué vamos a fotografiar hoy? ¡Busca líneas que lleven la mirada!', 'Recuerda: la mejor luz es una hora antes del atardecer.'],
  ['¡Ojo con el horizonte! Que quede derechito.', 'Si la foto sale muy clara, baja las altas luces antes que la exposición.'],
  ['Acércate más. Si tu foto no es buena, es que no estabas lo bastante cerca.', 'De noche, sube un poco el ISO pero no te pases de 1600.'],
  ['Prueba agacharte: las fotos desde abajo se ven más épicas.', 'Los colores opuestos (azul y naranja) siempre se ven de cine.'],
];

export function Home({ onGallery, onPhoneCamera, onStudioCamera, onLibrary, onSettings, onOpenProject, hasKey }: {
  onGallery: () => void;
  onPhoneCamera: () => void;
  onStudioCamera: () => void;
  onLibrary: () => void;
  onSettings: () => void;
  onOpenProject: (p: Project) => void;
  hasKey: boolean;
}) {
  const [recent, setRecent] = useState<Project[]>([]);
  const [g] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  useEffect(() => { projects.list().then((l) => setRecent(l.slice(0, 6))).catch(() => {}); }, []);

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <h1>Nakamura <span>Twins</span> Studio</h1>
          <p className="muted small">Edita como profesional y aprende fotografía</p>
        </div>
        <button className="icon" onClick={onSettings} aria-label="Ajustes"><Gear /></button>
      </header>

      <div className="home-twins">
        <TwinBubble id="aiko"><p>{g[0]}</p></TwinBubble>
        <TwinBubble id="mei"><p>{g[1]}</p></TwinBubble>
      </div>

      {!hasKey && (
        <button className="notice" onClick={onSettings}>
          ✨ Conecta tu API key de Gemini para que {TWINS.aiko.name} y {TWINS.mei.name} vean tus fotos y te den consejos.
        </button>
      )}

      <div className="actions">
        <button className="action primary" onClick={onGallery}>
          <Images size={28} />
          <b>Abrir de la galería</b>
          <small>Tus fotos del Redmi, incluidas las de modo Pro</small>
        </button>
        <button className="action" onClick={onStudioCamera}>
          <Aperture size={28} />
          <b>Cámara Studio</b>
          <small>Ve el estilo en vivo, con cuadrícula, nivel y consejos</small>
        </button>
        <button className="action" onClick={onPhoneCamera}>
          <Camera size={28} />
          <b>Cámara del teléfono</b>
          <small>Máxima calidad y modo Pro; al regresar se edita sola</small>
        </button>
      </div>

      {recent.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Mis fotos</h2>
            <button className="link" onClick={onLibrary}>Ver todas</button>
          </div>
          <div className="thumbs">
            {recent.map((p) => (
              <button key={p.id} className="thumb" onClick={() => onOpenProject(p)}>
                <img src={p.thumb} alt="" />
                {p.presetName && <span>{p.presetName}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function Library({ onBack, onOpen }: { onBack: () => void; onOpen: (p: Project) => void }) {
  const [list, setList] = useState<Project[] | null>(null);
  const load = () => projects.list().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return (
    <div className="screen">
      <header className="topbar plain">
        <button className="icon" onClick={onBack} aria-label="Regresar"><ArrowLeft /></button>
        <h2>Mis fotos</h2>
        <span />
      </header>
      {!list && <div className="loading"><Loader2 className="spin" /></div>}
      {list?.length === 0 && <p className="muted center">Aún no guardas fotos. En el editor toca 💾 para guardar una y seguir editándola después.</p>}
      <div className="thumbs grid">
        {list?.map((p) => (
          <div key={p.id} className="thumb">
            <button onClick={() => onOpen(p)}><img src={p.thumb} alt="" /></button>
            <div className="thumb-meta">
              <small>{new Date(p.updated).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}{p.presetName ? ` · ${p.presetName}` : ''}</small>
              <button className="icon tiny" aria-label="Borrar" onClick={async () => {
                if (confirm('¿Borrar esta foto de "Mis fotos"? (No se borra de tu galería)')) { await projects.remove(p.id); load(); }
              }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, onChange, onBack }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
}) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const custom = !GEMINI_MODELS.includes(settings.geminiModel);

  const test = async () => {
    setTesting('Probando…');
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}`, {
        headers: { 'x-goog-api-key': settings.geminiKey },
      });
      const b = await r.json().catch(() => ({}));
      setTesting(r.ok ? `✅ Conectado: ${b.displayName ?? settings.geminiModel}` : `❌ ${b?.error?.message ?? r.statusText}`);
    } catch {
      setTesting('❌ Sin conexión a internet.');
    }
  };

  return (
    <div className="screen settings">
      <header className="topbar plain">
        <button className="icon" onClick={onBack} aria-label="Regresar"><ArrowLeft /></button>
        <h2>Ajustes</h2>
        <span />
      </header>

      <section className="card">
        <div className="twins-pair"><TwinAvatar id="aiko" size={44} /><TwinAvatar id="mei" size={44} /></div>
        <h3>Inteligencia artificial (Gemini)</h3>
        <p className="muted small">
          Tu API key se guarda solo en este teléfono y se usa para mandar a Gemini una copia pequeña de la foto cuando
          pides consejos. Consíguela gratis en Google AI Studio.
        </p>
        <a className="link small" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> aistudio.google.com/apikey
        </a>
        <label className="field">
          <span>API key</span>
          <div className="row">
            <input
              type={show ? 'text' : 'password'}
              value={settings.geminiKey}
              placeholder="AIza…"
              autoComplete="off"
              onChange={(e) => onChange({ ...settings, geminiKey: e.target.value.trim() })}
            />
            <button className="icon" onClick={() => setShow(!show)} aria-label="Mostrar">{show ? <EyeOff /> : <Eye />}</button>
          </div>
        </label>
        <label className="field">
          <span>Modelo</span>
          <select
            value={custom ? '__custom' : settings.geminiModel}
            onChange={(e) => onChange({ ...settings, geminiModel: e.target.value === '__custom' ? '' : e.target.value })}
          >
            {GEMINI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__custom">Otro…</option>
          </select>
          {custom && (
            <input value={settings.geminiModel} placeholder="nombre-del-modelo" onChange={(e) => onChange({ ...settings, geminiModel: e.target.value.trim() })} />
          )}
        </label>
        <button className="btn" onClick={test} disabled={!settings.geminiKey || !settings.geminiModel}>Probar conexión</button>
        {testing && <p className="small">{testing}</p>}
      </section>

      <section className="card">
        <h3>Aprendizaje</h3>
        <label className="switch">
          <input type="checkbox" checked={settings.showTips} onChange={(e) => onChange({ ...settings, showTips: e.target.checked })} />
          <span /> Explicar cada control al moverlo
        </label>
      </section>

      <p className="muted small center">Nakamura Twins Studio · v1.0</p>
    </div>
  );
}
