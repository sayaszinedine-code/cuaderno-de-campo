# Sistema web docente — Plan 4: Asistencia, agenda, reportes, respaldos y uso sin conexión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La docente puede:
- tomar asistencia diaria y llevar su agenda;
- generar los reportes oficiales en PDF y Excel, que se guardan en su carpeta `Reportes/`;
- hacer respaldos `.zip`, restaurarlos y mover todo a otra computadora;
- importar lo que tenía en la app anterior;
- usar el sistema instalado y sin internet.

**Architecture:**
- **Datos:** dos documentos nuevos por año, `asistencia.json` y `agenda.json`, con el mismo `loadDoc`/`saveDoc`, guarda, `.loose()` y cola con guarda de año.
- **Reportes:** se generan en el navegador con librerías que se cargan bajo demanda (`import()` dinámico), así no pesan en las demás páginas.
- **Respaldos:** comprimen la carpeta completa (salvo `Respaldos/`) en un `.zip` con un manifiesto. La restauración nunca mezcla datos: escribe en una carpeta vacía o reemplaza solo tras una confirmación explícita.
- **Uso sin conexión (PWA):** un service worker precachea el export estático.

**Tech Stack:** el de los Planes 1-3, más **dependencias nuevas**:
- `fflate`: zip y unzip, pequeña y sin dependencias.
- `exceljs`: Excel.
- `@react-pdf/renderer`: PDF.

Las tres se cargan con `import()` dinámico.

**Spec:** `docs/superpowers/specs/2026-11-19-sistema-web-docente-inicial-design.md`. Cubre los objetivos 11-16 y las secciones 3 (sin conexión), 5 y 6.

## Global Constraints

- **Asistencia:**
  - Valores `P` Presente, `T` Tardanza, `F` Falta, `J` Falta justificada. Se toma por aula y fecha.
  - Solo cuentan los niños activos del aula; los datos de niños archivados se conservan.
  - Porcentaje de asistencia = (P + T) / días marcados.
- **Agenda:**
  - Tipos de evento: Reunión, Entrega de documentos, Actividad con niños, Fecha cívica, Capacitación, Personal.
  - Cada evento tiene fecha, hora opcional, título, tipo y nota.
- **Reportes:**
  - Se guardan en `classroomDir(...)/Reportes/` o, si son de toda la docente, en `${año}/Reportes/`.
  - El nombre lleva fecha y hora (`… 2026-11-21 1530.pdf`), así nunca se sobrescribe uno anterior.
  - Después de generar se ofrece «Abrir» o descargar.
  - Los textos de los reportes van en español y respetan el ciclo I descriptivo: sin niveles cuando corresponde.
- **Respaldos:**
  - Archivo `Respaldos/respaldo-AAAA-MM-DD-HHMM.zip`.
  - Dentro del zip va `manifest.json` con `{ app: "cuaderno-de-campo", schemaVersion: 1, createdAt, files: [{ path, size }] }`, más todos los archivos de la carpeta salvo `Respaldos/`.
  - Respaldo automático al abrir la app si el último tiene más de 7 días. Se conservan los 8 automáticos más recientes; los manuales nunca se borran solos.
  - Aviso si nunca hubo respaldo o el último tiene más de 14 días.
- **Restaurar:**
  - Valida el manifiesto (app, versión ≤ actual, rutas `relPath`, tamaños) **antes** de escribir nada.
  - Si la carpeta ya tiene datos, exige confirmar con el texto «Esto reemplazará los datos de esta carpeta. Se hará antes un respaldo de seguridad.». Ese respaldo de seguridad se crea antes de reemplazar.
  - Nunca escribe fuera de la carpeta de trabajo.
- **Importación desde la app anterior:**
  - Lee el JSON de «Descargar respaldo completo» de la app o APK, con `perfil`, `ninos`, `registros`, `asis`, `agenda` y fotos `{ src: dataURL }`.
  - Muestra una vista previa con los conteos y luego importa a un aula elegida.
  - Nunca toca datos existentes salvo para agregar.
