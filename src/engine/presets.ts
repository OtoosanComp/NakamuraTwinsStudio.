import type { PartialAdj } from './adjustments';

export interface Preset {
  id: string;
  name: string;
  subtitle: string;
  /** Colores para la miniatura del estilo */
  palette: string[];
  /** Explicación de cómo se construye el look (para aprender) */
  recipe: string;
  /** Proporción sugerida (solo se sugiere, no se aplica sola) */
  suggestAspect?: number;
  adj: PartialAdj;
  custom?: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: 'nolan',
    name: 'Caballero de la Noche',
    subtitle: 'estilo Nolan',
    palette: ['#0d1620', '#2b4152', '#6f8796', '#c9a27a'],
    suggestAspect: 2.39,
    recipe:
      'Ciudad fría y seria: temperatura hacia el azul, colores apagados (sobre todo verdes y amarillos), ' +
      'sombras azul acero y negros profundos. La piel se conserva cálida para que las personas destaquen. ' +
      'Claridad alta para texturas duras de concreto y metal, viñeta para encerrar la mirada y un poco de grano de película. ' +
      'Pruébalo en formato 2.39:1 para que se vea como pantalla de cine.',
    adj: {
      temperature: -18, tint: -4, contrast: 28, highlights: -35, shadows: -10, whites: 5, blacks: -22,
      vibrance: -10, saturation: -28, clarity: 22, dehaze: 10, sharpen: 20,
      gradeShadowHue: 205, gradeShadowSat: 30, gradeMidHue: 200, gradeMidSat: 8,
      gradeHighHue: 38, gradeHighSat: 10, gradeBalance: -10,
      hsl_orange_s: -8, hsl_orange_l: 6, hsl_blue_s: -20, hsl_blue_l: -15, hsl_aqua_s: -25,
      hsl_green_h: 20, hsl_green_s: -55, hsl_green_l: -20, hsl_yellow_s: -40, hsl_red_s: -15,
      vignette: -28, grain: 18, grainSize: 30,
    },
  },
  {
    id: 'citypop',
    name: 'City Pop',
    subtitle: 'Tokio 1985',
    palette: ['#2a2a6e', '#e96fa7', '#ffb36b', '#7fe0e0'],
    recipe:
      'El look de las portadas de discos japoneses de los 80: atardeceres cálidos, cielos turquesa y magenta, ' +
      'sombras moradas y negros levantados como impresión vieja. Sombras abiertas, contraste suave e intensidad alta. ' +
      'Funciona increíble con edificios, autos y luces de la ciudad al atardecer.',
    adj: {
      exposure: 0.15, contrast: -10, highlights: -20, shadows: 25, temperature: 12, tint: 14,
      vibrance: 35, saturation: 8, fade: 22, clarity: -10,
      gradeShadowHue: 250, gradeShadowSat: 28, gradeHighHue: 30, gradeHighSat: 22, gradeBalance: 5,
      hsl_blue_h: -25, hsl_blue_s: 20, hsl_aqua_h: 10, hsl_aqua_s: 25, hsl_magenta_s: 25,
      hsl_purple_h: 15, hsl_orange_l: 8, hsl_green_h: 35, hsl_green_s: -20,
      grain: 22, grainSize: 45, vignette: -10,
    },
  },
  {
    id: 'candy',
    name: 'Candy',
    subtitle: 'pastel dulce',
    palette: ['#ffd1e8', '#ffb3c7', '#bfe6ff', '#c9f5df'],
    recipe:
      'Brillante, suave y en tonos pastel: exposición arriba, contraste bajo y negros levantados. ' +
      'Los verdes se vuelven menta, los azules se aclaran a celeste y los rojos tiran a rosa. ' +
      'Un toque de magenta en todo y claridad negativa para piel suave. Ideal para retratos, comida y postres.',
    adj: {
      exposure: 0.35, contrast: -18, highlights: -30, shadows: 35, whites: 10, blacks: 15,
      temperature: 5, tint: 20, vibrance: 40, saturation: -5, fade: 15, clarity: -20,
      gradeShadowHue: 320, gradeShadowSat: 15, gradeHighHue: 340, gradeHighSat: 12,
      hsl_red_h: -15, hsl_red_s: 10, hsl_magenta_l: 15, hsl_blue_h: -20, hsl_blue_s: -10, hsl_blue_l: 25,
      hsl_green_h: 30, hsl_green_s: -30, hsl_green_l: 20, hsl_yellow_l: 15,
    },
  },
  {
    id: 'neon',
    name: 'Neón Nocturno',
    subtitle: 'ciudad cyberpunk',
    palette: ['#05060f', '#00c2d1', '#ff2e97', '#8a3cff'],
    recipe:
      'Para fotos de noche en la ciudad: sombras turquesa, luces magenta, amarillos girados a naranja ' +
      'y verdes convertidos en aguamarina para que todo parezca neón. Contraste alto, quitar neblina y viñeta fuerte.',
    adj: {
      exposure: -0.2, contrast: 22, highlights: -20, blacks: -15, temperature: -20, tint: 18,
      vibrance: 30, clarity: 15, dehaze: 15,
      gradeShadowHue: 190, gradeShadowSat: 38, gradeHighHue: 315, gradeHighSat: 25,
      hsl_yellow_h: -30, hsl_green_h: 60, hsl_green_s: -40, hsl_blue_h: 30, hsl_blue_s: 30,
      hsl_magenta_s: 30, hsl_purple_s: 20,
      vignette: -32, grain: 14,
    },
  },
  {
    id: 'concreto',
    name: 'Concreto',
    subtitle: 'urbano crudo',
    palette: ['#141614', '#3c433b', '#8a8f7e', '#c8c3a5'],
    recipe:
      'Calle dura y fría: casi sin color, con una dominante verde-amarillenta sucia, negros aplastados, ' +
      'mucha claridad y nitidez para las texturas del asfalto y los muros, grano grueso y viñeta pesada.',
    adj: {
      temperature: 4, tint: -12, contrast: 35, highlights: -25, shadows: -15, blacks: -25,
      saturation: -45, clarity: 35, dehaze: 12, sharpen: 30,
      gradeShadowHue: 160, gradeShadowSat: 18, gradeHighHue: 55, gradeHighSat: 15,
      grain: 30, grainSize: 50, vignette: -35,
    },
  },
  {
    id: 'tealorange',
    name: 'Hora Dorada',
    subtitle: 'teal & orange',
    palette: ['#0f3a4a', '#1f7a8c', '#f2a65a', '#ffd6a5'],
    recipe:
      'El look más usado en el cine de acción: la piel y las luces se vuelven naranja y las sombras ' +
      'azul verdoso. Como son colores opuestos, las personas resaltan sobre el fondo.',
    adj: {
      temperature: 10, contrast: 20, highlights: -15, shadows: 10, vibrance: 20, clarity: 10,
      gradeShadowHue: 195, gradeShadowSat: 35, gradeHighHue: 35, gradeHighSat: 30,
      hsl_orange_s: 15, hsl_blue_h: -10, hsl_blue_s: 10, hsl_aqua_h: 10, hsl_green_h: 30, hsl_green_s: -40,
      vignette: -15,
    },
  },
  {
    id: 'bn',
    name: 'Calle B/N',
    subtitle: 'blanco y negro',
    palette: ['#000000', '#444444', '#999999', '#eeeeee'],
    recipe:
      'Blanco y negro de fotografía callejera. Aunque no hay color, la mezcla HSL decide qué tan claro queda ' +
      'cada color en gris: bajar la luminancia de azules oscurece el cielo y sube el drama.',
    adj: {
      saturation: -100, contrast: 40, highlights: -20, shadows: 10, blacks: -15, clarity: 30,
      hsl_red_l: 10, hsl_orange_l: 15, hsl_blue_l: -30, hsl_aqua_l: -15,
      grain: 35, grainSize: 40, vignette: -22,
    },
  },
];

const CUSTOM_KEY = 'nts.customPresets';

export function loadCustomPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') as Preset[];
  } catch {
    return [];
  }
}

export function saveCustomPresets(list: Preset[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}
