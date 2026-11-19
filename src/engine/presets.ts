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
  /** Cómo disparar esta foto con el modo Pro del teléfono. */
  shoot?: Shoot;
  custom?: boolean;
}

export interface Shoot {
  /** Qué luz buscar. Es lo que más manda en el resultado. */
  luz: string;
  raw: string;
  iso: string;
  velocidad: string;
  /** Kelvin: MÁS bajo = foto más fría/azul. MÁS alto = más cálida/naranja. */
  wb: string;
  ev: string;
  enfoque: string;
  encuadre: string;
  truco: string;
}

/** Vale para cualquier estilo. */
export const SHOOT_BASICS = [
  'A 23 mm no bajes de 1/50 s sin apoyo. Con personas, 1/125 s: la gente se mueve aunque tú no.',
  'Apoya el codo en el cuerpo, detén la respiración al disparar y usa el temporizador de 2 s si puedes recargarte en algo.',
  'El ISO no ilumina, amplifica: también amplifica el ruido. Primero baja la velocidad, y solo al final sube el ISO.',
  'En RAW el Redmi guarda un DNG y un JPG juntos. La app abre el JPG; el DNG guárdalo por si quieres volver a empezar.',
  'En Kelvin: un número MÁS BAJO enfría la foto (azul) y uno MÁS ALTO la calienta (naranja).',
];

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
    shoot: {
      luz:
        'Luz lateral y dura, de una sola fuente. Huye de la luz plana de frente: el look vive de la sombra.',
      raw: 'Sí, RAW activado.',
      iso: '50 a 200 de día. De noche no pases de 800.',
      velocidad: '1/125 s o más rápido si hay gente.',
      wb:
        '4300 a 4800 K. Lo pones más frío que la luz real para que ya salga azulada.',
      ev: '-0.3 a -0.7. Es preferible una foto oscura que un blanco quemado.',
      enfoque: 'MF a los ojos. Acerca el visor para confirmarlo.',
      encuadre: 'Deja aire arriba y prueba el recorte 2.39:1.',
      truco:
        'Busca un fondo liso y oscuro. Un traje claro sobre fondo oscuro es la mitad del look.',
    },
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
    shoot: {
      luz: 'La última hora de sol o la hora azul, con la ciudad o el cielo detrás.',
      raw: 'Sí.',
      iso: '50 a 100.',
      velocidad: '1/125 s.',
      wb: '6000 a 6800 K, para quedarte el calor del atardecer.',
      ev: '-0.3, para que el cielo no se queme.',
      enfoque: 'MF al sujeto.',
      encuadre: '4:5 vertical con cielo en la parte de arriba.',
      truco:
        'Mete luces al fondo (letreros, faros, ventanas). Desenfocadas se ven como bolitas de color.',
    },
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
    shoot: {
      luz:
        'Suave y pareja: sombra abierta, día nublado o junto a una ventana grande. Nunca sol directo.',
      raw: 'Sí.',
      iso: '50 a 100.',
      velocidad: '1/200 s.',
      wb: '5400 a 5800 K.',
      ev: '+0.3 a +0.7. Expón alto pero revisa que nada se queme.',
      enfoque: 'MF a la cara.',
      encuadre: '1:1 o 4:5, con fondo claro.',
      truco:
        'Una sombra dura rompe el pastel. Si hay sol, métete a la sombra de un edificio.',
    },
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
    shoot: {
      luz:
        'Que el neón o el LED de color le pegue al sujeto de lado o de atrás, no de frente.',
      raw: 'Obligatorio. De noche el JPG solo se queda corto.',
      iso: '400 a 800. Más arriba el ruido se come el color.',
      velocidad: '1/60 s apoyado. 1/30 s solo con tripié o recargado en un muro.',
      wb: '3600 a 4200 K. Frío, para que el neón resalte contra el ambiente.',
      ev: '-1.0. El neón se quema facilísimo y queda como una mancha blanca.',
      enfoque: 'MF siempre: de noche el autofoco se pierde.',
      encuadre: '9:16 para redes o 2.39:1 para que se vea de cine.',
      truco: 'Pide que no se mueva 2 segundos. A 1/60 s cualquier gesto sale movido.',
    },
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
    shoot: {
      luz:
        'Día nublado o la sombra dura de un edificio. La luz pareja deja ver la textura.',
      raw: 'Sí.',
      iso: '50 a 200.',
      velocidad: '1/250 s.',
      wb: '5000 a 5200 K, neutro.',
      ev: '0.',
      enfoque: 'MF.',
      encuadre: '3:2, e incluye textura: muro, asfalto, metal.',
      truco:
        'Este estilo vive de la superficie. Busca muros rayados, concreto viejo o cortina metálica.',
    },
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
    shoot: {
      luz: 'Última hora de sol, con el sol DETRÁS del sujeto.',
      raw: 'Sí.',
      iso: '50.',
      velocidad: '1/250 s.',
      wb: '5600 a 6000 K.',
      ev: '-0.3, pero midiendo en la cara, no en el cielo.',
      enfoque: 'MF a los ojos.',
      encuadre: '3:2 o 16:9.',
      truco:
        'Deja que el sol entre de lado y le haga brillo al pelo o a la peluca. Ese contraluz es el estilo.',
    },
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
    shoot: {
      luz:
        'Sol duro de mediodía o una lámpara fuerte. Aquí sí quieres sombras marcadas.',
      raw: 'Sí.',
      iso: '50 a 400.',
      velocidad: '1/250 s o más rápido.',
      wb: '5200 K. Da igual el color, pero fíjalo para que no cambie entre tomas.',
      ev: '-0.3.',
      enfoque: 'MF.',
      encuadre: '1:1 o 3:2.',
      truco:
        'Deja de ver colores y busca formas, líneas y sombras. Lo que no funciona en gris, no funciona.',
    },
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
