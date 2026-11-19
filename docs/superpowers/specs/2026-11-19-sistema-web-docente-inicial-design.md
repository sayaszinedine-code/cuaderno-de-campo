# Sistema web para docentes de Educación Inicial — Diseño

Fecha: 2026-11-19 · Estado: borrador para aprobación

## 1. Intención y por qué

Hoy existe una app de cuaderno de campo (HTML/JS de un solo archivo, APK con Capacitor) que guarda los datos en el dispositivo de cada docente. El cliente pide convertirla en un **sistema web completo para la docente de Educación Inicial**, que:

- separe el trabajo por **ciclo I (0–2 años)** y **ciclo II (3–5 años)** según el Programa Curricular de Educación Inicial (MINEDU, RM 281-2016, modificado por RM 159-2017);
- siga la **ficha de cuaderno de campo** de la presentación del cliente;
- agregue **registro de notas por bimestre** y **gestión de unidades y sesiones**, como un sistema de colegio, pero centrado en la docente;
- lo usen **muchas docentes**, cada una con su cuenta, con **acceso aprobado por el cliente**;
- **no le cueste nada al cliente**: la docente entra por una página web, pero **sus datos y archivos se guardan en su propia computadora**, en una carpeta que puede ver y entender.

La definición del cliente (diapositiva 4) guía el tono: el cuaderno de campo es un **instrumento pedagógico y reflexivo, personal y profesional**, no un registro administrativo.

Fuentes en `docs/fuentes/`:
- `programa-curricular-educacion-inicial.pdf` (edición 2017);
- `curriculo-nacional-de-la-educacion-basica.pdf` (CNEB 2016);
- `cuaderno-de-campo-2026.pptx` (portada, datos personales, definición y ficha de registro).

## 2. Usuarios

| Rol | Quién | Qué hace |
|---|---|---|
| **Docente** | Cada profesora de inicial | Usa todo el sistema. Sus datos viven en su computadora. |
| **Administrador** | El cliente | Aprueba, suspende o reactiva cuentas. Solo ve los datos de registro de cada docente (nombre, correo, institución, UGEL, región, estado). **Nunca ve datos pedagógicos ni de niños**, porque estos no salen de la computadora de la docente. |

No hay cuentas de directora, padres ni alumnos (no-objetivo).

## 3. Arquitectura (decisión del usuario: opción A)

```
 Navegador de la docente (Chrome/Edge en PC)
 ┌──────────────────────────────────────────────┐
 │  Página web (archivos estáticos, hosting     │
 │  gratuito: Vercel / Netlify)                 │
 │                                              │
 │  ├─ Inicio de sesión ──► Supabase (plan      │
 │  │                       gratis: SOLO cuentas│
 │  │                       y estado de         │
 │  │                       aprobación)         │
 │  │                                           │
 │  └─ Datos y archivos ──► Carpeta local       │
 │                          "Cuaderno de Campo" │
 │                          en su computadora   │
 │                                              │
 │  IA opcional ──► DeepSeek o Claude con la    │
 │                  clave propia de la docente  │
 └──────────────────────────────────────────────┘
```

- **Hosting**: sitio estático gratuito. El stack sigue la elección del usuario (Next.js), con **exportación estática** (`output: "export"`) y sin servidor propio.
- **Cuentas**: Supabase Auth + una tabla `profiles` (datos de registro y estado). Ningún dato pedagógico va a Supabase. Cabe con holgura en el plan gratuito.
- **Almacenamiento local**: la docente elige una vez una carpeta (p. ej. `Documentos/Cuaderno de Campo`). El sistema escribe ahí con la **File System Access API** (Chrome y Edge de escritorio) y recuerda el permiso. En navegadores sin esa API (Firefox, Safari, celulares), los datos se guardan en el almacenamiento interno del navegador (IndexedDB/OPFS), y el sistema avisa que conviene usar Chrome o Edge en la PC y exportar respaldos.
- **Sin conexión**: tras iniciar sesión, la página se instala como PWA y funciona sin internet. Revalida la cuenta en línea al menos cada **30 días**. Si la cuenta está suspendida, solo permite exportar.

