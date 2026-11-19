// Definición de todos los ajustes, sus rangos y la explicación didáctica de cada uno.

export const HSL_COLORS = [
  { id: 'red', label: 'Rojos', swatch: '#e5484d', hue: 0 },
  { id: 'orange', label: 'Naranjas', swatch: '#f08c3a', hue: 30 },
  { id: 'yellow', label: 'Amarillos', swatch: '#f2d13a', hue: 60 },
  { id: 'green', label: 'Verdes', swatch: '#46b24d', hue: 120 },
  { id: 'aqua', label: 'Aguamarinas', swatch: '#3ec6c6', hue: 180 },
  { id: 'blue', label: 'Azules', swatch: '#3b6fe0', hue: 230 },
  { id: 'purple', label: 'Morados', swatch: '#8b5cf6', hue: 270 },
  { id: 'magenta', label: 'Magentas', swatch: '#e04fb4', hue: 315 },
] as const;

export type HslColorId = (typeof HSL_COLORS)[number]['id'];

export type AdjKey =
  | 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks'
  | 'temperature' | 'tint' | 'vibrance' | 'saturation'
  | `hsl_${HslColorId}_h` | `hsl_${HslColorId}_s` | `hsl_${HslColorId}_l`
  | 'gradeShadowHue' | 'gradeShadowSat' | 'gradeMidHue' | 'gradeMidSat'
  | 'gradeHighHue' | 'gradeHighSat' | 'gradeBalance'
  | 'clarity' | 'dehaze' | 'sharpen' | 'fade' | 'vignette' | 'grain' | 'grainSize' | 'denoise'
  | 'bgExposure' | 'bgBlur' | 'bgSaturation' | 'subjExposure' | 'subjClarity' | 'maskFeather';

export type Adjustments = Record<AdjKey, number>;
export type PartialAdj = Partial<Adjustments>;

export interface SliderDef {
  key: AdjKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Qué hace el control, en palabras simples. */
  what: string;
  /** Qué pasa al subirlo. */
  up: string;
  /** Qué pasa al bajarlo. */
  down: string;
  /** Tip de fotógrafo. */
  tip?: string;
  /** Pinta la barra con un degradado (p. ej. temperatura). */
  gradient?: string;
  /** Los tonos (hue) no se suman entre capas: el último que lo fija gana. */
  absolute?: boolean;
}

const hueGradient =
  'linear-gradient(90deg,#f00,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00)';

export const LIGHT: SliderDef[] = [
  {
    key: 'exposure', label: 'Exposición', min: -3, max: 3, step: 0.05,
    what: 'Cuánta luz tiene toda la foto. Se mide en "pasos" (EV): +1 es el doble de luz.',
    up: 'Toda la foto se aclara, como si dejaras entrar más luz a la cámara.',
    down: 'Toda la foto se oscurece. Útil si el cielo salió "quemado".',
    tip: 'Ajusta primero la exposición y después lo demás: es la base de todo.',
  },
  {
    key: 'contrast', label: 'Contraste', min: -100, max: 100, step: 1,
    what: 'La diferencia entre las partes claras y las oscuras.',
    up: 'Claros más claros y oscuros más oscuros: más drama y fuerza.',
    down: 'Todo se acerca al gris medio: look suave, nostálgico o "lavado".',
    tip: 'El cine de acción usa contraste alto; las fotos de ensueño, bajo.',
  },
  {
    key: 'highlights', label: 'Altas luces', min: -100, max: 100, step: 1,
    what: 'Solo las zonas brillantes: cielos, ventanas, reflejos.',
    up: 'Lo brillante brilla más (cuidado, puede perder detalle).',
    down: 'Recupera detalle en cielos y nubes que se veían blancos.',
    tip: 'Bajar altas luces casi siempre mejora un cielo de día.',
  },
  {
    key: 'shadows', label: 'Sombras', min: -100, max: 100, step: 1,
    what: 'Solo las zonas oscuras, sin tocar las claras.',
    up: 'Saca detalle de lo oscuro, como poner una luz de relleno.',
    down: 'Sombras más profundas y misteriosas.',
    tip: 'Para contraluces: sube sombras y baja altas luces.',
  },
  {
    key: 'whites', label: 'Blancos', min: -100, max: 100, step: 1,
    what: 'Dónde empieza el blanco puro (el punto más claro).',
    up: 'Más partes llegan a blanco total: foto más brillante y "limpia".',
    down: 'Ningún punto llega a blanco puro: look más de película.',
  },
  {
    key: 'blacks', label: 'Negros', min: -100, max: 100, step: 1,
    what: 'Dónde empieza el negro puro (el punto más oscuro).',
    up: 'Los negros se vuelven grises: look mate o vintage.',
    down: 'Negros profundos y sólidos: más peso y elegancia.',
  },
];