- **Sin conexión:** la app instalada abre sin internet y la cuenta se revalida cada 30 días como máximo (Plan 1). El service worker nunca cachea respuestas de Supabase ni de las APIs de IA.
- **Persistencia:** igual que en los Planes 1-3 (repositorio con guarda, cola con generación y año, confirmar solo con `true`, rutas seguras, `relPath`).
- **Código:** interfaz en español (Perú); código, identificadores y commits en inglés; TypeScript estricto sin `any`.

## Review Focus

1. **Restaurar un zip dañado, de otra app o con rutas `../`:** no se escribe nada y se muestra «Este archivo no es un respaldo válido del Cuaderno de Campo.» (Task 4).
2. **Restaurar sobre una carpeta con datos:** primero se crea el respaldo de seguridad. Si eso falla, no se reemplaza nada (Task 4).
3. **Importar el mismo JSON antiguo dos veces:** no duplica niños ni registros. Se detecta por los ids de origen guardados en `importedFrom` y se avisa (Task 6).
4. **Reporte de un aula de ciclo I descriptiva:** no muestra niveles AD/A/B/C en ningún lugar (Tasks 7-8).
5. **Sin internet, con la app instalada:** abre, lee y escribe en la carpeta. La IA y el panel de administración muestran su mensaje de «sin conexión» (Task 9).

---

### Task 1: Modelos y repositorio de asistencia y agenda, y su lugar en el provider

**Files:**
- Modify: `sistema-web/src/domain/schema.ts`, `src/domain/workspace-repo.ts`, `src/domain/paths.ts`, `src/workspace/WorkspaceProvider.tsx`
- Test: `src/domain/attendance-repo.test.ts`, `src/workspace/WorkspaceProvider.test.tsx`

**Interfaces:**
- Produces:
  - `ATTENDANCE_MARKS = ["P","T","F","J"] as const` con etiquetas `ATTENDANCE_LABELS`.
  - `AttendanceFile { version: 1; schoolYear; days: { date: string; classroomId: string; marks: Record<studentId, AttendanceMark> }[] }`.
  - `EVENT_TYPES` (6 etiquetas).
  - `AgendaEvent { id; date; time?: string; title; type; note: string; createdAt; updatedAt }`.
  - `AgendaFile { version: 1; schoolYear; events: AgendaEvent[] }`.
  - Esquemas `.loose()`; `attendancePath(y) = "${y}/datos/asistencia.json"`, `agendaPath(y) = "${y}/datos/agenda.json"`.
  - `repo.loadAttendance/saveAttendance` y `repo.loadAgenda/saveAgenda` (vía `loadDoc`/`saveDoc`).
  - Provider: `attendance`, `updateAttendance(fn, {year})`, `agenda`, `updateAgenda(fn, {year})`, cargados en `loadYearDocs`.