### Estructura de la carpeta local (legible para la docente)

```
Cuaderno de Campo/
├── 2026/
│   ├── datos/                     ← archivos JSON del sistema (no editar a mano)
│   └── Aula Girasoles (4 años)/
│       ├── Niños/
│       │   └── Quispe Huamán, Valentina/
│       │       └── Evidencias/    ← fotos del cuaderno de campo
│       ├── Unidades y sesiones/
│       │   └── Bimestre 1/
│       │       └── Unidad 1 - Mi familia/   ← Word, PDF, PPT adjuntos
│       └── Reportes/              ← PDF y Excel generados
└── Respaldos/                     ← copias automáticas comprimidas (.zip)
```

Los datos estructurados se guardan como JSON por año escolar, con escritura atómica (archivo temporal y luego reemplazo). Las fotos y adjuntos se guardan como archivos normales, con nombres legibles.

## 4. Objetivos

1. **Registro y aprobación**: la docente se registra con correo y contraseña, completa su perfil y queda "pendiente" hasta que el administrador la aprueba. La pantalla de inicio le muestra su estado. Recuperación de contraseña por correo (Supabase).
2. **Perfil de la docente** (diapositiva 3): nombres, apellidos, teléfono, región, domicilio, correo, nivel (Inicial), UGEL e institución. Los campos de registro (nombre, correo, institución, UGEL, región) van a Supabase; el resto queda local.
3. **Elegir la carpeta** de trabajo la primera vez, con explicación clara, y poder cambiarla luego.
4. **Año escolar y bimestres**: 4 bimestres con fechas editables. Se pueden consultar años anteriores.
5. **Aulas** con **ciclo** (I o II) y **grupo de edad**:
   - Ciclo I: grupos de 0–9, 9–18, 18–24 y 24–36 meses (desempeños de referencia a los 9, 18, 24 y 36 meses).
   - Ciclo II: 3, 4 o 5 años.
   - Un aula puede ser **multiedad**.
6. **Niños y niñas**: nombres y apellidos, fecha de nacimiento (edad calculada), DNI opcional, apoderado y teléfono, lengua materna, salud o NEE, foto opcional.
7. **Currículo cargado** (catálogo de solo lectura incluido en la página): áreas, competencias, capacidades y **desempeños por edad**.
   - Ciclo I: 4 áreas y 7 competencias (Personal Social: Construye su identidad, Convive y participa democráticamente; Psicomotriz: Se desenvuelve de manera autónoma a través de su motricidad; Comunicación: Se comunica oralmente en su lengua materna; Descubrimiento del mundo: Resuelve problemas de cantidad, Resuelve problemas de forma, movimiento y localización, Indaga mediante métodos científicos).
   - Ciclo II: 6 áreas y 14 competencias (Personal Social 3, incluida Educación Religiosa; Psicomotriz 1; Comunicación 4; Castellano como segunda lengua 1; Matemática 2; Ciencia y Tecnología 1; y 2 transversales: TIC y Gestiona su aprendizaje).