export const COLOR: SliderDef[] = [
  {
    key: 'temperature', label: 'Temperatura', min: -150, max: 150, step: 1,
    gradient: 'linear-gradient(90deg,#3b78ff,#d9d9d9,#ffb13b)',
    what: 'El balance entre tonos fríos (azul) y cálidos (amarillo/naranja).',
    up: 'Más cálida: atardecer, nostalgia, calidez.',
    down: 'Más fría: noche, tensión, ciudad, invierno.',
    tip: 'Nolan suele enfriar sus escenas de ciudad para que se sientan serias.',
  },
  {
    key: 'tint', label: 'Matiz', min: -150, max: 150, step: 1,
    gradient: 'linear-gradient(90deg,#3bd16f,#d9d9d9,#e04fb4)',
    what: 'Corrige o crea dominantes verdes o magentas.',
    up: 'Más magenta/rosa.',
    down: 'Más verde. Las luces fluorescentes suelen dar verde.',
  },
  {
    key: 'vibrance', label: 'Intensidad', min: -100, max: 100, step: 1,
    what: 'Satura de forma "inteligente": sube más los colores apagados y cuida la piel.',
    up: 'Colores más vivos sin que la gente se vea naranja.',
    down: 'Apaga los colores de forma suave.',
    tip: 'Prefiere Intensidad antes que Saturación para retratos.',
  },
  {
    key: 'saturation', label: 'Saturación', min: -100, max: 100, step: 1,
    what: 'La fuerza de TODOS los colores por igual.',
    up: 'Todo más colorido (fácil de exagerar).',
    down: 'Menos color. En -100 la foto queda en blanco y negro.',
  },
];

export const EFFECTS: SliderDef[] = [
  {
    key: 'denoise', label: 'Reducir ruido', min: 0, max: 100, step: 1,
    what: 'Quita las manchas de color que salen en las zonas oscuras cuando disparas con ISO alto.',
    up: 'Sombras limpias y parejas, sin manchas azules o verdes.',
    down: 'Deja el ruido tal cual viene de la camara.',
    tip: 'Arriba de ISO 1600 casi siempre hace falta. Si te pasas, los colores finos de las sombras se aplanan.',
  },
  {
    key: 'clarity', label: 'Claridad', min: -100, max: 100, step: 1,
    what: 'El contraste en los detalles medianos: texturas, arrugas, bordes.',
    up: 'Más textura y dureza: concreto, metal, rostros con carácter.',
    down: 'Suaviza: piel tersa y look de ensueño.',
  },
  {
    key: 'dehaze', label: 'Neblina', min: -100, max: 100, step: 1,
    what: 'Quita o agrega la "bruma" de la atmósfera.',
    up: 'Quita neblina: más contraste y color en paisajes y ciudades.',
    down: 'Agrega bruma: atmósfera misteriosa o de sueño.',
  },
  {
    key: 'sharpen', label: 'Nitidez', min: 0, max: 100, step: 1,
    what: 'Remarca los bordes finos para que la foto se vea más definida.',
    up: 'Más definición. Si te pasas aparecen halos y ruido.',
    down: 'Menos realce de bordes.',
  },
  {
    key: 'fade', label: 'Desvanecer', min: 0, max: 100, step: 1,
    what: 'Levanta los negros como en una película vieja o revelado mate.',
    up: 'Negros grisáceos, look retro y suave.',
    down: 'Negros normales.',
  },
  {
    key: 'vignette', label: 'Viñeta', min: -100, max: 100, step: 1,
    what: 'Oscurece o aclara las orillas de la foto.',
    up: 'Orillas blancas (look soñador, poco común).',
    down: 'Orillas oscuras: guía la mirada al centro, muy cinematográfico.',
    tip: 'Una viñeta leve (-15 a -30) casi nunca se nota pero ayuda mucho.',
  },
  {
    key: 'grain', label: 'Grano', min: 0, max: 100, step: 1,
    what: 'Agrega textura de película fotográfica.',
    up: 'Más grano: look analógico, cine en 35 mm.',
    down: 'Imagen limpia digital.',
  },
  {
    key: 'grainSize', label: 'Tamaño de grano', min: 0, max: 100, step: 1,
    what: 'Qué tan grande es cada partícula de grano.',
    up: 'Grano grueso, como película de alta sensibilidad.',
    down: 'Grano fino y discreto.',
  },
];