- [ ] **Step 1: Tests fallidos.**
  - Ida y vuelta de guardar y cargar.
  - Sin archivo: vacío y sin escribir.
  - Archivo corrupto: no se sobrescribe.
  - Una marca inválida se rechaza.
  - La hora acepta `HH:MM` o se omite.
  - Provider: se serializa con la cola, la guarda de año devuelve false, y un archivo corrupto lleva al estado de error.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(attendance): attendance and agenda documents in the repository and provider`.

### Task 2: Página «Asistencia»

**Files:**
- Create: `src/domain/attendance.ts`, `src/app/(app)/asistencia/page.tsx`
- Modify: `src/components/AppShell.tsx` («Asistencia» → `/asistencia/`)
- Test: `src/domain/attendance.test.ts`, `src/app/(app)/asistencia/asistencia.test.tsx`

**Interfaces:**
- Consumes: `attendance`, `updateAttendance` (Task 1); `yearData`; `todayISO`; `periodOf`.
- Produces:
  - `markOf(f, classroomId, date, studentId)`.
  - `setMark(f, classroomId, date, studentId, mark | null)`: `null` quita la marca y, si el día queda vacío, quita el día.
  - `markAllPresent(f, classroomId, date, studentIds)`: solo completa a los que no tienen marca.
  - `summary(f, { classroomId; studentId?; from; to })` devuelve `{ P, T, F, J, marked, pct: number | null }`.
  - `monthDays(f, classroomId, month)`.
  - Página `/asistencia/`:
    - Selectores Aula y Fecha (por defecto hoy).
    - Lista de niños activos con cuatro botones P/T/F/J (`aria-pressed`); un toque alterna la marca.
    - Botón «Todos presentes».
    - Contadores del día.
    - Pestaña «Resumen» con una tabla por niño: P, T, F, J y % del mes elegido y del bimestre elegido.
    - Aviso si la fecha no cae en ningún bimestre: «Esta fecha está fuera de los bimestres del año.»
  - Cada toque se guarda con `updateAttendance(..., { year })`. Si falla, se revierte la marca visible y se muestra el aviso del provider.

- [ ] **Step 1: Tests fallidos.**
  - Las funciones puras: `pct` con T contando como asistencia, `null` sin días marcados, `markAllPresent` no pisa a los que tienen F.
  - La página: marcar, desmarcar, «Todos presentes», resumen del mes y del bimestre, solo niños activos.
  - Un fallo de guardado deja la marca anterior.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Ejecutar `build`.
- [ ] **Step 5:** Commit `feat(attendance): daily attendance with monthly and bimester summaries`.

### Task 3: Página «Agenda» y próximos eventos en Inicio

**Files:**
- Create: `src/domain/agenda.ts`, `src/app/(app)/agenda/page.tsx`
- Modify: `src/components/AppShell.tsx` («Agenda» → `/agenda/`), `src/app/(app)/inicio/page.tsx`
- Test: `src/domain/agenda.test.ts`, `src/app/(app)/agenda/agenda.test.tsx`

**Interfaces:**
- Produces:
  - `newEvent`, `upsertEvent`, `removeEvent`.
  - `validateEvent`: «Escribe un título.», «Elige una fecha.», «La hora no es válida.».
  - `eventsOn(f, date)` y `upcoming(f, today, days = 14)`, ordenados por fecha y hora.
  - Página `/agenda/`:
    - Calendario mensual con los días que tienen eventos marcados (punto).
    - «‹ Mes anterior», «Hoy» y «Mes siguiente ›».
    - Al elegir un día aparece la lista de eventos y el formulario para agregar o editar (título, tipo, hora y nota).
    - «Eliminar» con confirmación en la misma página.
    - Lista «Próximas actividades».
  - Inicio: bloque «Próximos 14 días» con hasta 5 eventos, cada uno con enlace a la agenda en ese día (`/agenda/?dia=AAAA-MM-DD`).

- [ ] **Step 1: Tests fallidos.**
  - Las funciones puras.
  - Agregar, editar y eliminar.
  - Navegar entre meses.
  - El día viene del parámetro de la URL.
  - Inicio muestra los próximos eventos.
  - Un fallo al guardar no confirma la acción.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Ejecutar `build`.
- [ ] **Step 5:** Commit `feat(agenda): monthly agenda and upcoming events on home`.

### Task 4: Núcleo de respaldo y restauración

**Files:**
- Create: `src/backup/backup.ts`, `src/backup/restore.ts`, `src/backup/manifest.ts`
- Test: `src/backup/backup.test.ts`, `src/backup/restore.test.ts`

**Interfaces:**
- Consumes: `Storage` (`list`, `readFile`, `writeFile`, `writeTextAtomic`, `remove`); `relPath` (schema); `fflate` (`zip`/`unzip` asíncronos, cargados con `import()`).
- Produces:
  - `listAllFiles(storage, dir = "", exclude = ["Respaldos/"]): Promise<string[]>`, recursivo.
  - `buildBackup(storage, now?): Promise<{ blob: Blob; manifest: Manifest }>`.
  - `saveBackup(storage, kind: "auto" | "manual" | "safety", now?): Promise<string>`. Escribe en `Respaldos/` con el nombre de Global Constraints; los de seguridad llevan el sufijo `-seguridad`. Después aplica la retención: solo los 8 «auto» más recientes.
  - `lastBackupDate(storage): Promise<string | null>`, tomada del nombre del archivo más reciente.
  - `inspectBackup(file: Blob): Promise<{ ok: true; manifest; entries: Map<path, Uint8Array> } | { ok: false; error: string }>`.
    - Valida el zip, la existencia y la forma del manifiesto, `app`, `schemaVersion <= 1`, cada ruta con `relPath` y sin `Respaldos/`, y que los tamaños coincidan.
    - Cualquier fallo devuelve «Este archivo no es un respaldo válido del Cuaderno de Campo.» (Review Focus 1).
  - `hasData(storage): Promise<boolean>`: true si existe `datos/perfil.json` o algún `*/datos/anio.json`.
  - `restoreBackup(storage, inspected, { replace: boolean }): Promise<void>`.
    - Si la carpeta tiene datos y no hay `replace`, lanza un error.
    - Con `replace`: primero `saveBackup("safety")`; si falla, lanza el error y no toca nada (Review Focus 2). Después borra los archivos existentes (salvo `Respaldos/`) y escribe los del zip.
- **Dependencia nueva:** `fflate`.

- [ ] **Step 1: Tests fallidos**, con `MemoryStorage`.
  - Ida y vuelta: construir y luego restaurar en una carpeta vacía deja los mismos archivos y bytes.
  - `Respaldos/` queda excluida.
  - Validación: zip corrupto, sin manifiesto, `app` distinta, versión 2, ruta `../x`, tamaño distinto. En todos los casos no se escribe nada.
  - Restaurar sobre una carpeta con datos sin `replace` lanza un error.
  - Con `replace`, el respaldo de seguridad existe antes de borrar.
  - Si el respaldo de seguridad falla, la carpeta queda intacta.
  - La retención conserva 8 «auto» y nunca borra los «manual».
- [ ] **Step 2:** → FAIL. **Step 3:** implementar (`npm i fflate`). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(backup): zip backups with manifest, validated restore and retention`.

