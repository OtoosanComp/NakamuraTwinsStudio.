// Motor de revelado en WebGL2. Todo se calcula en la GPU, así que es rápido en el teléfono.
import { HSL_COLORS, type Adjustments, type CropRect } from './adjustments';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
out vec2 v_st;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); // pantalla: y hacia abajo
  v_st = a_pos * 0.5 + 0.5; // texturas intermedias: sin voltear
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const DOWNSAMPLE = `#version 300 es
precision highp float;
in vec2 v_st; out vec4 o;
uniform sampler2D u_src; uniform float u_lod;
void main() { o = textureLod(u_src, v_st, u_lod); }`;

const BLUR = `#version 300 es
precision highp float;
in vec2 v_st; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_dir;
void main() {
  float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec4 c = texture(u_src, v_st) * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(u_src, v_st + u_dir * float(i) * 1.5) * w[i];
    c += texture(u_src, v_st - u_dir * float(i) * 1.5) * w[i];
  }
  o = c;
}`;

const MAIN = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src, u_blur, u_mask, u_curve, u_brush, u_fill, u_dodge;
uniform vec2 u_srcSize, u_outSize, u_cropCenter, u_cropSize;
uniform float u_angle, u_bypass;
uniform float u_exposure, u_contrast, u_highlights, u_shadows, u_whites, u_blacks;
uniform float u_temp, u_tint, u_vibrance, u_saturation;
uniform float u_hslH[8], u_hslS[8], u_hslL[8], u_hslC[8];
uniform vec3 u_gS, u_gM, u_gH;
uniform float u_gBalance;
uniform float u_clarity, u_dehaze, u_sharpen, u_fade, u_vignette, u_grain, u_grainSize, u_seed;
uniform float u_denoise;
uniform float u_hasMask, u_showMask, u_maskFeather, u_clip, u_alphaFromMask, u_bicubic, u_hasCurve, u_hasBrush, u_hasFill, u_hasDodge;
uniform int u_healCount;
uniform vec4 u_healA[20];  // xy = centro, z = radio (fraccion del ancho)
uniform vec4 u_healB[20];  // xy = de donde se copia
uniform vec4 u_healC[20];  // rgb = correccion de color
uniform float u_bgExposure, u_bgBlur, u_bgSaturation, u_subjExposure, u_subjClarity;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c) { return dot(c, LUMA); }

/**
 * Al acercar mucho, el filtro normal de la GPU deja la foto blanda.
 * Catmull-Rom reconstruye con 16 muestras y conserva el filo de los bordes.
 */