8. **Cuaderno de campo** (diapositiva 5): cada registro tiene fecha, aula (grado y sección), niño, niños o grupo, **evidencias** (fotos), área, competencia, **desempeño(s)** elegidos de la lista, **interpretación en relación al desempeño** y **reflexión docente en relación a la actividad**. Se conservan de la app el momento de la jornada, el tipo de registro y el nivel de logro opcional. Filtros por niño, área, competencia, bimestre y tipo, más búsqueda de texto. Debe poder llenarse en menos de un minuto.
9. **Registro de notas por bimestre**: tabla **niño × competencia** por aula y bimestre, con nivel de logro y **conclusión descriptiva**. Desde cada celda se ven las evidencias de ese niño, esa competencia y ese bimestre. Vista anual consolidada por niño.
10. **Unidades y sesiones**: por aula y bimestre. Cada unidad (o experiencia o proyecto) tiene título, fechas, propósito, competencias y desempeños, descripción y **archivos adjuntos** (Word, PDF, PPT, imágenes) que se copian a su carpeta. Lo mismo para cada sesión dentro de una unidad. Las sesiones se pueden enlazar con registros del cuaderno.
11. **Asistencia** diaria (P/T/F/J) con resumen mensual y por bimestre.
12. **Agenda** (calendario de actividades, reuniones y entregas).
13. **Asistente de IA opcional** (heredado de la app): redactar observaciones de forma objetiva, sugerir competencia y desempeño, redactar conclusiones descriptivas con las evidencias del bimestre, y redactar comunicados, actas y borradores de sesión. "Describir la foto" solo está disponible con el proveedor Claude.
14. **Reportes** (se guardan en `Reportes/` y se pueden abrir o imprimir):
    - portafolio de evidencias por niño (PDF);
    - **informe de progreso** por niño y bimestre (PDF);
    - registro de notas del aula por bimestre (Excel);
    - asistencia mensual (Excel);
    - cuaderno de campo del periodo (PDF), con portada y ficha en el estilo de la presentación del cliente.
15. **Respaldos**: copia `.zip` automática semanal en `Respaldos/`, recordatorio para copiarla a un USB o a Drive, **restaurar** desde un `.zip`, y **mover a otra computadora** (exportar todo e importarlo allá).
16. **Importar la app actual**: leer el JSON de "Descargar respaldo completo" de la app o APK (formato en `cuaderno-app/www/index.html`, funciones `respaldo` y `restaurar`) hacia un aula.
17. **Panel de administrador**: lista de docentes con estado (pendiente, activa, suspendida), fecha, institución, UGEL y región; aprobar, suspender o reactivar; búsqueda.
18. **Diseño** cercano a la presentación del cliente: ilustraciones infantiles de línea suave como fondo, colores alegres con buena legibilidad, modo claro y oscuro. Pensado sobre todo para la **PC**, pero usable en celular.

## 5. No-objetivos (v1)

- Datos en la nube, o sincronización entre computadora y celular.
- Cuentas de directora, padres o alumnos; pagos en línea.
- Integración con SIAGIE; niveles primaria o secundaria.
- Video y audio como evidencia (solo fotos y documentos).
- App nativa nueva (el APK actual sigue disponible, sin sincronización).
- Cifrado de la carpeta local (la protege la cuenta de usuario de la computadora).

## 6. Anti-objetivos

- Que un dato de un niño salga de la computadora sin una acción explícita de la docente (solo pasa con la IA, si ella la activa).
- Que la docente pierda su trabajo sin aviso: el sistema debe recordar los respaldos y advertir si no tiene uno reciente.
- Que el sistema genere costos fijos al cliente.
- Que la docente tenga que escribir a mano desempeños que el currículo ya define.
- Que la carpeta local sea incomprensible para la docente.

## 7. Restricciones

- **Costo cero para el cliente**: hosting estático gratuito y plan gratuito de Supabase usado solo para cuentas. El proyecto gratuito de Supabase se pausa tras 7 días sin actividad; con uso diario no ocurre, y se documenta cómo reactivarlo.
- **Navegador recomendado**: Chrome o Edge en PC (File System Access API).
- **Ley N.° 29733**: los datos de menores quedan en la computadora de la docente. Supabase solo guarda los datos de registro de la docente, con su consentimiento. La IA requiere un consentimiento aparte.
- **Control de acceso práctico, no infalible**: como los datos y la lógica están en el navegador, alguien con conocimientos técnicos podría usar la página sin cuenta aprobada. Se acepta, porque no expone datos de nadie: solo su propia carpeta.
- Interfaz en español (Perú); código, identificadores y commits en inglés.

## 8. Enfoques considerados

