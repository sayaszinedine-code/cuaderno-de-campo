# Pantallas internas, fase 1: piezas comunes — diseño corto

## Intención
Las pantallas de adentro todavía "se sienten como página web": formularios a la vista, contenido angosto con media
pantalla vacía, listas de texto plano. La docente usa la app **en el celular y en la computadora**. Fase 1 aplica piezas
comunes a todas las pantallas; la fase 2 (rediseño a fondo de la pantalla más usada, probablemente Cuaderno) va aparte.

## Metas
- **Filtros plegables** (`FilterBar`): buscador con lupa siempre visible + botón «Filtros (n)» que abre los filtros en
  una hoja inferior en el celular y en un panel desplegable en computadora; filtros activos como chips con «✕» y
  «Limpiar». Se aplica en Cuaderno (5 filtros) y en las pantallas con 2+ filtros donde ayude (Niños, Unidades).
- **Listas como tarjetas**: avatar con iniciales del niño (color estable por nombre), fecha, chips de área/tipo,
  estado hover/presionado. Cuaderno en 1 columna (celular) / 2–3 columnas (computadora); Niños y Unidades igual.
- **Botón flotante «+»** (`Fab`) en el celular para la acción principal de cada pantalla (Nuevo registro, Agregar
  niño, Nueva unidad, Nuevo evento); en computadora se queda el botón normal de la cabecera de página.
- **Ancho completo en computadora**: quitar los `max-w-2xl/3xl` de las pantallas de listas y usar rejillas; los
  formularios largos conservan un ancho cómodo de lectura.
- **Cabecera de página común** (`PageHeader`): título, subtítulo opcional (p. ej. «12 registros»), acción principal.
- **Estados vacíos y de carga** (`EmptyState`, `Skeleton`): icono + texto + botón de acción; siluetas grises mientras
  carga en lugar de texto «Cargando…».
- Retoque menor pendiente de la fase anterior: Inicio deja de repetir «¡Hola, …!» bajo el saludo de la cabecera.

## No-metas
- No se cambia lógica, datos, almacenamiento, ni qué filtra cada filtro.
- No se rediseña a fondo ninguna pantalla (eso es la fase 2). Notas/Asistencia/Agenda solo reciben cabecera, ancho,
  estados vacíos y «+» donde aplique; sus tablas no cambian.

## Anti-metas
- Que desaparezca una pantalla, un filtro, un botón o un dato.
- Que algo deje de poder hacerse con teclado o lector de pantalla (los filtros siguen con sus etiquetas: «Niño o niña»,
  «Área», «Competencia», «Bimestre», «Tipo»).
- Que se rompa el uso sin internet o los tests.

## Enfoques considerados
- A. Piezas comunes en todas las pantallas — esta fase.
- B. Rediseño a fondo de 2–3 pantallas — fase 2.
- **C. A y luego B en la pantalla más usada** — elegido por la docente.

## Decisiones del cómo (de Claude, corregibles)
- Componentes nuevos en `src/components/ui/`: `PageHeader`, `FilterBar` (+ `FilterChips`), `Fab`, `Avatar`,
  `EmptyState`, `Skeleton`. Sin dependencias nuevas; iconos de `components/icons.tsx` (se agregan «buscar», «filtro»,
  «cerrar», «mas-simple»).
- La hoja inferior del celular es un `<dialog>` nativo (foco atrapado y Escape gratis); en computadora el mismo
  contenido se muestra como panel bajo el buscador.
- E2E que usan `getByLabel("Niño o niña")` etc. se ajustan para abrir «Filtros» primero; verifican lo mismo.

## Para quien lo construya
- Tamaños, colores de avatar y animaciones finas siguiendo `src/styles/theme.css`.
- Qué pantallas con un solo filtro conservan el select a la vista (se decide por pantalla: si cabe en una línea, se
  queda).
