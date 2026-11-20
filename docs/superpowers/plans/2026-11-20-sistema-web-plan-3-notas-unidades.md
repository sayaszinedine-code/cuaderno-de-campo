# Sistema web docente — Plan 3: Registro de notas, unidades y sesiones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La docente registra, por aula y bimestre, el nivel de logro y la conclusión descriptiva de cada niño en cada competencia, viendo las evidencias del cuaderno que la sustentan, y consulta el consolidado del año. Además, organiza sus unidades (o experiencias o proyectos) y sesiones por bimestre, con sus archivos Word, PDF y PPT copiados a su carpeta.

**Architecture:** Dos archivos nuevos por año, `${año}/datos/notas.json` y `${año}/datos/unidades.json`. Usan el mismo patrón de repositorio versionado, guarda contra sobrescritura, `.loose()` y cola de escrituras con guarda de año del Plan 2, que se generaliza en el provider. Los adjuntos se copian a carpetas legibles dentro del aula. La lógica de calificación es pura y testeada aparte. La IA reutiliza `generateWithSettings`, `anonymize`/`deanonymize` y el componente `AiAction`.

**Tech Stack:** el de los Planes 1 y 2. No se agregan dependencias.

**Spec:** `docs/superpowers/specs/2026-11-19-sistema-web-docente-inicial-design.md` (objetivos 9 y 10; decisiones del usuario y del asistente sobre ciclo I y nivel final, secciones 9 y 10).

## Global Constraints

- **Calificación:**
  - Ciclo II: siempre `AD | A | B | C` más conclusión descriptiva.
  - Ciclo I: depende de `classroom.cycleIGrading`. Con `"descriptive"` solo hay conclusión: no se muestra ni se guarda nivel. Con `"scale"` se usa `AD | A | B | C` más conclusión.
- **Nivel final del año** por competencia: por defecto es el nivel del **último bimestre calificado**, sin promediar. La docente puede cambiarlo; queda marcado como «ajustado» y puede volver al valor automático.
- **Competencias:** las notas y unidades usan las competencias **activas** del aula (`activeCompetencies`), incluidas las transversales con el área «Competencias transversales» (`areasForCycles` y `areaName` de `@/domain/areas`).
- **Etiquetas de nivel:** AD «Logro destacado», A «Logro esperado», B «En proceso», C «En inicio».
- **Adjuntos:**
  - Extensiones permitidas: `.doc .docx .pdf .ppt .pptx .xls .xlsx .odt .odp .ods .txt .jpg .jpeg .png`.
  - Máximo 25 MB por archivo. Si se excede: «El archivo pesa más de 25 MB.».
  - Si el tipo no está permitido: «Ese tipo de archivo no está permitido.».
  - El archivo se copia sin modificar, con su nombre original pasado por `safeName`.
- **Rutas de carpeta:** siempre con `safeName` y el sufijo de id (8 caracteres para unidades y sesiones). Las rutas guardadas pasan por `relPath`.
- **Persistencia:**
  - Pasa por el repositorio, con guarda contra sobrescritura. `overwriteInvalid` nunca se usa desde la UI.
  - Las escrituras usan la cola del provider con guarda de generación y de año. Las páginas confirman solo si la escritura devuelve `true`.
  - Un archivo dañado lleva al estado de error de datos, sin escribir nada, igual que en los Planes 1 y 2.
- **IA:** solo `generateWithSettings`; los nombres de **todos** los niños del año se anonimizan antes de enviar y se restauran localmente con `deanonymize`. Nunca se reemplaza un campo sin el clic en «Usar este texto».
- **Idioma y código:** interfaz en español (Perú); código, identificadores y commits en inglés (Conventional Commits); TypeScript estricto sin `any`.
- **Celular:** la tabla niño × competencia se convierte en una vista por niño (una tarjeta por competencia) en pantallas de menos de 768 px.

## Review Focus

1. **Aula de ciclo I «descriptive» con niveles guardados** (p. ej., la docente cambió de «scale» a «descriptive»): no se muestran ni se exportan niveles, y al guardar se eliminan del registro de ese aula sin tocar las conclusiones (Task 3, Task 5).
2. **Competencia desactivada después de calificar:** sus notas no se pierden. Se ocultan de la tabla y reaparecen si se reactiva (Task 3, Task 5).
3. **Niño archivado o que cambió de aula:** sus notas se conservan y no aparece en la tabla del aula actual (Task 3).
4. **Adjunto con el mismo nombre que otro en la misma unidad o sesión:** no se sobrescribe; se agrega `(2)`, `(3)` (Task 6).
5. **Borrar una unidad que tiene sesiones o adjuntos:** se pide confirmación indicando cuántas sesiones y archivos se borrarán. Los archivos se eliminan best-effort después de guardar, y un fallo al borrar no muestra error engañoso (Task 7).