**Primera ronda (stack)**: Next.js + Supabase (elegido), HTML/JS actual + Supabase, Laravel o Django en un VPS.

**Segunda ronda (dónde viven los datos)**, tras el requisito de costo cero:

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Web + carpeta local + login gratis** (elegido) | Costo cero; el cliente controla el acceso; la docente ve sus archivos | Sin sincronización; el respaldo depende de la docente; carpeta real solo en Chrome y Edge |
| B. Web sin cuentas | Lo más simple | El cliente pierde el control de acceso |
| C. Programa instalable (Electron/Tauri) | Carpeta local en cualquier sistema | Hay que instalarlo y actualizarlo en cada PC; no es "web" |

## 9. Decisiones del usuario

- Sistema **web**, para **muchas docentes**, con **registro sujeto a aprobación** del cliente.
- Solo la **docente** usa el sistema pedagógico; el cliente administra cuentas.
- **Costo cero**: datos y archivos **en la computadora de la docente**, no en la nube (opción A).
- Stack: **Next.js + Supabase** (Supabase solo para cuentas).
- **Ciclo I**: cada aula elige "solo conclusión descriptiva" (por defecto) o "AD/A/B/C + conclusión". El ciclo II usa siempre AD/A/B/C + conclusión.
- **IA sin costo para el cliente**: cada docente usa su propia clave. DeepSeek como opción económica.

## 10. Decisiones del asistente (corregibles)

- **Competencias por aula**: se activan por defecto todas las del ciclo, y la docente puede desactivar las que no aplican (Castellano como segunda lengua, Educación Religiosa, transversales). Notas e informes muestran solo las activas.
- **Edad para elegir desempeños**: la edad del niño en la fecha del registro.
  - Ciclo I: se usa el hito siguiente o igual (9, 18, 24 o 36 meses).
  - Ciclo II: la edad del aula (edad cumplida al 31 de marzo); en aulas multiedad, la de cada niño.
  - La docente puede cambiar la edad con un selector.
- **Nivel final del año**: por defecto, el del último bimestre calificado (no se promedia). La docente puede cambiarlo.
- **Cuentas suspendidas**: no pueden registrar nada nuevo, pero siempre pueden abrir su carpeta, exportar y respaldar. Los datos son suyos.
- **IA**: desactivada por defecto. Al activarla, la docente acepta un consentimiento que nombra al proveedor y dónde procesa los datos (DeepSeek: China; Anthropic: EE. UU.). Los nombres de los niños se reemplazan por iniciales antes de enviar. Las fotos solo se envían con Claude y tras un clic explícito. La clave de API se guarda solo en ese navegador.
- **Proveedores de IA**: interfaz común con dos implementaciones, DeepSeek (API compatible con OpenAI, modelo de chat, solo texto) y Claude (SDK oficial de Anthropic, `claude-opus-5-5`, texto e imagen). Si DeepSeek no permite llamadas directas desde el navegador (CORS), se usa una función gratuita de Supabase (Edge Function) como intermediario, que reenvía la clave de la docente sin guardarla.
- **Reportes** generados en el navegador: PDF con `@react-pdf/renderer` (o una vista de impresión) y Excel con `exceljs`.
- **Calidad**: TypeScript estricto. Tests unitarios de la lógica (edad, desempeños por edad, consolidado de notas, importación del respaldo, lectura y escritura de la carpeta con un sistema de archivos simulado). Test de las políticas RLS de `profiles` (una docente solo ve su perfil; solo el admin cambia estados). E2E con Playwright de los flujos principales.

## 11. Lo que queda al constructor

- Estructura del proyecto, librería de UI, formularios y estado.
- Extracción y limpieza de los desempeños desde el PDF (texto a dos columnas; requiere revisión manual).
- Formato interno de los JSON y su versionado o migraciones.
- Detalles visuales siguiendo la presentación del cliente.
- Despliegue (Vercel o Netlify) y configuración del proyecto de Supabase.
