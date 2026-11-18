// Conexión con Gemini (Google) para que las gemelas vean tu foto y te aconsejen.
import { ALL_DEFS, type PartialAdj, type AdjKey, DEF_BY_KEY } from '../engine/adjustments';
import type { Preset } from '../engine/presets';
import { formatShutter, type ExifInfo } from '../lib/image';
import { TWINS } from './twins';

export interface TwinVoice {
  resumen: string;
  consejos: string[];
  proxima_vez: string;
}

export interface TwinsReview {
  escena: string;
  puntuacion: { composicion: number; luz: number; color: number };
  aiko: TwinVoice;
  mei: TwinVoice;
  estilo: { id: string; porque: string };
  recorte: { aspecto: string; cx: number; cy: number; zoom: number; angulo: number; porque: string } | null;
  ajustes: PartialAdj;
  leccion: string;
}

export interface LiveTip { aiko: string; mei: string }

export class GeminiError extends Error {}

async function call(apiKey: string, model: string, parts: unknown[], temperature = 0.5): Promise<unknown> {
  if (!apiKey) throw new GeminiError('Primero pon tu API key de Gemini en Ajustes ⚙️.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    });
  } catch {
    throw new GeminiError('No hay conexión a internet o Gemini no responde.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    if (res.status === 400 && /API key/i.test(msg)) throw new GeminiError('La API key de Gemini no es válida. Revísala en Ajustes.');
    if (res.status === 404) throw new GeminiError(`El modelo "${model}" no existe o ya no está disponible. Elige otro en Ajustes.`);
    if (res.status === 429) throw new GeminiError('Llegaste al límite de uso de Gemini. Espera un minuto y vuelve a intentar.');
    throw new GeminiError(`Gemini respondió con un error: ${msg}`);
  }
  const text: string = (body?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) throw new GeminiError('Gemini no regresó respuesta (quizá bloqueó la imagen). Intenta con otra foto.');
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new GeminiError('No entendí la respuesta de Gemini. Intenta otra vez.');
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

export async function reviewPhoto(opts: {
  apiKey: string;
  model: string;
  imageBase64: string;
  exif: ExifInfo;
  presets: Preset[];
  currentPresetId: string | null;
}): Promise<TwinsReview> {
  const presetList = opts.presets.map((p) => `"${p.id}": ${p.name} (${p.subtitle})`).join(', ');
  const prompt = `Eres dos personajes, las gemelas Nakamura, dentro de una app de edición de fotos tipo Lightroom hecha para aprender fotografía.
- ${TWINS.aiko.name}: ${TWINS.aiko.personality}
- ${TWINS.mei.name}: ${TWINS.mei.personality}

El usuario tomó esta foto con su teléfono Redmi (a veces en modo Pro). Datos de la cámara: ${exifText(opts.exif)}.
La imagen que ves es la foto ORIGINAL sin editar. Estilo elegido ahora: ${opts.currentPresetId ?? 'ninguno'}.
Estilos disponibles: ${presetList}.

Analiza la foto como profesionales y responde SOLO con JSON (en español de México, tono amigable, tuteando) con esta forma exacta:
{
  "escena": "qué hay en la foto en una frase",
  "puntuacion": {"composicion": 0-10, "luz": 0-10, "color": 0-10},
  "aiko": {"resumen": "opinión del encuadre en 1-2 frases", "consejos": ["2 a 4 consejos concretos de encuadre/composición para ESTA foto"], "proxima_vez": "un consejo para cuando vuelva a tomar una foto así (posición, altura, distancia, modo Pro: ISO/velocidad/enfoque si aplica)"},
  "mei": {"resumen": "opinión de luz y color en 1-2 frases", "consejos": ["2 a 4 consejos de edición explicando qué control mover y por qué"], "proxima_vez": "un consejo de luz/exposición para la próxima"},
  "estilo": {"id": "id del estilo que mejor le queda de la lista", "porque": "por qué"},
  "recorte": {"aspecto": "Original|1:1|4:5|9:16|3:2|16:9|2.39:1", "cx": 0-1, "cy": 0-1, "zoom": 1-2.5, "angulo": grados para enderezar el horizonte (-15 a 15, positivo gira en sentido horario), "porque": "explicación"} o null si el encuadre ya es bueno,
  "ajustes": {objeto con SOLO los controles que conviene cambiar, como DIFERENCIA sumada al estilo; claves válidas: ${ADJ_KEYS_DOC}},
  "leccion": "una mini lección de fotografía basada en esta foto (2-3 frases)"
}
cx/cy son el centro del recorte (0,0 = esquina superior izquierda). Sé honesto pero motivador.`;

  const raw = (await call(opts.apiKey, opts.model, [
    { text: prompt },
    { inline_data: { mime_type: 'image/jpeg', data: opts.imageBase64 } },
  ])) as Partial<TwinsReview>;
  return normalize(raw);
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
    aiko: voice(r.aiko),
    mei: voice(r.mei),
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
export async function liveTip(opts: { apiKey: string; model: string; imageBase64: string; styleName: string }): Promise<LiveTip> {
  const prompt = `Eres las gemelas Nakamura, coaches de fotografía dentro de una app de cámara.
${TWINS.aiko.name} da consejos de encuadre; ${TWINS.mei.name} de luz.
El usuario está apuntando la cámara AHORA (esta imagen es el visor) y quiere el estilo "${opts.styleName}".
Responde SOLO JSON: {"aiko": "una instrucción corta y accionable de encuadre (máx. 20 palabras): moverse, agacharse, girar, acercarse, alinear horizonte, tercios…", "mei": "una instrucción corta de luz (máx. 20 palabras)"}. Español de México, tuteando.`;
  const r = (await call(opts.apiKey, opts.model, [
    { text: prompt },
    { inline_data: { mime_type: 'image/jpeg', data: opts.imageBase64 } },
  ], 0.6)) as Partial<LiveTip>;
  return { aiko: String(r.aiko ?? ''), mei: String(r.mei ?? '') };
}