---

### Task 1: Modelo y repositorio de notas (calificaciones)

**Files:**
- Modify: `sistema-web/src/domain/schema.ts`, `sistema-web/src/domain/workspace-repo.ts`, `sistema-web/src/domain/paths.ts`
- Test: `sistema-web/src/domain/grades-repo.test.ts`

**Interfaces:**
- Produces:
  - `LEVEL_LABELS: Record<Level, string>`.
  - `GradeEntry { studentId: string; competencyId: string; periodId: Period["id"]; level?: Level; conclusion: string; updatedAt: string }`.
  - `FinalOverride { studentId: string; competencyId: string; level?: Level; conclusion: string; updatedAt: string }`.
  - `GradesFile { version: 1; schoolYear: number; entries: GradeEntry[]; finals: FinalOverride[] }`.
  - Esquemas `.loose()`: `gradeEntrySchema`, `finalOverrideSchema`, `gradesFileSchema`.
  - `gradesPath(y) = "${y}/datos/notas.json"`.
  - `WorkspaceRepo.loadGrades(y): Promise<GradesFile>` devuelve un archivo vacío si no existe, sin escribirlo. `saveGrades(f, opts?)` tiene la misma guarda que `saveNotes`.

- [ ] **Step 1: Tests fallidos:**
  - Ida y vuelta de guardar y cargar.
  - Sin archivo: vacío y sin escribir.
  - Archivo corrupto: lanza `corrupt` y no se sobrescribe.
  - Una clave desconocida se conserva.
  - Un `level` inválido se rechaza.
  - `periodId` fuera de B1..B4 se rechaza.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementar reutilizando `parseFile` y `guardExisting`. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(grades): per-year grades file with bimester entries and final overrides`.

### Task 2: Modelo y repositorio de unidades y sesiones

**Files:**
- Modify: `sistema-web/src/domain/schema.ts`, `sistema-web/src/domain/workspace-repo.ts`, `sistema-web/src/domain/paths.ts`
- Test: `sistema-web/src/domain/units-repo.test.ts`, `sistema-web/src/domain/paths.test.ts`

**Interfaces:**
- Produces:
  - `UNIT_KINDS = ["unidad","proyecto","experiencia"] as const`, con etiquetas «Unidad de aprendizaje», «Proyecto de aprendizaje», «Experiencia de aprendizaje».
  - `Attachment { name: string; path: string /*relPath*/; size: number; type: string; addedAt: string }`.
  - `Unit { id; classroomId; periodId; kind; title; start?: string; end?: string; purpose: string; competencyIds: string[]; performances: SelectedPerformance[]; description: string; attachments: Attachment[]; createdAt; updatedAt }`.
  - `Session { id; unitId; date: string; title; purpose: string; competencyIds: string[]; performances: SelectedPerformance[]; description: string; attachments: Attachment[]; noteIds: string[]; createdAt; updatedAt }`.
  - `UnitsFile { version: 1; schoolYear; units: Unit[]; sessions: Session[] }`, con esquemas `.loose()`.
  - `unitsPath(y) = "${y}/datos/unidades.json"`.
  - `unitDir(y, classroom, unit) = classroomDir(...) + "Unidades y sesiones/" + periodFolder(unit.periodId) + "/" + withIdSuffix(unit.title || "Sin título", unit.id, 8) + "/"`, donde `periodFolder("B1") = "Bimestre 1"`.
  - `sessionDir(y, classroom, unit, session) = unitDir(...) + "Sesiones/" + withIdSuffix(`${session.date} ${session.title}`.trim(), session.id, 8) + "/"`.
  - `WorkspaceRepo.loadUnits(y)` y `saveUnits(f, opts?)`, iguales a `loadNotes`/`saveNotes`.

- [ ] **Step 1: Tests fallidos:**
  - Ida y vuelta de guardar y cargar.
  - Sin archivo: vacío y sin escribir.
  - Archivo corrupto: lanza y no se sobrescribe.
  - Una ruta de adjunto insegura se rechaza.
  - `unitDir` termina en `/Unidades y sesiones/Bimestre 2/Mi familia - abcd1234/`.
  - `sessionDir` incluye la fecha y el título.
  - Un título con `/` o `..` queda seguro.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(units): per-year units and sessions file with attachment paths`.