### Task 5: Respaldos en la interfaz y respaldo automático

**Files:**
- Modify: `src/app/(app)/carpeta/page.tsx`, `src/workspace/WorkspaceProvider.tsx` (respaldo automático y aviso)
- Create: `src/backup/BackupPanel.tsx`
- Test: `src/backup/BackupPanel.test.tsx`, `src/workspace/WorkspaceProvider.test.tsx`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `/carpeta/`, sección «Respaldos»:
    - Muestra «Último respaldo: <fecha>» o «Todavía no hiciste un respaldo.».
    - Botón «Hacer respaldo ahora»: guarda en `Respaldos/` y además ofrece descargarlo.
    - Botón «Restaurar desde un respaldo…» (`<input type="file" accept=".zip">`):
      - Si `inspectBackup` falla, muestra el mensaje de error.
      - Si es válido, muestra una vista previa («Respaldo del <fecha>, N archivos»).
      - Si `hasData`, pide la confirmación textual de Global Constraints, con los botones «Sí, reemplazar» y «Cancelar».
      - Al terminar, recarga el workspace (`reload`) y muestra «Respaldo restaurado.».
    - Guía «Mover a otra computadora» en 3 pasos: hacer respaldo, copiar el `.zip` (USB o Drive), y en la otra PC elegir una carpeta vacía y restaurar.
  - Provider:
    - Después de `activate` en estado `ready`, si `lastBackupDate` tiene más de 7 días (o no existe y hay datos), ejecuta `saveBackup("auto")` en la cola, sin bloquear la interfaz. Si falla, solo registra un aviso.
    - Expone `backupWarning: boolean`, que es true si no hay respaldo con más de 14 días de antigüedad. El AppShell muestra entonces el banner «Haz un respaldo de tus datos. Ve a Carpeta › Respaldos.».
  - Durante la restauración, la cola queda bloqueada: ninguna otra escritura se intercala.

- [ ] **Step 1: Tests fallidos.**
  - Respaldo manual.
  - Restaurar un zip inválido muestra el error y no escribe nada.
  - Restaurar en una carpeta con datos exige la confirmación.
  - El respaldo automático corre una vez al abrir si tiene más de 7 días y no corre si es reciente.
  - El banner aparece y desaparece según la fecha.
  - La restauración espera a que terminen las escrituras pendientes de la cola.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Ejecutar `build`.
- [ ] **Step 5:** Commit `feat(backup): backup panel, automatic weekly backups and restore flow`.

### Task 6: Importar desde la app anterior

