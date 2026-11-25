# Tema colorido de inicial — diseño corto

## Intención
La web debe sentirse de **Educación Inicial**: alegre y colorida como la presentación «Cuaderno de Campo 2026»
(verde lima, rosado, lila, naranja, celeste), pero cómoda para que la docente la use horas. Nuevo logo propio.

## Decisiones de la docente (vistas en bocetos)
- **Estilo B — pastel, un color por sección**:
  Inicio amarillo · Cuaderno rosado · Niños celeste · Notas naranja · Asistencia verde lima · Agenda y Reportes lila ·
  Aulas/Unidades/Perfil/Carpeta/Cuenta en tonos de la misma paleta.
- **Logo 1 — cuaderno rosado de espiral con crayón naranja**, nombre «Cuaderno de Campo» en letra redondeada con
  «Campo» en los 5 colores.

## Metas
1. **Paleta nueva** en `theme.css` (claro y oscuro): fondo crema `#FFF9F0`, texto `#3b2f5c`; por color un tono fuerte
   (texto/íconos) y uno suave (fondos): rosa `#E0408F/#FFE0F0`, celeste `#1A9BD7/#DDF4FF`, naranja `#E8890C/#FFEFD6`,
   lima `#5E9A0A/#EAFBC8`, lila `#8A4FD8/#F0E6FF`, amarillo `#C98A00/#FFF3D6`. Botón principal rosa con sombra inferior.
   Contraste AA para texto sobre fondos suaves (ajustar tonos si no llega).
2. **Color por sección**: menú (lateral y barra inferior) con cada ícono sobre su cuadradito de color y la sección activa
   pintada en su color; cabecera de página (`PageHeader`) con una franja/ícono del color de la sección; accesos rápidos de
   Inicio, tarjetas y botón «+» en el color de su sección.
3. **Tipografía**: títulos en **Fredoka**, texto en **Nunito**, autoalojadas con `next/font` (funcionan sin internet).
4. **Logo nuevo** en SVG: `public/logo.svg`, íconos PNG regenerados (`icon-192`, `icon-512`, `icon-maskable-512`,
   `favicon`), `manifest` y `theme-color` con la paleta. Marca con «Campo» multicolor en menú, portada y pantallas de
   cuenta.
5. **Portada y cuenta** con la paleta (tarjetas de funciones cada una en su color).
6. **Limpieza de estilos**: pasar las clases antiguas sin capa (`.card`, `.btn-*`, `.field`) a `@layer components` para que
   las utilidades funcionen (arregla «Completar ahora» centrado y el borde al pasar el mouse).

## No-metas
- No cambia lógica, datos, textos de botones/etiquetas ni pantallas.
- No se usan los dibujos de la presentación (derechos de autor de terceros); nada de ilustraciones nuevas en esta vuelta.

## Anti-metas
- Que se lea peor (contraste bajo) o que cambien nombres accesibles y se rompan pruebas.
- Que deje de funcionar sin internet (fuentes externas).
- Arcoíris saturado en todas partes (eso era el estilo A, descartado).

## Enfoques considerados
- **Tema por tokens + color por sección** (elegido): todo se pinta desde variables y un mapa sección→color; riesgo bajo.
- Rediseño pantalla por pantalla con ilustraciones propias: más llamativo, mucho más trabajo; para después si hace falta.
- Estilo A arcoíris fiel a la presentación: descartado por la docente en el boceto.

## Para quien lo construya
- Tonos exactos tras medir contraste; versión oscura de cada color; detalles de sombras y radios.
- Mapa sección→color en un solo archivo (`src/components/sections.ts`) usado por menú, cabeceras y accesos.