### Task 3: Lógica pura de calificación

**Files:**
- Create: `sistema-web/src/domain/grades.ts`
- Test: `sistema-web/src/domain/grades.test.ts`

**Interfaces:**
- Consumes: `GradesFile`, `GradeEntry`, `FinalOverride` (Task 1); `Classroom`, `Student`, `Period`, `FieldNote` (Plans 1-2); `activeCompetencies`; `filterNotes`, `periodOf` (Plan 2).
- Produces:
  - `usesScale(c: Classroom): boolean`: ciclo II, o ciclo I con `"scale"`.
  - `gradeOf(f, studentId, competencyId, periodId): GradeEntry | undefined`.
  - `setGrade(f, input: { studentId; competencyId; periodId; level?: Level; conclusion: string }, classroom, now?): GradesFile`. Hace upsert. Si `!usesScale(classroom)` guarda `level` como undefined. Si `level` está vacío y la conclusión también, quita la entrada.
  - `finalOf(f, studentId, competencyId, periods): { level?: Level; conclusion: string; source: "auto" | "override"; fromPeriodId?: Period["id"] }`.
    - Si hay override, se usa el override.
    - Si no, se toma la entrada del bimestre más reciente con `level`. Si no hay ninguna con nivel, la más reciente con conclusión.
    - Sin datos devuelve `{ conclusion: "", source: "auto" }`.
  - `setFinalOverride(f, input, classroom, now?)` y `clearFinalOverride(f, studentId, competencyId)`.
  - `gradeTable(params: { file; classroom; students; periodId }): { students: Student[]; competencies: Competency[]; cell(studentId, competencyId): GradeEntry | undefined }`. Usa solo los niños **activos** del aula y las competencias **activas** (Review Focus 2 y 3; las entradas ocultas se conservan).
  - `evidenceFor(notes, params: { studentId; competencyId; periodId; periods; students }): FieldNote[]`. Son los registros del cuaderno de ese niño (incluidos los de «Todo el grupo» de su aula) con esa competencia en ese bimestre, ordenados por fecha descendente.
  - `progress(f, params: { classroom; students; periodId }): { graded: number; total: number }`. Cuenta una celda como calificada si tiene nivel (o conclusión, en ciclo I descriptivo).
  - `stripLevelsForDescriptive(f, classroom, students): GradesFile`. Quita `level` de las entradas y overrides de los niños de un aula `"descriptive"` (Review Focus 1).

- [ ] **Step 1: Tests fallidos:**
  - Para cada función.
  - `finalOf` con B1:A, B2:sin nivel, B3:B → `{ level: "B", fromPeriodId: "B3", source: "auto" }`.
  - El override gana sobre el automático, y quitar el override vuelve al automático.
  - Una competencia desactivada no aparece en `gradeTable` pero su entrada sigue en el archivo.
  - Un niño archivado no aparece en la tabla y su entrada se conserva.
  - `setGrade` en un aula descriptiva descarta el nivel.
  - `evidenceFor` incluye las notas de «Todo el grupo» y excluye las de otro bimestre y las de otra competencia.
  - `progress` cuenta bien en los dos modos.
  - `stripLevelsForDescriptive` conserva las conclusiones.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar sin dependencias nuevas. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(grades): pure grading rules, final level and evidence lookup`.

### Task 4: Notas y unidades en el WorkspaceProvider

**Files:**
- Modify: `sistema-web/src/workspace/WorkspaceProvider.tsx`
- Test: `sistema-web/src/workspace/WorkspaceProvider.test.tsx`

**Interfaces:**
- Consumes: `loadGrades`/`saveGrades` (Task 1), `loadUnits`/`saveUnits` (Task 2).
- Produces, en `WorkspaceValue`:
  - `grades: GradesFile` y `updateGrades(fn, opts?: { year?: number }): Promise<boolean>`.
  - `units: UnitsFile` y `updateUnits(fn, opts?: { year?: number }): Promise<boolean>`.
  - Misma semántica que `updateNotes`: cola compartida, guarda de generación y de año, aviso si falla el guardado y relectura desde disco.
  - Se cargan junto con el año en `activate`, `reload`, `setYear` y `refreshFromDisk`.
  - Mantener un solo `mutate` genérico. Se puede extraer un helper para cargar los cuatro documentos del año y no repetir el `Promise.all` en cada sitio.
- Al **cambiar `cycleIGrading` a `"descriptive"`** en `/aulas/` (Plan 1), la página ejecuta además `updateGrades(f => stripLevelsForDescriptive(f, classroom, students))` (Review Focus 1).

- [ ] **Step 1: Tests fallidos:**
  - `updateGrades` y `updateUnits` guardan en su archivo.
  - Se serializan con `update` y `updateNotes`.
  - Un fallo devuelve false, muestra el aviso y relee desde disco.
  - Con la guarda de año, si el año cambió, devuelven false sin escribir.
  - `notas.json` o `unidades.json` corruptos llevan al estado de error de datos sin escribir.
  - `setYear` carga los cuatro documentos.
  - En aulas: cambiar a «Solo conclusión descriptiva» quita los niveles guardados de ese aula.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(workspace): grades and units through the shared write queue`.