export const GRADING: SliderDef[] = [
  {
    key: 'gradeShadowHue', label: 'Tono en sombras', min: 0, max: 360, step: 1, absolute: true,
    gradient: hueGradient,
    what: 'Qué color se mete en las zonas oscuras.',
    up: 'Recorre el círculo de color.',
    down: 'Recorre el círculo de color.',
    tip: 'Azul verdoso (190-210) en sombras = look cine clásico.',
  },
  {
    key: 'gradeShadowSat', label: 'Fuerza en sombras', min: 0, max: 100, step: 1,
    what: 'Cuánto color se agrega a las sombras.',
    up: 'Sombras más teñidas.', down: 'Sombras neutras.',
  },
  {
    key: 'gradeMidHue', label: 'Tono en medios', min: 0, max: 360, step: 1, absolute: true,
    gradient: hueGradient,
    what: 'Qué color se agrega a los tonos medios (piel, paredes, ropa).',
    up: 'Recorre el círculo de color.', down: 'Recorre el círculo de color.',
  },
  {
    key: 'gradeMidSat', label: 'Fuerza en medios', min: 0, max: 100, step: 1,
    what: 'Cuánto color se agrega a los medios tonos.',
    up: 'Más teñido.', down: 'Neutro.',
  },
  {
    key: 'gradeHighHue', label: 'Tono en luces', min: 0, max: 360, step: 1, absolute: true,
    gradient: hueGradient,
    what: 'Qué color se mete en las zonas claras.',
    up: 'Recorre el círculo de color.', down: 'Recorre el círculo de color.',
    tip: 'Naranja (30-45) en luces + azul en sombras = "teal & orange".',
  },
  {
    key: 'gradeHighSat', label: 'Fuerza en luces', min: 0, max: 100, step: 1,
    what: 'Cuánto color se agrega a las luces.',
    up: 'Luces más teñidas.', down: 'Luces neutras.',
  },
  {
    key: 'gradeBalance', label: 'Balance', min: -100, max: 100, step: 1,
    what: 'Decide qué zona domina: sombras o luces.',
    up: 'Gana el color de las luces.', down: 'Gana el color de las sombras.',
  },
];

/** Controles que solo funcionan cuando ya separaste al sujeto del fondo. */
export const MASK: SliderDef[] = [
  {
    key: 'bgExposure', label: 'Fondo: luz', min: -3, max: 1, step: 0.05,
    what: 'Aclara u oscurece SOLO el fondo, sin tocar a la persona.',
    up: 'Fondo más claro.',
    down: 'Fondo más oscuro: la persona resalta sola, como en estudio.',
    tip: 'Bajar el fondo entre -0.5 y -1.5 EV es el truco más rápido para que un cosplay se vea profesional.',
  },
  {
    key: 'bgBlur', label: 'Fondo: desenfoque', min: 0, max: 100, step: 1,
    what: 'Desenfoca el fondo para imitar un lente de retrato con el diafragma abierto.',
    up: 'Fondo más borroso: separa a la persona y esconde el desorden.',
    down: 'Fondo nítido.',
    tip: 'Es una imitación del desenfoque real. Si te pasas, los bordes del pelo se notan falsos.',
  },
  {
    key: 'bgSaturation', label: 'Fondo: color', min: -100, max: 100, step: 1,
    what: 'La fuerza del color solo en el fondo.',
    up: 'Fondo más colorido.',
    down: 'Fondo apagado o gris: toda la atención va al traje.',
  },
  {
    key: 'subjExposure', label: 'Sujeto: luz', min: -1, max: 1, step: 0.02,
    what: 'Aclara u oscurece SOLO a la persona.',
    up: 'La persona recibe más luz, como un reflector de relleno.',
    down: 'La persona se oscurece.',
    tip: 'Subir +0.2 EV al sujeto y bajar -0.8 EV al fondo da ese look de estudio con foco.',
  },
  {
    key: 'subjClarity', label: 'Sujeto: textura', min: -100, max: 100, step: 1,
    what: 'El detalle fino solo en la persona: piel, tela, peluca.',
    up: 'Más textura: se nota la costura y el material del traje.',
    down: 'Suaviza la piel sin desenfocar el fondo.',
  },
  {
    key: 'maskFeather', label: 'Suavizar borde', min: 0, max: 100, step: 1,
    what: 'Qué tan difuminado queda el borde entre la persona y el fondo.',
    up: 'Borde suave: perdona errores del recorte, sobre todo en el pelo.',
    down: 'Borde duro y exacto.',
    tip: 'Si ves un halo alrededor del pelo, sube esto.',
  },
];