**Files:**
- Create: `src/legacy/legacy-import.ts`, `src/app/(app)/carpeta/ImportLegacy.tsx`
- Test: `src/legacy/legacy-import.test.ts`, `src/app/(app)/carpeta/ImportLegacy.test.tsx`

**Interfaces:**
- Consumes: `addStudent`, `upsertNote`, `newNote`, `noteDir`, `studentDir`, `compressPhoto` (evidencias), `getCompetencies`, `AREAS`/catálogo, y `update`/`updateNotes`/`updateAttendance`/`updateAgenda`.
- Produces:
  - `parseLegacy(json: unknown): LegacyData | { error }`. Valida con zod que estén `ninos` (array) y `registros` (objeto). Si no: «Este archivo no es un respaldo de la app anterior.».
  - `planLegacyImport(data, target: { classroomId; year; existing: YearData & notes })` devuelve `{ students: number; notes: number; photos: number; attendanceDays: number; events: number; alreadyImported: boolean; unmatchedCompetencies: string[] }`.
  - `applyLegacyImport(...)`, con este mapeo:
    - `ninos.nombre`: las dos últimas palabras van a `lastNames` y el resto a `firstNames`; si solo hay una palabra, va a `firstNames`.
    - `nac` → `birthDate`; `apo` → `guardian`; `tel` → `guardianPhone`; `notas` → `healthNotes`.
    - `registros`:
      - `fecha` → `date`; `momento`; `tipo`; `nivel`.
      - `hecho` → `evidenceText`; `interpretacion`.
      - `acciones` se agrega a `reflection` como «Acciones: …».
      - `area` y `comp` (nombres) se buscan en el catálogo sin importar tildes. Si no hay coincidencia, el registro se guarda sin competencia y se reporta.
      - `ninos` → `studentIds` mapeados.
      - `fotos[].src` (dataURL) se convierten en archivos `evidencia-N.jpg` dentro de `noteDir`.
    - `asis[mes][fecha][ninoId]` → marcas del aula elegida.
    - `agenda` → eventos (el tipo se mapea si coincide; si no, «Personal»).
    - Cada entidad importada lleva `importedFrom: "<id original>"`. Con eso, una segunda importación omite lo ya importado (Review Focus 3).
    - El perfil se toma solo si el perfil actual está vacío.
  - `ImportLegacy` en `/carpeta/`, sección «Importar desde la app anterior»:
    - Selector de archivo `.json`.
    - Vista previa con los conteos y el aula de destino (o «Crear aula nueva», con nombre, ciclo y edad).
    - Botón «Importar».
    - Un progreso «Importando fotos x de y…».
    - Al terminar, un resumen que incluye «No se reconoció la competencia en N registros.».
    - Si ya se importó antes: «Este respaldo ya se importó. Solo se agregará lo nuevo.».

- [ ] **Step 1: Tests fallidos**, con un JSON de ejemplo construido a partir del formato real de `cuaderno-app/www/index.html` (funciones `respaldo` y `cargarEjemplo`).
  - División de nombres.
  - Mapeo de área y competencia con tildes distintas.
  - Una foto dataURL se convierte en archivo.
  - Asistencia y agenda.
  - Una segunda importación no duplica.
  - Un JSON inválido muestra el error.
  - El aula nueva se crea.
  - Un fallo a mitad de la importación muestra el error y deja consistente lo que ya se guardó, porque se guarda en lotes por documento y en orden: niños, luego notas, asistencia y agenda.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Ejecutar `build`.
- [ ] **Step 5:** Commit `feat(import): bring data from the previous field-notebook app`.

### Task 7: Reportes en Excel: registro de notas y asistencia

**Files:**
- Create: `src/reports/excel.ts`, `src/reports/ReportsPage.tsx`, `src/app/(app)/reportes/page.tsx`
- Modify: `src/components/AppShell.tsx` (añadir «Reportes» en «Más» y en el menú de escritorio)
- Test: `src/reports/excel.test.ts`, `src/app/(app)/reportes/reportes.test.tsx`