### Task 5: Página «Notas»: registro por bimestre

**Files:**
- Create: `sistema-web/src/app/(app)/notas/page.tsx`, `sistema-web/src/grades/GradeCellEditor.tsx`, `sistema-web/src/grades/EvidenceList.tsx`
- Modify: `sistema-web/src/components/AppShell.tsx` («Notas» → `/notas/`)
- Test: `sistema-web/src/app/(app)/notas/notas.test.tsx`

**Interfaces:**
- Consumes: `gradeTable`, `setGrade`, `usesScale`, `evidenceFor`, `progress` (Task 3); `updateGrades`, `grades`, `notes`, `yearData` (Task 4); `LEVEL_LABELS`; `NoteCard` (Plan 2, en versión compacta).
- Produces: `/notas/` con:
  - Selectores «Aula» y «Bimestre». Por defecto, el primer aula y el bimestre que contiene hoy (si no hay, B1).
  - Indicador «Calificado: X de Y».
  - **Tabla** niño × competencia. Cada celda muestra el nivel como insignia de color, o «—», y un ícono si tiene conclusión.
  - **Celular** (< 768 px): una lista de niños; al tocar uno se ven sus competencias como tarjetas.
  - Tocar una celda abre `GradeCellEditor` en un panel lateral (o en un sheet en celular) con:
    - nombre del niño y de la competencia;
    - selector de nivel con las 4 opciones y sus etiquetas, solo si `usesScale`;
    - textarea «Conclusión descriptiva»;
    - **«Evidencias del bimestre (N)»** con `EvidenceList`, que muestra las tarjetas compactas de `evidenceFor`, con enlace a abrir el registro. Si no hay evidencias: «Aún no hay registros del cuaderno para esta competencia en este bimestre.»;
    - botones «Guardar» y «Cancelar». Guardar llama a `updateGrades(f => setGrade(...), { year })`; si devuelve true, muestra «Nota guardada.» y cierra el panel; si devuelve false, el panel sigue abierto con los datos.
  - Estado vacío sin aulas: «Primero crea un aula en «Aulas».».
  - Si `!usesScale`, la tabla no muestra columna de nivel y cada celda muestra el inicio de la conclusión.

