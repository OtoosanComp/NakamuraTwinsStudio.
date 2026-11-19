// Conexión con la IA (Gemini de Google o Groq) para que las gemelas vean tu foto y te aconsejen.
import { ALL_DEFS, type PartialAdj, type AdjKey, DEF_BY_KEY } from '../engine/adjustments';
import type { Preset } from '../engine/presets';
import { formatShutter, type ExifInfo } from '../lib/image';
import type { Settings } from '../lib/storage';
import { TWINS } from './twins';

export interface TwinVoice {
  resumen: string;
  consejos: string[];
  proxima_vez: string;
}

export interface TwinsReview {
  escena: string;
  puntuacion: { composicion: number; luz: number; color: number };
  tsuki: TwinVoice;
  yami: TwinVoice;
  estilo: { id: string; porque: string };
  recorte: { aspecto: string; cx: number; cy: number; zoom: number; angulo: number; porque: string } | null;
  ajustes: PartialAdj;
  leccion: string;
}

export interface LiveTip { tsuki: string; yami: string }

export class AiError extends Error {}

/** Manda el texto + la foto al proveedor elegido y devuelve el JSON ya parseado. */
async function call(s: Settings, prompt: string, imageBase64: string, temperature = 0.5): Promise<unknown> {
  const groq = s.provider === 'groq';
  const key = groq ? s.groqKey : s.geminiKey;
  const model = groq ? s.groqModel : s.geminiModel;
  if (!key) throw new AiError(`Primero pon tu API key de ${groq ? 'Groq' : 'Gemini'} en Ajustes ⚙️.`);

  const url = groq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (groq) headers.Authorization = `Bearer ${key}`;
  else headers['x-goog-api-key'] = key;

  const body = groq
    ? {
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
      }
    : {
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      };

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new AiError('No hay conexión a internet o el servidor no responde.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 401 || (res.status === 400 && /API key/i.test(msg))) {
      throw new AiError(`La API key de ${groq ? 'Groq' : 'Gemini'} no es válida. Revísala en Ajustes.`);
    }
    if (res.status === 404) throw new AiError(`El modelo "${model}" no existe o ya no está disponible. Elige otro en Ajustes.`);
    if (res.status === 429) throw new AiError('Se acabó tu cuota por ahora. Espera un minuto o cambia de proveedor en Ajustes.');
    if (res.status === 413) throw new AiError('La foto pesa demasiado para este modelo.');
    throw new AiError(`El servidor respondió con un error: ${msg}`);
  }

  const text: string = groq
    ? data?.choices?.[0]?.message?.content ?? ''
    : (data?.candidates?.[0]?.content?.parts ?? [])
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? '')
        .join('');
  if (!text) throw new AiError('La IA no regresó respuesta (quizá bloqueó la imagen). Intenta con otra foto.');
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new AiError('No entendí la respuesta de la IA. Intenta otra vez.');
  }
}

function exifText(e: ExifInfo) {
  const parts = [];
  if (e.model) parts.push(`Teléfono: ${e.model}`);
  if (e.iso) parts.push(`ISO ${e.iso}`);
  if (e.exposureTime) parts.push(`velocidad ${formatShutter(e.exposureTime)}`);
  if (e.fNumber) parts.push(`f/${e.fNumber.toFixed(1)}`);
  if (e.focal35) parts.push(`${e.focal35} mm (equiv. 35 mm)`);
  return parts.length ? parts.join(', ') : 'sin datos EXIF';
}

const ADJ_KEYS_DOC = ALL_DEFS.filter((d) => !d.key.startsWith('hsl_'))
  .map((d) => `${d.key} (${d.label}, ${d.min}..${d.max})`)
  .join('; ');

const ROLES = `- ${TWINS.tsuki.name} (técnica y encuadre): ${TWINS.tsuki.personality}
- ${TWINS.yami.name} (color y arte): ${TWINS.yami.personality}`;

