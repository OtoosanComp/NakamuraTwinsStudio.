import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Images, Settings as Gear, Trash2, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { TWINS } from '../ai/twins';
import { projects, AI_MODELS, KEY_URL, PROVIDER_NAMES, hasAiKey, type Project, type Settings } from '../lib/storage';
import { TwinAvatar, TwinBubble } from './Twins';
import { PRESETS, SHOOT_BASICS, type Preset } from '../engine/presets';

const GREETINGS = [
  ['La regla de tercios es pura división: parte la foto en 9 y pon lo importante en las líneas.', '¡Busca color! Un traje claro contra un fondo oscuro siempre gana.'],
  ['Si el horizonte se inclina más de 2°, se nota. Usa el nivel de la Cámara Studio.', 'La pose manda: manos relajadas y peso en una pierna se ve natural.'],
  ['Sin tripié no bajes de 1/60 s, o la foto sale movida.', 'Acércate más. Si tu foto no es buena, no estabas lo bastante cerca.'],
  ['Composición con ritmo: repetir una forma 3 veces guía la mirada como un compás.', 'Los colores opuestos (azul y naranja) siempre se ven de cine.'],
];

export function Home({ onGallery, onGuide, onLibrary, onSettings, onOpenProject, hasKey }: {
  onGallery: () => void;
  onGuide: () => void;
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
        <TwinBubble id="tsuki"><p>{g[0]}</p></TwinBubble>
        <TwinBubble id="yami"><p>{g[1]}</p></TwinBubble>
      </div>

      {!hasKey && (
        <button className="notice" onClick={onSettings}>
          ✨ Conecta tu API key (Gemini o Groq) para que {TWINS.tsuki.name} y {TWINS.yami.name} vean tus fotos y te den consejos.
        </button>
      )}

      <div className="actions">
        <button className="action primary" onClick={onGallery}>
          <Images size={28} />
          <b>Abrir de la galería</b>
          <small>Tus fotos del Redmi. Dispara en modo Pro con la cámara del teléfono y ábrelas aquí.</small>
        </button>
        <button className="action" onClick={onGuide}>
          <BookOpen size={28} />
          <b>Cómo tomar cada estilo</b>
          <small>Los parámetros de modo Pro para que la foto ya salga lista</small>
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
  const groq = settings.provider === 'groq';
  const key = groq ? settings.groqKey : settings.geminiKey;
  const model = groq ? settings.groqModel : settings.geminiModel;
  const custom = !AI_MODELS[settings.provider].includes(model);
  const setKey = (v: string) => onChange({ ...settings, [groq ? 'groqKey' : 'geminiKey']: v.trim() });
  const setModel = (v: string) => onChange({ ...settings, [groq ? 'groqModel' : 'geminiModel']: v.trim() });

  const test = async () => {
    setTesting('Probando…');
    try {
      const r = groq
        ? await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
        : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
            headers: { 'x-goog-api-key': key },
          });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setTesting(`❌ ${b?.error?.message ?? r.statusText}`); return; }
      const ids: string[] = groq ? (b.data ?? []).map((m: { id: string }) => m.id) : [];
      if (groq && ids.length && !ids.includes(model)) {
        setTesting(`⚠️ La key sirve, pero "${model}" no está en tu cuenta. Modelos con imagen: ${ids.filter((i) => /vision|qwen|llava|scout|maverick|muse/i.test(i)).join(', ') || ids.slice(0, 6).join(', ')}`);
        return;
      }
      setTesting(`✅ Conectado: ${b.displayName ?? model}`);
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
        <div className="twins-pair"><TwinAvatar id="tsuki" size={44} /><TwinAvatar id="yami" size={44} /></div>
        <h3>Inteligencia artificial</h3>
        <p className="muted small">
          Tu API key se guarda solo en este teléfono y se usa para mandar una copia pequeña de la foto cuando pides
          consejos. Puedes tener las dos guardadas y cambiar de proveedor cuando se te acabe la cuota de una.
        </p>
        <div className="chips">
          {(['gemini', 'groq'] as const).map((p) => (
            <button
              key={p}
              className={`chip ${settings.provider === p ? 'active' : ''}`}
              onClick={() => onChange({ ...settings, provider: p })}
            >
              {PROVIDER_NAMES[p]}{(p === 'groq' ? settings.groqKey : settings.geminiKey) ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <a className="link small" href={KEY_URL[settings.provider]} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Consigue tu key gratis en {KEY_URL[settings.provider].replace('https://', '')}
        </a>
        <label className="field">
          <span>API key de {PROVIDER_NAMES[settings.provider]}</span>
          <div className="row">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              placeholder={groq ? 'gsk_…' : 'AIza…'}
              autoComplete="off"
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="icon" onClick={() => setShow(!show)} aria-label="Mostrar">{show ? <EyeOff /> : <Eye />}</button>
          </div>
        </label>
        <label className="field">
          <span>Modelo</span>
          <select value={custom ? '__custom' : model} onChange={(e) => setModel(e.target.value === '__custom' ? '' : e.target.value)}>
            {AI_MODELS[settings.provider].map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__custom">Otro…</option>
          </select>
          {custom && <input value={model} placeholder="nombre-del-modelo" onChange={(e) => setModel(e.target.value)} />}
        </label>
        <button className="btn" onClick={test} disabled={!key || !model}>Probar conexión</button>
        {testing && <p className="small">{testing}</p>}
        {!hasAiKey(settings) && <p className="muted small">Sin key, las gemelas no pueden ver tus fotos; lo demás funciona igual.</p>}
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

export function StyleGuide({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState<Preset>(PRESETS[0]);
  const sh = sel.shoot;
  const rows: [string, string | undefined][] = sh
    ? [
        ['Luz que buscar', sh.luz],
        ['RAW', sh.raw],
        ['ISO', sh.iso],
        ['Velocidad (S)', sh.velocidad],
        ['Balance (WB)', sh.wb],
        ['Exposición (EV)', sh.ev],
        ['Enfoque (F)', sh.enfoque],
        ['Encuadre', sh.encuadre],
      ]
    : [];
  return (
    <div className="screen">
      <header className="topbar plain">
        <button className="icon" onClick={onBack} aria-label="Regresar"><ArrowLeft /></button>
        <h2>Cómo tomar cada estilo</h2>
        <span />
      </header>
      <p className="muted small">
        Pon la cámara del teléfono en <b>Pro</b> y copia estos valores. Si la foto ya sale cerca del estilo,
        la edición solo la remata y no tienes que forzar nada.
      </p>

      <div className="preset-strip">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset-card ${sel.id === p.id ? 'active' : ''}`} onClick={() => setSel(p)}>
            <div className="preset-swatch" style={{ background: `linear-gradient(135deg, ${p.palette.join(',')})` }} />
            <span>{p.name}</span>
            <small>{p.subtitle}</small>
          </button>
        ))}
      </div>

      <section className="card">
        <h3>{sel.name}</h3>
        <table className="shoot">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
        {sh && <p className="lesson-inline">💡 {sh.truco}</p>}
      </section>

      <section className="card">
        <h3>Vale para todas</h3>
        <ul className="basics">
          {SHOOT_BASICS.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </section>
    </div>
  );
}