- [ ] **Step 1: Tests fallidos:**
  - La tabla muestra los niños activos y las competencias activas.
  - Guardar un nivel y una conclusión llega a `notas.json`.
  - Un aula de ciclo I descriptiva no muestra el selector de nivel.
  - El panel muestra las evidencias correctas y el estado vacío.
  - Si `saveGrades` falla, no aparece «Nota guardada.» y los datos siguen en el panel.
  - El indicador de progreso es correcto.
  - Cambiar de bimestre cambia las celdas.
  - En vista celular (`matchMedia` simulado), aparece la lista por niño.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(grades): bimester grade sheet with evidence-backed cell editor`.

### Task 6: Consolidado anual por niño e IA para conclusiones

**Files:**
- Create: `sistema-web/src/app/(app)/notas/anual/page.tsx`, `sistema-web/src/grades/AiConclusion.tsx`
- Modify: `sistema-web/src/ai/prompts.ts` (añadir `descriptiveConclusion`)
- Modify: `sistema-web/src/grades/GradeCellEditor.tsx`
- Test: `sistema-web/src/app/(app)/notas/anual/anual.test.tsx`, `sistema-web/src/grades/AiConclusion.test.tsx`

**Interfaces:**
- Consumes: `finalOf`, `setFinalOverride`, `clearFinalOverride`, `evidenceFor` (Task 3); `AiAction`, `aiAvailable` (Plan 2); `generateWithSettings`, `anonymize`, `deanonymize`, `loadAiSettings`.
- Produces:
  - `/notas/anual/?aula=<id>&nino=<id>`, leídos con `window.location.search`. También se llega desde `/notas/` con el botón «Ver año» en cada fila.
  - Muestra una tabla competencia × (B1, B2, B3, B4, **Final**).
  - En la columna Final, «auto (de BN)» indica de qué bimestre viene. Un clic permite ajustar el nivel y la conclusión (override), y el botón «Volver al automático» quita el override.
  - Selectores para navegar entre niños del aula, con «Anterior» y «Siguiente».
  - `prompts.descriptiveConclusion({ competency, level?, evidences: string[] })`: redacta de 4 a 6 oraciones con lo que logra (con ejemplos concretos), lo que está en proceso y una recomendación práctica para la familia, en lenguaje positivo y comprensible para las familias, sin inventar datos.
  - `AiConclusion`, dentro de `GradeCellEditor`, es el botón «Redactar conclusión con IA». Envía las evidencias del bimestre (`evidenceText`, interpretación y desempeños de cada registro), anonimizadas con todos los niños del año. El resultado sale de `deanonymize`, con «Usar este texto» y «Descartar», y pide confirmación si la conclusión cambió mientras la IA respondía. Solo aparece si `aiAvailable(settings)` y si hay al menos una evidencia.

- [ ] **Step 1: Tests fallidos:**
  - El consolidado muestra B1..B4 y el final automático con su origen.
  - Un override se guarda y se muestra como «ajustado».
  - «Volver al automático» quita el override.
  - Navegar entre niños funciona.
  - `AiConclusion` no envía nombres reales y aplica el texto con nombres restaurados solo tras «Usar».
  - Sin evidencias o con la IA desactivada, el botón no aparece.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(grades): yearly summary with final overrides and AI-assisted conclusions`.

### Task 7: Unidades: lista, formulario y adjuntos

**Files:**
- Create: `sistema-web/src/domain/attachments.ts`, `sistema-web/src/units/AttachmentList.tsx`, `sistema-web/src/app/(app)/unidades/page.tsx`, `sistema-web/src/app/(app)/unidades/unidad/page.tsx`
- Modify: `sistema-web/src/components/AppShell.tsx` («Unidades» → `/unidades/`)
- Test: `sistema-web/src/domain/attachments.test.ts`, `sistema-web/src/app/(app)/unidades/unidades.test.tsx`

**Interfaces:**
- Consumes: `UnitsFile`, `Unit`, `Attachment`, `unitDir` (Task 2); `updateUnits`, `units` (Task 4); `PerformancePicker` (Plan 2, reutilizado para elegir desempeños de las competencias de la unidad usando las bandas del aula); `activeCompetencies`, `areasForCycles`.
- Produces:
  - `attachments.ts`:
    - `validateAttachment(file: File): string | null`, con los mensajes de Global Constraints.
    - `attachmentName(existing: string[], original: string): string`, que aplica `safeName`, evita duplicados agregando « (2)» antes de la extensión, y no distingue mayúsculas (Review Focus 4).
    - `saveAttachment(storage, dir, file, existingNames): Promise<Attachment>`. Primero escribe el archivo y luego devuelve el registro.
    - `openAttachment(storage, a)`: lee el archivo, crea una URL de objeto, la abre con `<a download>` y luego la revoca.
  - `/unidades/`:
    - Selectores Aula y Bimestre, y el botón «Nueva unidad».
    - Cada tarjeta muestra el tipo, el título, las fechas, las competencias (nombres cortos), el número de sesiones y de archivos, y un enlace a `/unidades/unidad/?id=`.
    - Estado vacío: «Aún no hay unidades en este bimestre.».
  - `/unidades/unidad/?id=` (sin id, crea una nueva):
    - Campos: tipo, título (obligatorio, «Escribe un título.»), fechas de inicio y fin (opcionales, y la de inicio no puede ser posterior a la de fin: «La fecha de inicio es posterior a la de fin.»), propósito, competencias (casillas de las activas, agrupadas por área), desempeños (opcionales, con `PerformancePicker`) y descripción.
    - Adjuntos: «Agregar archivos» con varios a la vez. Cada archivo se copia al guardarlo en `unitDir`. Se ven en la lista con nombre, tamaño, «Abrir» y «Quitar». Se aplican las mismas reglas que en las fotos del Plan 2: la ruta entra en el estado solo después de escribir el archivo; un adjunto existente se borra solo después de guardar; al cancelar se borra lo que se agregó en esta sesión; los botones se bloquean mientras hay escrituras.
    - Lista de sesiones de la unidad, con el botón «Nueva sesión» que lleva a `/unidades/sesion/?unidad=<id>` (Task 8).
    - «Eliminar unidad»: pide confirmación con «Se eliminarán la unidad, N sesiones y M archivos. No se puede deshacer.». Primero guarda con `updateUnits` (quita la unidad y sus sesiones) y después borra los archivos best-effort (Review Focus 5).