export function hslDefs(color: (typeof HSL_COLORS)[number]): SliderDef[] {
  return [
    {
      key: `hsl_${color.id}_h` as AdjKey, label: 'Tono', min: -100, max: 100, step: 1,
      what: `Cambia el tono de los ${color.label.toLowerCase()} hacia el color vecino.`,
      up: 'Gira el color hacia el siguiente en el arcoíris.',
      down: 'Gira el color hacia el anterior en el arcoíris.',
      tip: 'Pasar verdes hacia aguamarina es un truco clásico de cine.',
    },
    {
      key: `hsl_${color.id}_s` as AdjKey, label: 'Saturación', min: -100, max: 100, step: 1,
      what: `La fuerza solo de los ${color.label.toLowerCase()}.`,
      up: `${color.label} más intensos.`,
      down: `${color.label} apagados (hasta gris).`,
    },
    {
      key: `hsl_${color.id}_l` as AdjKey, label: 'Luminancia', min: -100, max: 100, step: 1,
      what: `Qué tan claros u oscuros son los ${color.label.toLowerCase()}.`,
      up: `${color.label} más claros.`,
      down: `${color.label} más oscuros (bajar azules oscurece el cielo).`,
    },
  ];
}

export const ALL_DEFS: SliderDef[] = [
  ...LIGHT, ...COLOR, ...EFFECTS, ...GRADING, ...MASK, ...HSL_COLORS.flatMap(hslDefs),
];
export const DEF_BY_KEY = Object.fromEntries(ALL_DEFS.map((d) => [d.key, d])) as Record<AdjKey, SliderDef>;

export function neutral(): Adjustments {
  const a = {} as Adjustments;
  for (const d of ALL_DEFS) a[d.key] = 0;
  a.gradeShadowHue = 210;
  a.gradeMidHue = 30;
  a.gradeHighHue = 40;
  a.grainSize = 35;
  a.maskFeather = 30;
  return a;
}

export function clampAdj(key: AdjKey, v: number): number {
  const d = DEF_BY_KEY[key];
  if (!d) return v;
  if (d.absolute) return ((v % 360) + 360) % 360;
  return Math.min(d.max, Math.max(d.min, v));
}

/** Recorte y enderezado. */
export interface CropState {
  /** ancho/alto deseado; null = proporción original */
  aspect: number | null;
  zoom: number;
  cx: number;
  cy: number;
  angle: number;
}

export const ASPECTS: { label: string; value: number | null; hint: string }[] = [
  { label: 'Original', value: null, hint: 'La proporción de tu cámara.' },
  { label: '1:1', value: 1, hint: 'Cuadrado: perfecto para retratos y el feed.' },
  { label: '4:5', value: 4 / 5, hint: 'Vertical de Instagram: ocupa más pantalla.' },
  { label: '9:16', value: 9 / 16, hint: 'Historias y reels.' },
  { label: '3:2', value: 3 / 2, hint: 'El formato clásico de la película de 35 mm.' },
  { label: '16:9', value: 16 / 9, hint: 'Pantalla de TV o YouTube.' },
  { label: '2.39:1', value: 2.39, hint: 'Cinemascope: el formato ancho de las películas de cine.' },
];

export function defaultCrop(): CropState {
  return { aspect: null, zoom: 1, cx: 0.5, cy: 0.5, angle: 0 };
}

/** Rectángulo de recorte en píxeles de la imagen original (centro, tamaño, ángulo en radianes). */
export interface CropRect { cx: number; cy: number; w: number; h: number; angle: number }

export function resolveCrop(c: CropState, imgW: number, imgH: number): CropRect {
  const angle = (c.angle * Math.PI) / 180;
  const aspect = c.aspect ?? imgW / imgH;
  // Rectángulo más grande con esa proporción dentro de la imagen
  let w = imgW, h = imgW / aspect;
  if (h > imgH) { h = imgH; w = imgH * aspect; }
  w /= c.zoom; h /= c.zoom;
  // Al enderezar, encoger hasta que quepa sin esquinas negras
  const fits = (sw: number, sh: number, cx: number, cy: number) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = (dx * sw) / 2, py = (dy * sh) / 2;
      const rx = cx + px * cos - py * sin;
      const ry = cy + px * sin + py * cos;
      if (rx < -0.5 || rx > imgW + 0.5 || ry < -0.5 || ry > imgH + 0.5) return false;
    }
    return true;
  };
  const icx = imgW / 2, icy = imgH / 2;
  let s = 1;
  if (!fits(w, h, icx, icy)) {
    let lo = 0.05, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(w * m, h * m, icx, icy)) lo = m; else hi = m; }
    s = lo;
  }
  w *= s; h *= s;
  // Mover el centro deseado lo más posible sin salirse
  const tx = c.cx * imgW, ty = c.cy * imgH;
  let lo = 0, hi = 1;
  if (fits(w, h, tx, ty)) lo = 1;
  else for (let i = 0; i < 25; i++) { const m = (lo + hi) / 2; if (fits(w, h, icx + (tx - icx) * m, icy + (ty - icy) * m)) lo = m; else hi = m; }
  return { cx: icx + (tx - icx) * lo, cy: icy + (ty - icy) * lo, w, h, angle };
}