export async function reviewPhoto(opts: {
  settings: Settings;
  imageBase64: string;
  exif: ExifInfo;
  presets: Preset[];
  currentPresetId: string | null;
}): Promise<TwinsReview> {
  const presetList = opts.presets.map((p) => `"${p.id}": ${p.name} (${p.subtitle})`).join(', ');
  const prompt = `Eres dos personajes, las gemelas Nakamura, dentro de una app de edición de fotos tipo Lightroom hecha para aprender fotografía.
${ROLES}

Quien usa la app fotografía cosplay y entrega las fotos a las modelos, así que la calidad tiene que ser de estudio.
Tomó esta foto con su teléfono Redmi (a veces en modo Pro). Datos de la cámara: ${exifText(opts.exif)}.
La imagen que ves es la foto ORIGINAL sin editar. Estilo elegido ahora: ${opts.currentPresetId ?? 'ninguno'}.
Estilos disponibles: ${presetList}.

Analiza la foto como profesionales y responde SOLO con JSON (en español de México, tono amigable, tuteando) con esta forma exacta:
{
  "escena": "qué hay en la foto en una frase",
  "puntuacion": {"composicion": 0-10, "luz": 0-10, "color": 0-10},
  "tsuki": {"resumen": "opinión del encuadre y la exposición en 1-2 frases, con cifras", "consejos": ["2 a 4 consejos concretos de encuadre, geometría y exposición para ESTA foto"], "proxima_vez": "un consejo técnico para la próxima (posición, altura, distancia, y en modo Pro: ISO, velocidad, enfoque, balance de blancos)"},
  "yami": {"resumen": "opinión del color, el ambiente y la pose en 1-2 frases", "consejos": ["2 a 4 consejos de color, luz creativa, pose o cómo luce el cosplay, explicando qué control mover y por qué"], "proxima_vez": "un consejo artístico para la próxima (pose, fondo, color, vestuario)"},
  "estilo": {"id": "id del estilo que mejor le queda de la lista", "porque": "por qué"},
  "recorte": {"aspecto": "Original|1:1|4:5|9:16|3:2|16:9|2.39:1", "cx": 0-1, "cy": 0-1, "zoom": 1-2.5, "angulo": grados para enderezar el horizonte (-15 a 15, positivo gira en sentido horario), "porque": "explicación"} o null si el encuadre ya es bueno,
  "ajustes": {objeto con SOLO los controles que conviene cambiar, como DIFERENCIA sumada al estilo; claves válidas: ${ADJ_KEYS_DOC}},
  "leccion": "una mini lección de fotografía basada en esta foto (2-3 frases)"
}
cx/cy son el centro del recorte (0,0 = esquina superior izquierda). Si ves manchas de color o ruido en las sombras, sube "denoise". Sé honesto pero motivador.`;

  return normalize((await call(opts.settings, prompt, opts.imageBase64)) as Partial<TwinsReview>);
}

function voice(v: unknown): TwinVoice {
  const o = (v ?? {}) as Partial<TwinVoice>;
  return {
    resumen: String(o.resumen ?? ''),
    consejos: Array.isArray(o.consejos) ? o.consejos.map(String) : [],
    proxima_vez: String(o.proxima_vez ?? ''),
  };
}

function normalize(r: Partial<TwinsReview>): TwinsReview {
  const ajustes: PartialAdj = {};
  for (const [k, v] of Object.entries(r.ajustes ?? {})) {
    if (DEF_BY_KEY[k as AdjKey] && typeof v === 'number' && isFinite(v)) ajustes[k as AdjKey] = v;
  }
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rc = r.recorte;
  return {
    escena: String(r.escena ?? ''),
    puntuacion: {
      composicion: num(r.puntuacion?.composicion, 0),
      luz: num(r.puntuacion?.luz, 0),
      color: num(r.puntuacion?.color, 0),
    },
    tsuki: voice(r.tsuki),
    yami: voice(r.yami),
    estilo: { id: String(r.estilo?.id ?? ''), porque: String(r.estilo?.porque ?? '') },
    recorte: rc
      ? {
          aspecto: String(rc.aspecto ?? 'Original'),
          cx: Math.min(1, Math.max(0, num(rc.cx, 0.5))),
          cy: Math.min(1, Math.max(0, num(rc.cy, 0.5))),
          zoom: Math.min(3, Math.max(1, num(rc.zoom, 1))),
          angulo: Math.min(20, Math.max(-20, num(rc.angulo, 0))),
          porque: String(rc.porque ?? ''),
        }
      : null,
    ajustes,
    leccion: String(r.leccion ?? ''),
  };
}

/** Consejo rápido mientras apuntas con la cámara. */
export async function liveTip(opts: { settings: Settings; imageBase64: string; styleName: string }): Promise<LiveTip> {
  const prompt = `Eres las gemelas Nakamura, coaches de fotografía de cosplay dentro de una app de cámara.
${ROLES}
Quien usa la app está apuntando la cámara AHORA (esta imagen es el visor) y quiere el estilo "${opts.styleName}".
Responde SOLO JSON: {"tsuki": "una instrucción corta y accionable de encuadre o exposición (máx. 20 palabras): moverse, agacharse, girar, acercarse, nivelar el horizonte, tercios…", "yami": "una instrucción corta de color, luz o pose (máx. 20 palabras)"}. Español de México, tuteando.`;
  const r = (await call(opts.settings, prompt, opts.imageBase64, 0.6)) as Partial<LiveTip>;
  return { tsuki: String(r.tsuki ?? ''), yami: String(r.yami ?? '') };
}