- [ ] **Step 1: Tests fallidos:**
  - `validateAttachment` con un archivo de 30 MB y con `.exe`.
  - `attachmentName` con «Plan.docx» repetido da «Plan (2).docx».
  - Crear una unidad con un adjunto guarda `unidades.json` y crea el archivo en `unitDir`.
  - Validación del título y de las fechas.
  - Quitar un adjunto existente lo borra solo después de guardar.
  - Cancelar una unidad nueva borra los adjuntos de la sesión.
  - Eliminar muestra los conteos y borra la unidad, sus sesiones y los archivos.
  - Si `saveUnits` falla, no se confirma.
  - «Abrir» crea y revoca la URL de objeto.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(units): learning units with competencies, performances and attachments`.

### Task 8: Sesiones vinculadas a la unidad y al cuaderno

**Files:**
- Create: `sistema-web/src/app/(app)/unidades/sesion/page.tsx`
- Modify: `sistema-web/src/app/(app)/cuaderno/registro/page.tsx` (mostrar «Sesión vinculada» si existe)
- Test: `sistema-web/src/app/(app)/unidades/sesion/sesion.test.tsx`

**Interfaces:**
- Consumes: `Session`, `sessionDir` (Task 2); `saveAttachment`, `AttachmentList`, `validateAttachment` (Task 7); `updateUnits`; `notes`, `filterNotes` (Plan 2).
- Produces:
  - `/unidades/sesion/?id=` o `?unidad=` para una sesión nueva. Campos: fecha (obligatoria), título (obligatorio), propósito, competencias (por defecto, las de la unidad), desempeños, descripción y adjuntos (con las mismas reglas de la Task 7, en `sessionDir`).
  - **«Registros del cuaderno vinculados»**: una lista de casillas con los registros del aula de la unidad cuya fecha está en ±7 días de la sesión, con su texto corto. Guarda `noteIds`.
  - «Eliminar sesión» pide confirmación y borra sus archivos best-effort.
  - En la ficha del cuaderno (Plan 2), si algún `session.noteIds` incluye el registro, se muestra «Sesión vinculada: <título> (<fecha>)» con enlace a la sesión.
  - Si un registro vinculado fue borrado, se ignora al mostrarlo y se limpia del `noteIds` en el siguiente guardado de la sesión.

- [ ] **Step 1: Tests fallidos:**
  - Crear una sesión con adjunto y vínculos guarda bien.
  - Las competencias por defecto vienen de la unidad.
  - La ventana de ±7 días filtra los registros.
  - El registro vinculado muestra el enlace en la ficha.
  - Un `noteId` borrado se ignora y se limpia al guardar.
  - Al eliminar una sesión se borran sus archivos.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(units): sessions with attachments linked to field notes`.

### Task 9: E2E de notas y unidades

**Files:**
- Create: `sistema-web/e2e/notas-unidades.spec.ts` (reutiliza `e2e/helpers.ts`)

- [ ] **Step 1: E2E en Chromium, con Supabase simulado, carpeta OPFS e IA bloqueada.**
  - Preparación: docente activa → aula «Girasoles» ciclo II 4 años → «Valentina Quispe» → un registro del cuaderno en B4 con «Resuelve problemas de cantidad».
  - Notas: ir a `/notas/` en B4 → abrir la celda de Valentina en esa competencia → aparece 1 evidencia → nivel A y una conclusión → Guardar → recargar → la insignia «A» sigue ahí.
  - Consolidado anual: el final es «A», «auto (de B4)».
  - Unidades: crear la unidad «Mi familia» en B4 con un adjunto `.docx` generado en el test → crear una sesión vinculada a ese registro → recargar → todo persiste. El archivo existe en OPFS bajo `Unidades y sesiones/Bimestre 4/`.
  - Eliminar la unidad → sus archivos ya no están en OPFS.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` → todo PASS; `out/` no cambia.
- [ ] **Step 3:** Commit `test(e2e): grades, yearly summary, units and sessions`.