vec3 sampleSrc(vec2 uv, float lod) {
  if (u_bicubic < 0.5 || lod > 0.01) return textureLod(u_src, uv, lod).rgb;
  vec2 p = uv * u_srcSize - 0.5;
  vec2 f = fract(p);
  vec2 base = (floor(p) + 0.5) / u_srcSize;
  float wx[4], wy[4];
  for (int k = 0; k < 2; k++) {
    float x = k == 0 ? f.x : f.y;
    float x2 = x * x, x3 = x2 * x;
    float a = -0.5 * x3 + x2 - 0.5 * x;
    float b = 1.5 * x3 - 2.5 * x2 + 1.0;
    float c2 = -1.5 * x3 + 2.0 * x2 + 0.5 * x;
    float d = 0.5 * x3 - 0.5 * x2;
    if (k == 0) { wx[0] = a; wx[1] = b; wx[2] = c2; wx[3] = d; }
    else { wy[0] = a; wy[1] = b; wy[2] = c2; wy[3] = d; }
  }
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i) - 1.0, float(j) - 1.0) / u_srcSize;
      acc += textureLod(u_src, base + o, 0.0).rgb * (wx[i] * wy[j]);
    }
  }
  return clamp(acc, 0.0, 1.0);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  // --- Recorte y enderezado ---
  vec2 q = (v_uv - 0.5) * u_cropSize;
  float cs = cos(u_angle), sn = sin(u_angle);
  vec2 p = u_cropCenter + vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  vec2 uv = p / u_srcSize;

  // --- Mascara del sujeto (1 = persona, 0 = fondo) ---
  float m = 1.0, bg = 0.0;
  if (u_hasMask > 0.5 || u_hasBrush > 0.5) {
    float base = u_hasMask > 0.5 ? texture(u_mask, uv).r : 0.0;
    // El pincel suma (blanco) o resta (negro) sobre lo que encontró la IA.
    if (u_hasBrush > 0.5) base = clamp(base + (texture(u_brush, uv).r * 2.0 - 1.0), 0.0, 1.0);
    float e = 0.02 + u_maskFeather * 0.45;
    m = smoothstep(0.5 - e, 0.5 + e, base);
    bg = 1.0 - m;
    if (u_showMask > 0.5) { o = vec4(vec3(m), 1.0); return; }
  }

  // El desenfoque del fondo se toma de los niveles reducidos de la textura, asi que es casi gratis.
  float lod = u_bgBlur * bg * 6.0;
  vec3 c = sampleSrc(uv, lod);
  if (u_bypass > 0.5) { o = vec4(c, 1.0); return; }

  // --- Relleno según contenido: va primero, para que reciba los mismos ajustes ---
  if (u_hasFill > 0.5) {
    vec4 f = texture(u_fill, uv);
    c = mix(c, f.rgb, f.a);
  }

  // --- Sello de clonar: copia de donde tú marcaste ---
  for (int i = 0; i < 20; i++) {
    if (i >= u_healCount) break;
    float rad = u_healA[i].z * u_srcSize.x;
    float dist = length((uv - u_healA[i].xy) * u_srcSize);
    if (dist < rad) {
      float w = 1.0 - smoothstep(rad * 0.5, rad, dist);
      vec3 parche = sampleSrc(uv + u_healB[i].xy, lod) + u_healC[i].rgb;
      c = mix(c, clamp(parche, 0.0, 1.0), w);
    }
  }

  // --- Nitidez (máscara de enfoque) ---
  // Los vecinos se leen al mismo nivel, para no volver a afilar el fondo ya desenfocado.
  vec2 t = 1.0 / u_srcSize;
  if (u_sharpen > 0.0) {
    vec3 n = textureLod(u_src, uv + vec2(t.x, 0), lod).rgb + textureLod(u_src, uv - vec2(t.x, 0), lod).rgb
           + textureLod(u_src, uv + vec2(0, t.y), lod).rgb + textureLod(u_src, uv - vec2(0, t.y), lod).rgb;
    // Al acercar, los vecinos de un solo pixel quedan muy juntos: separamos el muestreo
    if (u_bicubic > 0.5) {
      vec2 t2 = t * 2.0;
      n = textureLod(u_src, uv + vec2(t2.x, 0), lod).rgb + textureLod(u_src, uv - vec2(t2.x, 0), lod).rgb
        + textureLod(u_src, uv + vec2(0, t2.y), lod).rgb + textureLod(u_src, uv - vec2(0, t2.y), lod).rgb;
    }
    c += (c - n * 0.25) * u_sharpen * 1.6;
    c = clamp(c, 0.0, 1.0);
  }
  vec3 blurred = texture(u_blur, uv).rgb;
  float detail = luma(c) - luma(blurred);

  // --- Reduccion de ruido de color: en las sombras el color viene del promedio local,
  // el brillo se conserva. Ataca las manchas de color del ISO alto sin perder detalle. ---
  if (u_denoise > 0.0) {
    float lc = luma(c);
    float w = u_denoise * (1.0 - smoothstep(0.0, 0.5, lc));
    c = mix(c, blurred * (lc / max(luma(blurred), 0.004)), w);
  }

  // --- Exposición y balance de blancos (en luz lineal) ---
  vec3 lin = pow(c, vec3(2.2)) * exp2(u_exposure + u_subjExposure * m + u_bgExposure * bg);
  vec3 wb = vec3(1.0 + 0.32 * u_temp + 0.08 * u_tint, 1.0 - 0.18 * u_tint, 1.0 - 0.32 * u_temp + 0.08 * u_tint);
  lin *= wb / luma(wb);
  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));

  // --- Neblina ---
  if (u_dehaze > 0.0) {
    float d = u_dehaze * 0.12;
    c = (c - d) / (1.0 - d);
    c = mix(vec3(luma(c)), c, 1.0 + u_dehaze * 0.25);
  } else {
    c = mix(c, vec3(0.78), -u_dehaze * 0.35);
  }

  // --- Blancos y negros (niveles) ---
  float bp = -u_blacks * 0.08;
  float wp = 1.0 - u_whites * 0.15;
  c = (c - bp) / (wp - bp);

  // --- Altas luces y sombras ---
  float L = clamp(luma(c), 0.0, 1.5);
  float hm = smoothstep(0.45, 1.0, L);
  float sm = 1.0 - smoothstep(0.0, 0.55, L);
  float Ln = L + u_highlights * 0.28 * hm + u_shadows * 0.32 * sm * sm;
  vec3 ratio = c / max(L, 0.001);
  c += (Ln - L) * mix(vec3(1.0), ratio, 0.6);

  // --- Aclarar y quemar: exposición pintada a mano, cuidando luces y sombras ---
  if (u_hasDodge > 0.5) {
    float dv = texture(u_dodge, uv).r * 2.0 - 1.0;
    if (abs(dv) > 0.004) {
      float dl = clamp(luma(c), 0.0, 1.0);
      // Donde ya no queda margen (blanco quemado o negro pegado) el efecto se apaga
      float room = dv > 0.0 ? (1.0 - dl) : dl;
      vec3 dlin = pow(max(c, 0.0), vec3(2.2)) * exp2(dv * 1.1 * room);
      c = pow(dlin, vec3(1.0 / 2.2));
    }
  }

  // --- Claridad (contraste local en medios tonos) ---
  L = clamp(luma(c), 0.0, 1.0);
  float mid = 1.0 - pow(abs(2.0 * L - 1.0), 2.0);
  c += detail * (u_clarity + u_subjClarity * m) * 1.4 * mid;

  // --- Contraste ---
  c = clamp(c, 0.0, 1.0);
  if (u_contrast > 0.0) c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  else c = mix(c, 0.5 + (c - 0.5) * 0.45, -u_contrast);

  // --- Curva de tonos ---
  if (u_hasCurve > 0.5) {
    c = clamp(c, 0.0, 1.0);
    c = vec3(texture(u_curve, vec2(c.r, 0.5)).r,
             texture(u_curve, vec2(c.g, 0.5)).r,
             texture(u_curve, vec2(c.b, 0.5)).r);
  }

  // --- Mezcla HSL por color ---
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float hdeg = hsv.x * 360.0;
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 8; i++) {
    float dist = abs(mod(hdeg - u_hslC[i] + 180.0, 360.0) - 180.0);
    float w = max(0.0, 1.0 - dist / 42.0);
    w = w * w * (3.0 - 2.0 * w);
    dh += w * u_hslH[i]; ds += w * u_hslS[i]; dl += w * u_hslL[i];
  }
  float satMask = smoothstep(0.02, 0.25, hsv.y);
  hsv.x = fract(hsv.x + dh * 30.0 / 360.0 * satMask);
  hsv.y = clamp(hsv.y * (1.0 + ds * satMask), 0.0, 1.0);
  c = hsv2rgb(hsv);
  c *= 1.0 + dl * 0.45 * satMask * hsv.y;

  // --- Intensidad y saturación ---
  float gray = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vib = u_vibrance * (u_vibrance > 0.0 ? (1.0 - sat) * (1.0 - sat) : 1.0);
  c = mix(vec3(gray), c, 1.0 + vib);
  c = mix(vec3(luma(c)), c, 1.0 + u_saturation);
  if (u_hasMask > 0.5) c = mix(vec3(luma(c)), c, 1.0 + u_bgSaturation * bg);

  // --- Gradación de color (sombras / medios / luces) ---
  L = clamp(luma(c), 0.0, 1.0);
  float pivot = clamp(0.5 - 0.3 * u_gBalance, 0.15, 0.85);
  float ws = 1.0 - smoothstep(0.0, pivot, L);
  float wh = smoothstep(pivot, 1.0, L);
  float wm = max(0.0, 1.0 - ws - wh);
  ws *= smoothstep(0.0, 0.06, L); // el negro puro no se tine: evita el velo azul sobre el ruido
  c += u_gS * ws + u_gM * wm + u_gH * wh;

  // --- Desvanecer (negros mate) ---
  c += u_fade * 0.16 * (1.0 - smoothstep(0.0, 0.65, c));

  // --- Viñeta ---
  float aspect = u_outSize.x / u_outSize.y;
  vec2 vv = (v_uv - 0.5) * vec2(aspect, 1.0);
  float r = length(vv) / length(vec2(aspect, 1.0) * 0.5);
  float vm = smoothstep(0.3, 1.1, r);
  if (u_vignette < 0.0) c *= 1.0 + u_vignette * vm * 0.85;
  else c = mix(c, vec3(1.0), u_vignette * vm * 0.7);

  // --- Grano de película ---
  if (u_grain > 0.0) {
    float scale = (0.6 + u_grainSize * 2.4) * max(u_outSize.x, u_outSize.y) / 1600.0;
    float n = vnoise(gl_FragCoord.xy / max(scale, 0.5)) - 0.5;
    float gl = clamp(luma(c), 0.0, 1.0);
    c += n * u_grain * 0.28 * (0.35 + 0.65 * (1.0 - abs(2.0 * gl - 1.0)));
  }

  c = clamp(c, 0.0, 1.0);

  // --- Aviso de quemados y pegados: zonas sin detalle recuperable ---
  if (u_clip > 0.5) {
    if (min(c.r, min(c.g, c.b)) > 0.993) c = vec3(1.0, 0.12, 0.2);      // blanco quemado
    else if (max(c.r, max(c.g, c.b)) < 0.008) c = vec3(0.2, 0.5, 1.0);  // negro pegado
  }

  // En la segunda pasada el alfa es la mascara: asi el estilo del sujeto se
  // dibuja encima del estilo del fondo con el borde ya suavizado.
  o = vec4(c, u_alphaFromMask > 0.5 ? m : 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
  return s;
}

