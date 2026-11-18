# Nakamura Twins Studio 📸

App de Android para editar fotos como en Lightroom y **aprender fotografía** con las gemelas Nakamura,
dos personajes de IA:

- **Aiko**: encuadre y composición.
- **Mei**: luz y color.

## Qué hace

- **Abrir de la galería**: carga la foto original (incluidas las de modo Pro) y lee ISO, velocidad, apertura y lente.
- **Cámara del teléfono**: abre la cámara del Redmi (con modo Pro), y al regresar la foto ya trae aplicado el Auto Pro y el estilo.
- **Cámara Studio**: visor en vivo con el estilo aplicado, cuadrícula de tercios, nivel de horizonte y consejos de las gemelas antes de disparar.
- **Auto Pro**: analiza la exposición, el balance de blancos y el contraste, y corrige como lo haría un fotógrafo.
- **Estilos**: Caballero de la Noche (estilo Nolan), City Pop, Candy, Neón Nocturno, Concreto, Hora Dorada (teal & orange), Calle B/N y los estilos que tú guardes.
- **Controles tipo Lightroom**: Luz, Color, Mezcla HSL por color, Gradación de color, Efectos (claridad, neblina, nitidez, desvanecer, viñeta y grano), Recorte y enderezado (con formato de cine 2.39:1).
- **Aprende mientras editas**: cada control explica qué hace al moverlo. Toca el nombre para ver la explicación y dale doble toque para restablecerlo.
- **Gemelas (Gemini)**: califican la foto, dan consejos de encuadre y color, sugieren estilo, recorte y ajustes, y dejan una lección.
- **Guardar** (proyecto editable), **Exportar** en JPG de máxima calidad al álbum *Nakamura Twins Studio*, **Compartir**, **Deshacer y rehacer**, **Antes/después** (mantén presionado el ojo), y **Copiar y pegar ajustes**.

## Instalar en el teléfono

1. Descarga el APK: en GitHub ve a **Actions › Construir APK ›** la última ejecución **› Artifacts**.
2. En el Redmi, abre el archivo y acepta "Instalar apps de origen desconocido".
3. En la app, ve a **Ajustes ⚙️** y pega tu API key de Gemini (de https://aistudio.google.com/apikey).
   La key se guarda solo en tu teléfono.

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
- `src/ai/twins.ts`: los nombres y personalidades de las gemelas (cámbialos aquí).
- `src/ai/gemini.ts`: los prompts y la conexión con Gemini.
