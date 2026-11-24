# Cuaderno a fondo (fase 2) — diseño corto

## Intención
Yadira usa la app en el celular durante la clase y en la computadora después. Hoy «Nuevo registro» es una página de
13 campos: en clase cuesta. Queremos **registrar en ~30 segundos en el celular** y **completar después** en la
computadora, con una lista que se lea como línea de tiempo y una vista de lectura de cada registro.

## Metas
1. **Registro en 2 pasos (enfoque A, misma pantalla reorganizada)** en `cuaderno/registro`:
   - Arriba, «Lo esencial»: Niños y niñas (chips con iniciales), «¿Qué hizo o dijo? Describe los hechos», «Agregar
     fotos» (botón grande de cámara), Tipo. Botón **«Guardar rápido»** fijo abajo en el celular.
   - Fecha, Aula y Momento de la jornada se rellenan solos (hoy, última aula, último momento: ya se recuerdan) y se
     muestran como una línea resumen «Hoy · Girasoles · Taller — Cambiar» que despliega esos 3 campos.
   - Debajo, sección plegable **«Completar ahora»** con Área, Competencia, Desempeños, Interpretación, Reflexión y
     Nivel de logro. Abierta por defecto en computadora (≥ md) y al editar un registro que ya tiene área; plegada en
     el celular para registros nuevos.
   - Un solo botón de guardar con el mismo comportamiento de hoy (en computadora se llama «Guardar registro»).
2. **«Por completar»**: un registro sin área es «Por completar» (derivado, sin cambiar datos). Se muestra como
   etiqueta en la tarjeta y en la vista de lectura, y como filtro nuevo **«Estado»** (Todos / Por completar /
   Completos) en la barra de filtros de Cuaderno. Inicio muestra «N registros por completar» con enlace al filtro.
3. **Lista como línea de tiempo** en Cuaderno: grupos por día con encabezado «Hoy», «Ayer» o «12 nov» (con el año si no
   es el actual), fotos más grandes en la tarjeta (miniaturas de 96 px, hasta 4), etiqueta «Por completar».
4. **Vista de lectura** nueva `cuaderno/ver/?id=`: fecha, niños con avatar, tipo/área/competencia, texto completo,
   fotos grandes (toque para ampliar), interpretación, reflexión, nivel; botones «Editar» (va a `registro?id=`) y
   «Volver». La tarjeta enlaza aquí con «Abrir»; «Editar» lleva al formulario.

## No-metas
- No cambia el formato de los datos ni `validateNote`; no se agregan campos.
- No se toca la IA (botones de IA del formulario siguen donde están, dentro de «Completar ahora» o junto a su campo).
- No se rediseñan otras pantallas.

## Anti-metas
- Perder un campo, un dato o una foto; que «Guardar rápido» guarde distinto que el guardado de hoy.
- Que en la computadora haya que hacer más clics que hoy para un registro completo.
- Romper el uso sin internet.

## Enfoques considerados
- **A. Misma pantalla reorganizada** — elegido: un solo formulario, misma lógica de fotos/guardado, riesgo bajo.
- B. Hoja rápida aparte desde el «+»: más «app» pero duplica formulario, fotos y validación.
- C. Asistente por pasos: obliga a pasar pantallas también en computadora.

## Decisiones del cómo (de Claude, corregibles)
- «Completar ahora» es un `<details>` nativo (como los filtros), así los campos siguen en la página y accesibles por
  etiqueta; se abre con `open` según ancho (`matchMedia("(min-width: 768px)")`) y estado del registro.
- Los E2E/tests que abren un registro con «Abrir» y luego «Eliminar registro» pasan por «Editar» primero.
- `isPending(note) = !note.areaId` en `domain/notes.ts`, con test.

## Para quien lo construya
- Textos exactos de encabezados de día y del resumen; tamaños; animaciones siguiendo `theme.css`.
