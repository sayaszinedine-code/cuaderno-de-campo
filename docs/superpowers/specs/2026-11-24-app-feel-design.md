# Sensación de app — diseño corto

## Intención
La docente nota que el sistema web "se siente como una página común". Queremos que se vea y responda como una app,
sin borrar ninguna pantalla, función ni dato.

## Metas
- Portada (`/`) y pantallas de cuenta (login, registro, recuperar) con logo, colores del tema y explicación breve de la app.
- Menú con iconos: barra lateral en computadora, barra inferior en celular (y el menú «Más»).
- Cabecera tipo app: logo, saludo con el nombre de la docente que inició sesión, tomado de su perfil («Hola, Ana»;
  si no hay nombre, solo «Hola»), selector de año y acceso a perfil sin subrayado. La web es pública y para muchas
  docentes: **ningún nombre fijo** (p. ej. «Miss Yosselin») en la portada ni en el código web.
- Avisos flotantes («Guardado ✓», errores) que aparecen y desaparecen solos.
- Transición suave al cambiar de pantalla (respetando «reducir movimiento»).
- Botón «Instalar app» cuando el navegador lo permite; se oculta si ya está instalada.

## No-metas
- No se rediseñan las pantallas internas una por una (opción B, queda para después).
- No se cambia la lógica, el almacenamiento, Supabase ni el formato de los datos.

## Anti-metas (sería un fracaso aunque "funcione")
- Que desaparezca alguna pantalla, enlace o función existente.
- Que se pierdan o se muevan datos de las docentes.
- Que deje de funcionar sin internet o que se rompan los tests existentes.

## Enfoques considerados
- **A. Sensación de app en las piezas compartidas** (elegido por la docente): mejora todas las pantallas a la vez tocando lo común; riesgo bajo.
- B. A + rediseño pantalla por pantalla: más completo, varias veces más trabajo y riesgo.
- C. Solo portada y login: rápido, pero el interior seguiría igual.

## Decisiones del cómo (llamadas de Claude, corregibles)
- Iconos como SVG propios en `src/components/icons.tsx`: sin dependencias nuevas.
- Avisos: `ToastProvider` + `useToast()` en el layout; se llaman en los puntos de guardado existentes. Los mensajes
  `role="status"` actuales se mantienen (no se borra nada).
- Transición: animación CSS de entrada en `<main>` con `key={pathname}`; desactivada con `prefers-reduced-motion`.
- Instalar: escuchar `beforeinstallprompt`; botón en la cabecera (computadora) y en «Más» (celular).
- Pantallas de cuenta: reemplazar clases azul/gris fijas por `.card`, `.field`, `.btn-primary` del tema; mismo comportamiento.
- Logo: el icono existente `public/icons/icon-192.png`.

## Para quien lo construya
- Detalles visuales finos (tamaños, espaciados, textos de la portada), siguiendo `src/styles/theme.css`.
- Ajustar tests unitarios/E2E que dependan de textos o estructura del menú sin cambiar lo que verifican.