**Interfaces:**
- Consumes: `gradeTable`, `finalOf`, `usesScale`, `summary`/`monthDays` (Task 2), `LEVEL_LABELS`, `shortName`; `exceljs` cargado con `import()`.
- Produces:
  - `gradesWorkbook({ profile, classroom, students, period, grades }): Promise<Blob>`.
    - Hoja «Registro <Bimestre>»: encabezado con institución, docente, aula y bimestre.
    - Filas con los niños; columnas por competencia con el nivel (o la conclusión resumida en ciclo I descriptivo, Review Focus 4).
    - Segunda hoja «Conclusiones» con niño, competencia y conclusión completa.
  - `attendanceWorkbook({ classroom, students, month, attendance }): Promise<Blob>`. Columnas por día del mes, con totales P, T, F, J y %.
  - `saveReport(storage, dir, baseName, ext, blob): Promise<string>`. Escribe en `Reportes/` con un nombre que lleva fecha y hora; si el nombre ya existe, agrega « (2)».
  - Página `/reportes/`:
    - Selectores de aula, bimestre y mes.
    - Tarjetas «Registro de notas (Excel)» y «Asistencia del mes (Excel)», cada una con el botón «Generar».
    - Al terminar: «Guardado en Reportes: <nombre>», con «Abrir» o «Descargar».
- **Dependencia nueva:** `exceljs`.

- [ ] **Step 1: Tests fallidos.**
  - Leer el libro generado con exceljs y comprobar celdas clave: encabezados, nivel en el aula de escala, ausencia de niveles en ciclo I descriptivo, y % de asistencia.
  - `saveReport` no sobrescribe.
  - La página genera el archivo, lo guarda y muestra «Guardado en Reportes».
- [ ] **Step 2:** → FAIL. **Step 3:** implementar (`npm i exceljs`). **Step 4:** → PASS. Ejecutar `build` y comprobar que exceljs solo esté en el chunk dinámico de reportes.
- [ ] **Step 5:** Commit `feat(reports): Excel grade register and monthly attendance`.

### Task 8: Reportes en PDF: portafolio, informe de progreso y cuaderno del periodo

**Files:**
- Create: `src/reports/pdf/Portfolio.tsx`, `src/reports/pdf/ProgressReport.tsx`, `src/reports/pdf/Notebook.tsx`, `src/reports/pdf/render.ts`
- Modify: `src/reports/ReportsPage.tsx`
- Test: `src/reports/pdf/*.test.tsx`

**Interfaces:**
- Consumes: `notes`, `evidenceFor`, `finalOf`, `gradeOf`, `usesScale`, perfil, `storage.readFile` (fotos), `formatAge`; `@react-pdf/renderer` cargado con `import()`.
- Produces:
  - `renderPdf(element): Promise<Blob>`.
  - **Portafolio de evidencias por niño**, entre dos fechas:
    - Portada con nombre, aula, docente e institución.
    - Cada registro con fecha, momento, competencia, desempeños, evidencia, interpretación y fotos (máx. 4 por registro, escaladas).
  - **Informe de progreso por niño y bimestre:**
    - Datos del niño y de la institución.
    - Tabla de competencias con el nivel (solo con escala) y la conclusión descriptiva.
    - Asistencia del bimestre.
    - Espacio para la firma de la docente.
  - **Cuaderno de campo del periodo**, para un aula y un rango de fechas:
    - Portada al estilo de la presentación del cliente: título «Cuaderno de Campo», año, datos de la docente (los mismos de la diapositiva 3) y una página con la definición (diapositiva 4).
    - Una página por registro con la ficha de la diapositiva 5: fecha, grado, sección, nombre, evidencias, área, competencia, desempeño, interpretación y reflexión.
  - En `ReportsPage`, tarjetas con selectores de niño o aula, fechas o bimestre, y el botón «Generar». Se guardan en `Reportes/` con `saveReport`.
  - Si falta el perfil: «Completa tu perfil para que aparezca en los reportes.» (no bloquea).
- **Dependencia nueva:** `@react-pdf/renderer`. Las fuentes son las estándar Helvetica, que soportan tildes y ñ.