function program(gl: WebGL2RenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
    return cache.get(name)!;
  };
  return { p, u };
}

/** Convierte un tono (0-360) en un desplazamiento RGB que no cambia el brillo. */
export function hueOffset(hue: number, amount: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] =
    h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = amount * 0.3;
  return [(r - l) * k, (g - l) * k, (b - l) * k];
}

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export interface RenderOpts {
  /** Muestra la foto original sin ajustes. */
  bypass?: boolean;
  /** Muestra la máscara del sujeto en blanco y negro. */
  showMask?: boolean;
  /** Marca en rojo lo quemado y en azul lo pegado. */
  clip?: boolean;
  /** Saca la máscara por el canal alfa, para dibujar al sujeto encima del fondo. */
  alphaFromMask?: boolean;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly maxTexture: number;
  private main!: ReturnType<typeof program>;
  private down!: ReturnType<typeof program>;
  private blur!: ReturnType<typeof program>;
  private src: WebGLTexture | null = null;
  private mask: WebGLTexture | null = null;
  private curve: WebGLTexture | null = null;
  private brush: WebGLTexture | null = null;
  private fill: WebGLTexture | null = null;
  private dodge: WebGLTexture | null = null;
  private heal: { a: Float32Array; b: Float32Array; c: Float32Array; n: number } = { a: new Float32Array(80), b: new Float32Array(80), c: new Float32Array(80), n: 0 };
  private srcW = 0; private srcH = 0;
  private a: Target | null = null; private b: Target | null = null;
  private seed = Math.random() * 100;
  private mipmapped = true;

  /**
   * Android libera la memoria de video cuando la app se va al fondo. Al volver,
   * todo lo que teníamos en la GPU ya no existe y la foto se queda en negro.
   * Aquí lo detectamos, reconstruimos los programas y avisamos para resubir todo.
   */
  private lost = false;
  private onRestore?: () => void;

  constructor(readonly canvas: HTMLCanvasElement, readable = true, onRestore?: () => void) {
    // readable=false (camara en vivo) evita que el driver conserve el buffer: mas fps en el telefono
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: readable, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('Tu dispositivo no soporta WebGL2.');
    this.gl = gl;
    this.onRestore = onRestore;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.buildGl();

    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  /** Crea los programas y el cuadrado sobre el que se dibuja todo. */
  private buildGl() {
    const gl = this.gl;
    this.main = program(gl, MAIN);
    this.down = program(gl, DOWNSAMPLE);
    this.blur = program(gl, BLUR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  private handleLost = (e: Event) => {
    // Sin preventDefault el navegador no se molesta en devolvernos el contexto
    e.preventDefault();
    this.lost = true;
  };

  private handleRestored = () => {
    // Todo lo que vivía en la GPU se perdió: empezamos de cero
    this.src = null; this.mask = null; this.curve = null; this.brush = null; this.fill = null; this.dodge = null;
    this.a = null; this.b = null;
    this.srcW = 0; this.srcH = 0;
    try {
      this.buildGl();
      this.lost = false;
      this.onRestore?.();
    } catch {
      this.lost = true;
    }
  };

  /** true mientras la GPU no tenga nada nuestro: dibujar sería pintar negro. */
  get isLost() { return this.lost; }

  get sourceSize() { return { w: this.srcW, h: this.srcH }; }

  /** mipmap=false para video en vivo: generateMipmap cada cuadro es lo que hace lento el visor. */
  setSource(img: TexImageSource, w: number, h: number, mipmap = true) {
    const gl = this.gl;
    if (!this.src) this.src = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);
    this.mipmapped = mipmap;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w !== this.srcW || h !== this.srcH || !this.a) {
      this.srcW = w; this.srcH = h;
      const bw = Math.max(8, Math.ceil(w / 8)), bh = Math.max(8, Math.ceil(h / 8));
      this.freeTarget(this.a); this.freeTarget(this.b);
      this.a = this.target(bw, bh); this.b = this.target(bw, bh);
    }
  }

  /** Mascara del sujeto en blanco y negro, del mismo encuadre que la foto. null la quita. */
  setMask(img: TexImageSource | null) {
    const gl = this.gl;
    if (!img) {
      if (this.mask) gl.deleteTexture(this.mask);
    if (this.curve) gl.deleteTexture(this.curve);
    if (this.brush) gl.deleteTexture(this.brush);
    if (this.fill) gl.deleteTexture(this.fill);
    if (this.dodge) gl.deleteTexture(this.dodge);
      this.mask = null;
      return;
    }
    if (!this.mask) this.mask = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  get hasMask() { return !!this.mask || !!this.brush; }

  /** Pincel manual: gris 0.5 no toca nada, blanco suma al sujeto y negro le quita. */
  setBrush(img: TexImageSource | null) {
    const gl = this.gl;
    if (!img) {
      if (this.brush) gl.deleteTexture(this.brush);
    if (this.fill) gl.deleteTexture(this.fill);
    if (this.dodge) gl.deleteTexture(this.dodge);
      this.brush = null;
      return;
    }
    if (!this.brush) this.brush = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.brush);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Aclarar y quemar: gris 0.5 no toca nada, blanco aclara y negro oscurece. */
  setDodge(img: TexImageSource | null) {
    const gl = this.gl;
    if (!img) {
      if (this.dodge) gl.deleteTexture(this.dodge);
      this.dodge = null;
      return;
    }
    if (!this.dodge) this.dodge = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.dodge);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Relleno según contenido ya calculado: RGB el parche, alfa dónde se aplica. */
  setFill(img: TexImageSource | null) {
    const gl = this.gl;
    if (!img) {
      if (this.fill) gl.deleteTexture(this.fill);
    if (this.dodge) gl.deleteTexture(this.dodge);
      this.fill = null;
      return;
    }
    if (!this.fill) this.fill = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fill);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Objetos que se tapan. Máximo 20; los de más se ignoran. */
  setHeal(strokes: { x: number; y: number; r: number; dx: number; dy: number; fix: [number, number, number] }[]) {
    const n = Math.min(20, strokes.length);
    for (let i = 0; i < n; i++) {
      const s = strokes[i];
      this.heal.a.set([s.x, s.y, s.r, 0], i * 4);
      this.heal.b.set([s.dx, s.dy, 0, 0], i * 4);
      this.heal.c.set([s.fix[0], s.fix[1], s.fix[2], 0], i * 4);
    }
    this.heal.n = n;
  }

  /** Tabla de 256 valores de la curva de tonos. null la desactiva. */
  setCurve(lut: Uint8Array | null) {
    const gl = this.gl;
    if (!lut) {
      if (this.curve) gl.deleteTexture(this.curve);
    if (this.brush) gl.deleteTexture(this.brush);
    if (this.fill) gl.deleteTexture(this.fill);
    if (this.dodge) gl.deleteTexture(this.dodge);
      this.curve = null;
      return;
    }
    if (!this.curve) this.curve = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.curve);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  private freeTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fb);
  }

  render(adj: Adjustments, crop: CropRect, outW: number, outH: number, opts: RenderOpts = {}) {
    if (this.lost) return;
    const { bypass = false, showMask = false, clip = false, alphaFromMask = false } = opts;
    const gl = this.gl;
    if (!this.src || !this.a || !this.b) return;
    if (this.canvas.width !== outW) this.canvas.width = outW;
    if (this.canvas.height !== outH) this.canvas.height = outH;
    const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 1) Imagen reducida y desenfocada (para la claridad)
    gl.useProgram(this.down.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.fb);
    gl.viewport(0, 0, this.a.w, this.a.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.uniform1i(this.down.u('u_src'), 0);
    gl.uniform1f(this.down.u('u_lod'), this.mipmapped ? 3 : 0);
    draw();
    gl.useProgram(this.blur.p);
    gl.uniform1i(this.blur.u('u_src'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform2f(this.blur.u('u_dir'), 1 / this.a.w, 0);
    draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.b.tex);
    gl.uniform2f(this.blur.u('u_dir'), 0, 1 / this.a.h);
    draw();

    // 2) Revelado final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    const m = this.main;
    gl.useProgram(m.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.uniform1i(m.u('u_src'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(m.u('u_blur'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.uniform1i(m.u('u_mask'), 2);
    gl.uniform1f(m.u('u_hasMask'), this.mask ? 1 : 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.curve);
    gl.uniform1i(m.u('u_curve'), 3);
    gl.uniform1f(m.u('u_hasCurve'), this.curve ? 1 : 0);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.brush);
    gl.uniform1i(m.u('u_brush'), 4);
    gl.uniform1f(m.u('u_hasBrush'), this.brush ? 1 : 0);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.fill);
    gl.uniform1i(m.u('u_fill'), 5);
    gl.uniform1f(m.u('u_hasFill'), this.fill ? 1 : 0);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.dodge);
    gl.uniform1i(m.u('u_dodge'), 6);
    gl.uniform1f(m.u('u_hasDodge'), this.dodge ? 1 : 0);
    gl.uniform1i(m.u('u_healCount'), this.heal.n);
    if (this.heal.n > 0) {
      gl.uniform4fv(m.u('u_healA'), this.heal.a);
      gl.uniform4fv(m.u('u_healB'), this.heal.b);
      gl.uniform4fv(m.u('u_healC'), this.heal.c);
    }
    gl.uniform1f(m.u('u_showMask'), showMask ? 1 : 0);
    gl.uniform1f(m.u('u_clip'), clip ? 1 : 0);
    gl.uniform1f(m.u('u_alphaFromMask'), alphaFromMask ? 1 : 0);
    // Agrandar = menos pixeles de origen que de destino. Ahi vale la pena el bicubico.
    gl.uniform1f(m.u('u_bicubic'), crop.w < outW * 0.98 ? 1 : 0);
    gl.uniform2f(m.u('u_srcSize'), this.srcW, this.srcH);
    gl.uniform2f(m.u('u_outSize'), outW, outH);
    gl.uniform2f(m.u('u_cropCenter'), crop.cx, crop.cy);
    gl.uniform2f(m.u('u_cropSize'), crop.w, crop.h);
    gl.uniform1f(m.u('u_angle'), crop.angle);
    gl.uniform1f(m.u('u_bypass'), bypass ? 1 : 0);
    const f = (n: string, v: number) => gl.uniform1f(m.u(n), v);
    f('u_exposure', adj.exposure);
    f('u_contrast', adj.contrast / 100);
    f('u_highlights', adj.highlights / 100);
    f('u_shadows', adj.shadows / 100);
    f('u_whites', adj.whites / 100);
    f('u_blacks', adj.blacks / 100);
    f('u_temp', adj.temperature / 100);
    f('u_tint', adj.tint / 100);
    f('u_vibrance', adj.vibrance / 100);
    f('u_saturation', adj.saturation / 100);
    f('u_clarity', adj.clarity / 100);
    f('u_dehaze', adj.dehaze / 100);
    f('u_sharpen', adj.sharpen / 100);
    f('u_fade', adj.fade / 100);
    f('u_vignette', adj.vignette / 100);
    f('u_grain', adj.grain / 100);
    f('u_grainSize', adj.grainSize / 100);
    f('u_denoise', adj.denoise / 100);
    f('u_maskFeather', adj.maskFeather / 100);
    f('u_bgExposure', adj.bgExposure);
    f('u_bgBlur', adj.bgBlur / 100);
    f('u_bgSaturation', adj.bgSaturation / 100);
    f('u_subjExposure', adj.subjExposure);
    f('u_subjClarity', adj.subjClarity / 100);
    f('u_seed', this.seed);
    f('u_gBalance', adj.gradeBalance / 100);
    gl.uniform3fv(m.u('u_gS'), hueOffset(adj.gradeShadowHue, adj.gradeShadowSat / 100));
    gl.uniform3fv(m.u('u_gM'), hueOffset(adj.gradeMidHue, adj.gradeMidSat / 100));
    gl.uniform3fv(m.u('u_gH'), hueOffset(adj.gradeHighHue, adj.gradeHighSat / 100));
    gl.uniform1fv(m.u('u_hslH'), HSL_COLORS.map((c) => adj[`hsl_${c.id}_h`] / 100));
    gl.uniform1fv(m.u('u_hslS'), HSL_COLORS.map((c) => adj[`hsl_${c.id}_s`] / 100));
    gl.uniform1fv(m.u('u_hslL'), HSL_COLORS.map((c) => adj[`hsl_${c.id}_l`] / 100));
    gl.uniform1fv(m.u('u_hslC'), HSL_COLORS.map((c) => c.hue));
    draw();
  }

  /**
   * Dibuja el fondo con un estilo y, encima, al sujeto con otro.
   * Si no hay estilo de sujeto o no hay máscara, es una sola pasada como siempre.
   */
  renderSplit(bgAdj: Adjustments, subjAdj: Adjustments | null, crop: CropRect, outW: number, outH: number, opts: RenderOpts = {}) {
    this.render(bgAdj, crop, outW, outH, opts);
    if (!subjAdj || !this.hasMask || opts.bypass || opts.showMask) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    // El alfa del destino se queda en 1 para que el lienzo no quede translúcido.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.render(subjAdj, crop, outW, outH, { ...opts, alphaFromMask: true });
    gl.disable(gl.BLEND);
  }

  /** Libera la memoria de la GPU. loseContext solo para canvas temporales (exportación). */
  dispose(loseContext = false) {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    if (this.src) gl.deleteTexture(this.src);
    if (this.mask) gl.deleteTexture(this.mask);
    if (this.curve) gl.deleteTexture(this.curve);
    if (this.brush) gl.deleteTexture(this.brush);
    if (this.fill) gl.deleteTexture(this.fill);
    if (this.dodge) gl.deleteTexture(this.dodge);
    this.freeTarget(this.a); this.freeTarget(this.b);
    this.src = null; this.mask = null; this.curve = null; this.brush = null; this.fill = null; this.dodge = null; this.a = null; this.b = null;
    if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
