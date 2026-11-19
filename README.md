# Nakamura Twins Studio 📸

App de Android para editar fotos como en Lightroom y **aprender fotografía** con las gemelas Nakamura,
dos personajes de IA:

- **Tsuki**: la nerd de matemáticas y música. Técnica y encuadre (exposición, histograma, geometría).
- **Yami**: la artista cosplayer. Color, ambiente y pose.

## Qué hace

- **Abrir de la galería**: carga la foto original (incluidas las de modo Pro) y lee ISO, velocidad, apertura y lente.
- **Cámara Studio**: visor en vivo (1080p) con el estilo aplicado, cuadrícula de tercios, nivel de horizonte, medidor de pulso firme y consejos de las gemelas antes de disparar.
- **Separar sujeto del fondo**: un modelo de IA que corre dentro del teléfono (sin internet) recorta a las personas, para ajustar la luz, el color y el desenfoque del fondo sin tocar al sujeto.
- **Reducir ruido**: limpia las manchas de color de las sombras cuando disparas con ISO alto. El Auto Pro lo ajusta solo según el ISO de la foto.
- **Auto Pro**: analiza la exposición, el balance de blancos y el contraste, y corrige como lo haría un fotógrafo.
- **Estilos**: Caballero de la Noche (estilo Nolan), City Pop, Candy, Neón Nocturno, Concreto, Hora Dorada (teal & orange), Calle B/N y los estilos que tú guardes.
- **Controles tipo Lightroom**: Luz, Color, Mezcla HSL por color, Gradación de color, Efectos (claridad, neblina, nitidez, desvanecer, viñeta y grano), Recorte y enderezado (con formato de cine 2.39:1).
- **Aprende mientras editas**: cada control explica qué hace al moverlo. Toca el nombre para ver la explicación y dale doble toque para restablecerlo.
- **Gemelas (Gemini o Groq)**: califican la foto, dan consejos de encuadre y color, sugieren estilo, recorte y ajustes, y dejan una lección.
- **Gotero de balance de blancos**: tocas un gris o un blanco de la foto y calcula la temperatura y el matiz que lo dejan neutro. Pensado para luces de escenario.
- **Avisar quemados y pegados**: marca en rojo lo que salió blanco total y en azul lo que salió negro total, para no entregar un traje blanco sin textura.
- **Guardar** (proyecto editable), **Exportar** en JPG de máxima calidad al álbum *Nakamura Twins Studio*, **Exportar para redes** (2048 px), **Compartir**, **Deshacer y rehacer**, **Antes/después** (mantén presionado el ojo), y **Copiar y pegar ajustes**.

## Instalar en el teléfono

1. Descarga el APK: en GitHub ve a **Actions › Construir APK ›** la última ejecución **› Artifacts**.
2. En el Redmi, abre el archivo y acepta "Instalar apps de origen desconocido".
3. En la app, ve a **Ajustes ⚙️**, elige proveedor y pega tu API key. Se guarda solo en tu teléfono.
   - Gemini: https://aistudio.google.com/apikey
   - Groq: https://console.groq.com/keys

   Puedes guardar las dos y cambiar de proveedor cuando se te acabe la cuota de una.

## Lo que la app NO puede hacer

- **Capturar RAW/DNG en la Cámara Studio.** La app corre dentro de un WebView y Android no le da
  acceso al sensor en crudo; solo entrega cuadros ya procesados. Para RAW usa el modo Pro del
  teléfono: guarda el DNG y un JPG al lado, y la app abre ese JPG.
- **Abrir la cámara del teléfono en modo Pro.** Android no permite pedirle a otra app de cámara que
  arranque en un modo concreto ni con ciertos parámetros, así que ese botón se quitó: dispara en Pro
  desde la cámara del teléfono y abre la foto con "Abrir de la galería".
- **Abrir archivos DNG o HEIC.** Expórtalos antes como JPG desde la galería.

## Desarrollo

```bash
npm install
npm run dev               # probar en el navegador
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # APK en android/app/build/outputs/apk/debug/
```

Código principal:

- `src/engine/renderer.ts`: motor de revelado en WebGL2 (la GPU).
- `src/engine/presets.ts`: los estilos y sus recetas.
- `src/engine/analyze.ts`: el Auto Pro.
- `src/engine/adjustments.ts`: los controles y sus explicaciones.
- `src/engine/segment.ts`: separación del sujeto (MediaPipe, modelo en `public/mp/`).
- `src/ai/twins.ts`: los nombres y personalidades de las gemelas (cámbialos aquí).
- `src/ai/vision.ts`: los prompts y la conexión con Gemini o Groq.