- [ ] **Step 1: Tests fallidos.**
  - Renderizar cada documento con datos de ejemplo y comprobar que se obtiene un Blob `application/pdf` mayor a 1 KB.
  - Extraer el texto del PDF con `pdfjs-dist` (dependencia solo de desarrollo, para tests), o comprobar que los textos clave salen del árbol de componentes antes de renderizar.
  - El ciclo I descriptivo no incluye «AD/A/B/C».
  - Las fotos se incluyen (hasta 4).
  - El aviso aparece cuando falta el perfil.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar (`npm i @react-pdf/renderer`). **Step 4:** → PASS. Ejecutar `build` y comprobar que el PDF solo esté en el chunk dinámico.
- [ ] **Step 5:** Commit `feat(reports): PDF portfolio, progress report and field-notebook export`.

### Task 9: Uso sin conexión (PWA instalable)

**Files:**
- Create: `sistema-web/public/manifest.webmanifest`, `sistema-web/public/icons/*` (generados desde el ícono del Plan 0 o una versión nueva), `sistema-web/scripts/build-sw.mjs`, `src/pwa/register.ts`, `src/components/OfflineBadge.tsx`
- Modify: `sistema-web/package.json` (`postbuild` genera `out/sw.js`), `src/app/layout.tsx` (manifest, `theme-color` y registro), `src/components/AppShell.tsx` (insignia «Sin conexión»)
- Test: `src/pwa/register.test.ts`, `scripts/build-sw.test.mjs` (o un test en TS que importe la función)

**Interfaces:**
- Produces:
  - `build-sw.mjs`: después de `next build`, recorre `out/` y genera `out/sw.js` con:
    - una lista de precache (HTML, JS, CSS, fuentes e imágenes) con un hash de versión;
    - estrategia **cache-first** para los assets con hash en `/_next/static/`;
    - estrategia **network-first, con caída a caché** para las páginas HTML;
    - **sin interceptar** `*.supabase.co`, `api.deepseek.com` ni `api.anthropic.com`, ni ninguna otra petición que no sea del mismo origen;
    - limpieza de cachés viejos en `activate`.
  - `register.ts`: registra `/sw.js` solo en producción y si `"serviceWorker" in navigator`. Si hay una versión nueva, muestra «Hay una nueva versión. Recargar.».
  - `OfflineBadge`: escucha `online`/`offline` y muestra «Sin conexión: tus datos se guardan en tu computadora.».
  - Los mensajes «sin conexión» de la IA y del panel de administración ya existen. Verificar que aparecen.
  - El E2E construye `out-e2e/` con el service worker; el `pree2e` ejecuta `postbuild` también.

- [ ] **Step 1: Tests fallidos.**
  - `build-sw` sobre un `out/` simulado genera la lista correcta y excluye los mapas.
  - El `sw.js` generado contiene las exclusiones de host.
  - `register` no registra en desarrollo ni si falta la API.
  - `OfflineBadge` cambia con los eventos.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Ejecutar `build` y comprobar que `out/sw.js` existe.
- [ ] **Step 5:** Commit `feat(pwa): installable offline app with precached static export`.

### Task 10: E2E de asistencia, agenda, respaldos, importación, reportes y uso sin conexión

**Files:**
- Create: `sistema-web/e2e/plan4.spec.ts` (reutiliza `e2e/helpers.ts`)

- [ ] **Step 1: E2E en Chromium**, con Supabase simulado, carpeta OPFS e IA bloqueada.
  - **Asistencia:** marcar P/F a 2 niños → recargar → persiste → el resumen del mes muestra el %.
  - **Agenda:** crear un evento → aparece en Inicio.
  - **Respaldo:** «Hacer respaldo ahora» → existe `Respaldos/respaldo-*.zip` en OPFS → eliminar un niño → restaurar ese zip con confirmación → el niño vuelve y existe un respaldo de seguridad.
  - **Importación:** subir un JSON de la app anterior con 2 niños y 1 registro con foto → aparecen los niños, el registro y la foto en OPFS → importar de nuevo no duplica.
  - **Reportes:** generar el Excel de notas y el PDF de progreso → existen en `Reportes/` con tamaño mayor a 0.
  - **Sin conexión:** `context.setOffline(true)` → recargar → la app abre (desde el service worker) y muestra la insignia «Sin conexión» → marcar asistencia → se guarda en OPFS.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` → todo PASS. `out/` no cambia con el e2e.
- [ ] **Step 3:** Commit `test(e2e): attendance, agenda, backups, legacy import, reports and offline`.
