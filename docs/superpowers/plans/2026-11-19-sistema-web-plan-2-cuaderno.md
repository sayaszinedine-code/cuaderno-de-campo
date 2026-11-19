# Sistema web docente — Plan 2: Cuaderno de campo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La docente registra en menos de un minuto la ficha de cuaderno de campo de su cliente (fecha, aula, niños, evidencias con texto y fotos, área, competencia, desempeños elegidos de la lista según la edad, interpretación y reflexión), la consulta con filtros, y opcionalmente se ayuda de IA con su propia clave.

**Architecture:** Los registros de cada año van en un archivo propio `${año}/datos/cuaderno.json`, con el mismo repositorio versionado, la misma guarda contra sobrescritura y la misma cola de escrituras del Plan 1. Las fotos de evidencia se guardan en una carpeta por registro dentro del aula. La IA corre en el navegador hacia DeepSeek o Anthropic (ambas APIs aceptan CORS, verificado el 2026-11-19) con la clave de la docente guardada solo en su navegador.

**Tech Stack:** Lo del Plan 1 (Next.js 15 export estático, React 19, TS estricto, zod 4, Vitest, Playwright) + `@anthropic-ai/sdk` (solo para el proveedor Claude).

**Spec:** `docs/superpowers/specs/2026-11-19-sistema-web-docente-inicial-design.md` (objetivos 8 y 13; secciones 6 y 10).

## Global Constraints

- Ningún dato de niños va a Supabase. Los datos de niños solo salen de la computadora cuando la docente usa la IA, y entonces los nombres se reemplazan por iniciales.
- IA desactivada por defecto. Activarla exige aceptar un consentimiento que nombra al proveedor y dónde procesa los datos: DeepSeek, China; Anthropic, EE. UU. La clave de API se guarda solo en el navegador, en localStorage, por usuaria (`ai-settings:<userId>`); nunca en la carpeta ni en respaldos.
- Proveedores: DeepSeek con `POST https://api.deepseek.com/chat/completions`, modelo `deepseek-chat`, solo texto. Claude con el SDK oficial `@anthropic-ai/sdk` (`dangerouslyAllowBrowser: true`), modelo `claude-opus-5-5`, `output_config: { effort: "medium" }`, streaming, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, revisar `stop_reason === "refusal"`. «Describir la foto» solo está disponible con Claude.
- Interfaz en español (Perú); código, identificadores y commits en inglés (Conventional Commits); TypeScript estricto sin `any`.
- Persistencia vía `WorkspaceRepo` con guarda contra sobrescritura (`overwriteInvalid` nunca desde la UI). Las escrituras pasan por la cola del provider y respetan la protección de generación; las páginas confirman solo si `update` devuelve `true`.
- Rutas de carpeta siempre con `safeName` y sufijo de id.
- Fotos de evidencia: lado mayor ≤ 1600 px, JPEG con calidad 0.85.
- Ciclo I con calificación «descriptive»: el campo de nivel de logro no se muestra.

## Review Focus

1. **Registro con niños luego archivados o de otra aula** (p. ej., se cambia el aula del registro): la ficha no se rompe y muestra solo niños válidos (Task 2, Task 5).
2. **Falla al guardar una foto a mitad de varias:** no deben quedar rutas a archivos inexistentes en el registro (Task 5).
3. **Borrar un registro:** se borran sus fotos y no queda la carpeta huérfana; si el borrado del archivo falla, el registro igual se elimina y no se muestra error engañoso (Task 2, Task 5).
4. **Clave de IA inválida, sin conexión o con límite excedido:** mensaje claro en español, el texto de la docente nunca se pierde ni se reemplaza solo (Task 6, Task 7).
5. **La IA no recibe nombres reales:** el texto enviado no contiene nombres ni apellidos de los niños del aula, incluso con tildes o mayúsculas distintas (Task 6).

---

### Task 1: Modelo de registro y repositorio del cuaderno

**Files:**
- Modify: `sistema-web/src/domain/schema.ts`
- Modify: `sistema-web/src/domain/workspace-repo.ts`
- Modify: `sistema-web/src/domain/paths.ts`
- Test: `sistema-web/src/domain/notes-repo.test.ts`, `sistema-web/src/domain/paths.test.ts`

**Interfaces:**
- Produces:
  - `NOTE_KINDS = ["obs","anec","logro","fam","otro"] as const` con etiquetas `NOTE_KIND_LABELS`: Observación, Anécdota / incidencia, Logro, Reunión con familia, Otro.
  - `MOMENTS`: Recepción y rutinas, Juego libre en sectores, Experiencia de aprendizaje, Taller, Alimentación y recreo, Aseo y descanso, Salida, Fuera del aula / visita.
  - `LEVELS = ["AD","A","B","C"] as const`.
  - `SelectedPerformance { competencyId: string; band: AgeBand; text: string }`. Guarda una copia del texto para que el registro sobreviva a cambios del catálogo.
  - `FieldNote { id; date: string /*ISO*/; classroomId; studentIds: string[]; wholeGroup: boolean; moment: string; kind: NoteKind; areaId?: string; competencyId?: string; performances: SelectedPerformance[]; evidenceText: string; evidence: string[] /* rutas relativas */; interpretation: string; reflection: string; level?: Level; createdAt: string; updatedAt: string }`.
  - `NotesFile { version: 1; schoolYear: number; notes: FieldNote[] }`, esquema `.loose()` como los demás.
  - `WorkspaceRepo.loadNotes(y): Promise<NotesFile>` (vacío y sin escribir si no existe) y `saveNotes(f, opts?)`, con la misma guarda que `saveYear`.
  - `notesPath(y) = "${y}/datos/cuaderno.json"`.
  - `noteDir(y, classroom, note) = classroomDir(y, classroom) + "Cuaderno de campo/" + withIdSuffix(note.date, note.id) + "/"`.

- [ ] **Step 1: Tests fallidos:**
  - Ida y vuelta de `saveNotes`/`loadNotes` en `MemoryStorage`.
  - `loadNotes` sin archivo → `notes: []` y no escribe.
  - Archivo corrupto → `WorkspaceDataError("corrupt")`; `saveNotes` sobre corrupto lanza y no cambia el archivo.
  - Una clave desconocida en una nota sobrevive al guardar.
  - Una nota con `kind` inválido es rechazada.
  - `noteDir(2026, aula, {id:"abcd1234…", date:"2026-04-10"})` termina en `/Cuaderno de campo/2026-04-10 - abcd/`.
- [ ] **Step 2:** `npx vitest run src/domain` → FAIL.
- [ ] **Step 3:** Implementar, reutilizando `parseFile` y `guardExisting`.
- [ ] **Step 4:** → PASS. Correr `typecheck`.
- [ ] **Step 5:** Commit `feat(notes): field-note schema and per-year notes repository`.

### Task 2: Lógica pura del cuaderno

**Files:**
- Create: `sistema-web/src/domain/notes.ts`
- Test: `sistema-web/src/domain/notes.test.ts`

**Interfaces:**
- Consumes: `FieldNote`, `NotesFile` (Task 1); `YearData`, `Classroom`, `Student`, `Period` (Plan 1); `bandFor`, `todayISO` (Plan 1); `getPerformances`, `getCompetencies` (Plan 1).
- Produces:
  - `newNote(input: { classroomId: string; date?: string }, genId?, now?): FieldNote`. Valores por defecto: fecha de hoy, `kind:"obs"`, `moment:"Juego libre en sectores"`, listas vacías y textos vacíos.
  - `upsertNote(f: NotesFile, n: FieldNote, now?): NotesFile`, que actualiza `updatedAt`.
  - `removeNote(f, id): NotesFile`.
  - `validateNote(n, year: YearData): string | null`. Errores:
    - aula inexistente → «Elige un aula.»
    - sin niños y sin `wholeGroup` → «Elige al menos un niño o niña, o marca «Todo el grupo».»
    - `evidenceText` vacío y sin fotos → «Describe la evidencia o agrega una foto.»
    - competencia que no pertenece al ciclo del aula → «La competencia no corresponde al ciclo del aula.»
  - `validStudents(n, year): Student[]`: solo niños activos del aula del registro (Review Focus 1).
  - `performanceOptions(params: { classroom: Classroom; students: Student[]; competencyId: string; date: string; schoolYear: number }): { bands: AgeBand[]; defaultBand: AgeBand }`.
    - `bands` = bandas únicas de `bandFor` para cada niño seleccionado, filtradas a las que tienen desempeños para esa competencia (`getPerformanceBands`).
    - Si no hay niños, se usan las bandas del aula.
    - `defaultBand` = la más frecuente entre los niños; si empatan, la menor.
  - `periodOf(date, periods): Period["id"] | null`.
  - `filterNotes(notes, q: { studentId?; areaId?; competencyId?; periodId?; kind?; text?; periods: Period[]; students: Student[] }): FieldNote[]`.
    - Orden: fecha descendente y luego `updatedAt` descendente.
    - La búsqueda ignora mayúsculas y tildes, y busca en `evidenceText`, `interpretation`, `reflection` y en los nombres de los niños.
  - `studentsWithoutRecentNotes(notes, students, today, days = 14): Student[]`.

- [ ] **Step 1: Tests fallidos** de cada función:
  - Cada mensaje de error exacto.
  - `performanceOptions` con un aula multiedad de 3 y 4 años y dos niños de 3 años y uno de 4 → `bands:["3y","4y"]`, `defaultBand:"3y"`.
  - Una competencia sin desempeños en una banda → esa banda se excluye.
  - La búsqueda «jose» encuentra «José».
  - `periodOf` justo en el límite de un bimestre.
  - Un niño archivado se excluye de `validStudents`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar sin dependencias nuevas. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(notes): pure field-note rules, performance options and filters`.

### Task 3: Notas en el WorkspaceProvider

**Files:**
- Modify: `sistema-web/src/workspace/WorkspaceProvider.tsx`
- Test: `sistema-web/src/workspace/WorkspaceProvider.test.tsx`

**Interfaces:**
- Consumes: `loadNotes`/`saveNotes` (Task 1).
- Produces: en `WorkspaceValue`:
  - `notes: FieldNote[]`, que se cargan junto con el año y se recargan con `setYear`/`reload`.
  - `updateNotes(fn: (f: NotesFile) => NotesFile): Promise<boolean>`, con la misma semántica que `update`: cola compartida, guarda de generación, aviso de error y `true` solo si se guardó.

- [ ] **Step 1: Tests fallidos:**
  - `updateNotes` guarda en `cuaderno.json`.
  - Un `update` y un `updateNotes` disparados juntos se serializan.
  - Un fallo de `saveNotes` devuelve `false`, muestra el aviso y el estado vuelve a lo del disco.
  - Cambiar de año carga las notas de ese año.
  - Un `cuaderno.json` corrupto muestra el error de datos y no escribe nada.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(workspace): load and save field notes through the write queue`.

### Task 4: Lista del cuaderno y acceso desde Inicio

**Files:**
- Create: `sistema-web/src/app/(app)/cuaderno/page.tsx`
- Modify: `sistema-web/src/components/AppShell.tsx` («Cuaderno» → `/cuaderno/`)
- Modify: `sistema-web/src/app/(app)/inicio/page.tsx`
- Test: `sistema-web/src/app/(app)/cuaderno/cuaderno.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace().notes`, `filterNotes`, `periodOf`, `studentsWithoutRecentNotes` (Task 2); `NOTE_KIND_LABELS` (Task 1); `getAreas`, `getCompetencies`.
- Produces:
  - Página `/cuaderno/` con el botón «Nuevo registro», que lleva a `/cuaderno/registro/`.
  - Filtros: niño o niña, área, competencia, bimestre y tipo, más una búsqueda.
  - Cada tarjeta muestra la fecha (sello día y mes), el tipo, el área y la competencia, los niños (o «Todo el grupo»), las primeras 3 líneas de `evidenceText`, hasta 4 miniaturas y el enlace «Abrir» a `/cuaderno/registro/?id=…`.
  - Estado vacío: «Todavía no hay registros. Toca «Nuevo registro» para tu primera observación.»
  - Inicio añade el botón «Nuevo registro», los últimos 3 registros y el aviso «N niños sin observaciones en las últimas 2 semanas», con nombres.

- [ ] **Step 1: Tests fallidos:**
  - Los filtros reducen la lista.
  - La búsqueda ignora tildes.
  - El estado vacío muestra ese texto.
  - Las miniaturas se leen con `storage.readFile` y se revocan al desmontar.
  - El aviso de Inicio cuenta bien a los niños sin registros.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(notes): field-notebook list with filters and home shortcuts`.

### Task 5: Ficha de registro (crear, editar, borrar, fotos)

**Files:**
- Create: `sistema-web/src/app/(app)/cuaderno/registro/page.tsx`
- Create: `sistema-web/src/notes/PerformancePicker.tsx`
- Create: `sistema-web/src/notes/EvidencePhotos.tsx`
- Modify: `sistema-web/src/domain/photo.ts` (`compressPhoto(file, maxSize = 800)`; las evidencias usan 1600)
- Test: `sistema-web/src/app/(app)/cuaderno/registro/registro.test.tsx`, `sistema-web/src/notes/PerformancePicker.test.tsx`

**Interfaces:**
- Consumes: `newNote`, `upsertNote`, `removeNote`, `validateNote`, `validStudents`, `performanceOptions` (Task 2); `noteDir` (Task 1); `updateNotes` (Task 3); `activeCompetencies`, `getAreas`, `getPerformances`.
- Produces: la página lee `id` de `window.location.search` (sin `useSearchParams`). Sin `id` crea un registro nuevo; con un id desconocido muestra «No encontramos ese registro.» y un enlace a la lista. Campos, en este orden (ficha del cliente):
  1. Fecha.
  2. Aula, que muestra el grado y la sección del aula.
  3. Niños y niñas, como chips, con «Todo el grupo».
  4. Momento de la jornada.
  5. Tipo.
  6. **Evidencias**: un textarea «¿Qué hizo o dijo? Describe los hechos» y las fotos (cámara o archivo, `accept="image/*"`, varias a la vez).
  7. Área, con las áreas del ciclo que tengan alguna competencia activa.
  8. Competencia, con las activas del aula y esa área.
  9. **Desempeños**: `PerformancePicker` muestra los desempeños de `defaultBand` como checkboxes con el texto, y el ejemplo plegado bajo «Ver ejemplo». Si `bands.length>1` o la docente quiere cambiar, aparece un selector «Edad de referencia».
  10. **Interpretación en relación al desempeño**.
  11. **Reflexión docente en relación a la actividad**.
  12. Nivel de logro (opcional), oculto en ciclo I «descriptive».
  - Botones «Guardar», «Cancelar» y, si es un registro existente, «Eliminar registro», con confirmación en la página: «¿Eliminar este registro y sus fotos? No se puede deshacer.» + «Sí, eliminar» / «No».
  - Guardar: valida con `validateNote` y muestra el error. Con `updateNotes` en `true`, muestra «Registro guardado.» y vuelve a `/cuaderno/`; con `false`, se queda en la página con los datos.
  - Fotos: cada archivo se comprime y se escribe como `noteDir/evidencia-<n>.jpg` (n libre). La ruta se añade a `evidence` **solo después** de escribir el archivo. Si una foto falla, se omite y se muestra «No se pudo guardar una de las fotos.» (Review Focus 2). Quitar una foto saca la ruta y borra el archivo al guardar.
  - Eliminar: primero `updateNotes(removeNote)`, luego se borran los archivos de evidencia con `storage.remove` (best-effort, silencioso) (Review Focus 3).
  - Cambiar de aula limpia los niños, la competencia y los desempeños elegidos.

- [ ] **Step 1: Tests fallidos:**
  - Crear un registro completo y comprobar el `cuaderno.json` guardado (con `performances[].text` copiado).
  - Editar un registro existente.
  - Error de validación visible.
  - Con `saveNotes` rechazando: no aparece «Registro guardado.» y se quedan los datos.
  - Una foto que falla al escribir no deja ruta.
  - Eliminar quita el registro y llama a `remove` por cada foto.
  - El ciclo I descriptivo oculta el nivel.
  - El selector de edad cambia la lista de desempeños.
  - El id desconocido muestra su mensaje.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar, con objetivo de menos de un minuto: el foco inicial va en evidencias y se recuerdan el aula y el momento del último registro. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(notes): field-note form with performances picker and evidence photos`.

### Task 6: Núcleo de IA (proveedores, ajustes, consentimiento, anonimización)

**Files:**
- Create: `sistema-web/src/ai/types.ts`, `sistema-web/src/ai/deepseek.ts`, `sistema-web/src/ai/claude.ts`, `sistema-web/src/ai/settings.ts`, `sistema-web/src/ai/anonymize.ts`, `sistema-web/src/ai/prompts.ts`
- Create: `sistema-web/src/app/(app)/perfil/AiSettings.tsx` (sección en /perfil/)
- Test: `sistema-web/src/ai/*.test.ts`, `sistema-web/src/app/(app)/perfil/AiSettings.test.tsx`

**Interfaces:**
- Produces:
  - `type AiProviderId = "deepseek" | "claude"`.
  - `interface AiRequest { system: string; prompt: string; images?: Blob[]; onText?(full: string): void; signal?: AbortSignal }`.
  - `class AiError extends Error { code: "no-key" | "invalid-key" | "rate-limit" | "network" | "refused" | "no-images" | "other" }`.
  - `generate(provider: AiProviderId, apiKey: string, req: AiRequest): Promise<string>`, con streaming.
    - DeepSeek: SSE `data:` con `choices[0].delta.content`; si recibe `images`, lanza `no-images`. Los HTTP 401/403 dan `invalid-key`, el 429 da `rate-limit`, y un `TypeError` de fetch da `network`.
    - Claude: SDK con los parámetros de Global Constraints. Las imágenes van como bloques base64 antes del texto. Se mapean `AuthenticationError`/`PermissionDeniedError`, `RateLimitError`, `APIConnectionError` y `stop_reason "refusal"`.
  - `AiSettings { enabled: boolean; provider: AiProviderId; apiKey: string; consentAt?: string }`, con `loadAiSettings(userId)` y `saveAiSettings(userId, s)` en localStorage, con try/catch.
  - `anonymize(text, students): { text: string; legend: Record<string,string> }`. Reemplaza nombres y apellidos de cada niño (palabra completa, sin importar tildes ni mayúsculas) por sus iniciales «V. Q.».
  - `AI_ERROR_MESSAGES` en español:
    - no-key → «Agrega tu clave de IA en Perfil.»
    - invalid-key → «La clave de IA no es válida.»
    - rate-limit → «Se alcanzó el límite de uso o no hay saldo. Intenta más tarde.»
    - network → «Sin conexión a internet. La IA necesita internet; lo demás funciona sin conexión.»
    - refused → «La IA no pudo responder a esta solicitud.»
    - no-images → «Describir fotos solo está disponible con Claude.»
    - other → «No se pudo generar el texto. Intenta de nuevo.»
  - `prompts.ts`: `SYSTEM_PROMPT`, que establece contexto de docente de inicial en Perú, CNEB y evaluación formativa, en español peruano claro y sin inventar datos. Además, constructores para:
    - `objectiveEvidence`: hechos observables, tercera persona, sin juicios de valor, citas entre comillas, máximo 6 oraciones.
    - `suggestCompetency`: devuelve SOLO JSON `{competencyId, performanceIndexes:number[], reason}` eligiendo de la lista enviada.
    - `interpretation`: 2 o 3 oraciones, sin calificar.
    - `describePhoto`: 3 o 4 oraciones objetivas.
    - `parseSuggestion(text)`, tolerante a texto alrededor del JSON.
  - `AiSettings.tsx`: el interruptor «Usar asistente de IA», el proveedor (DeepSeek o Claude) y la clave (input `type="password"`; muestra solo los últimos 4 caracteres). Al activar por primera vez muestra el consentimiento: «Al usar el asistente, el texto que elijas (y la foto, si lo pides) se envía a <proveedor> para generar la redacción. <Proveedor> procesa los datos en <país>. Los nombres de los niños se reemplazan por iniciales antes de enviarse. Tu clave se guarda solo en este navegador.», con «Acepto» / «Cancelar». Incluye un botón «Probar» que llama a `generate` con un prompt corto y muestra el resultado o el error.

- [ ] **Step 1: Tests fallidos:**
  - `anonymize` con «José María Quispe», «jose», «QUISPE» y nombres que son subcadenas de otras palabras (no deben tocarse) (Review Focus 5).
  - Parseo SSE de DeepSeek con `fetch` simulado: varios chunks, `[DONE]`, 401 → invalid-key, `TypeError` → network.
  - Mapeo de errores de Claude con el cliente del SDK simulado (inyectable), que incluye `refusal`.
  - `parseSuggestion` con JSON envuelto en texto.
  - Ida y vuelta de los ajustes por userId; el consentimiento es obligatorio para activar.
  - DeepSeek con imágenes da `no-images`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar (`npm i @anthropic-ai/sdk`). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(ai): optional writing assistant core with consent, own key and anonymization`.

### Task 7: IA en la ficha de registro

**Files:**
- Create: `sistema-web/src/notes/AiActions.tsx`
- Modify: `sistema-web/src/app/(app)/cuaderno/registro/page.tsx`
- Test: `sistema-web/src/notes/AiActions.test.tsx`

**Interfaces:**
- Consumes: `generate`, `loadAiSettings`, `anonymize`, `prompts`, `AI_ERROR_MESSAGES` (Task 6); `useAccount().profile.id`; los datos del formulario (Task 5).
- Produces: si `enabled` es true, aparecen botones junto a cada campo:
  - «Redactar de forma objetiva» (evidencias).
  - «Sugerir competencia y desempeños», que envía las competencias activas del aula y los desempeños de la banda por defecto numerados.
  - «Redactar interpretación», que usa la evidencia y los desempeños elegidos.
  - «Describir la foto», solo con Claude y al menos una foto.
  - El resultado se muestra en un recuadro con streaming y los botones «Usar este texto» / «Descartar». **Nunca reemplaza el campo sin el clic** (Review Focus 4). Para la sugerencia, «Usar» fija área, competencia y desempeños; los índices inválidos se ignoran.
  - Todo texto con nombres pasa por `anonymize` antes de enviarse.
  - Solo hay una solicitud a la vez por botón (deshabilitado mientras corre), y hay «Cancelar» con `AbortController`.
  - Los errores se muestran con `AI_ERROR_MESSAGES`.

- [ ] **Step 1: Tests fallidos** con `generate` simulado:
  - Lo enviado no contiene el nombre real.
  - «Descartar» deja el campo intacto.
  - «Usar» reemplaza el campo.
  - La sugerencia aplica competencia y desempeños.
  - La IA desactivada no muestra botones.
  - DeepSeek oculta «Describir la foto».
  - Un error muestra su mensaje y el campo queda intacto.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS. Correr `build`.
- [ ] **Step 5:** Commit `feat(notes): AI writing actions in the field-note form`.

### Task 8: Flujo E2E del cuaderno

**Files:**
- Modify: `sistema-web/e2e/base.spec.ts` (o crear `sistema-web/e2e/cuaderno.spec.ts` reutilizando los helpers, extraídos a `e2e/helpers.ts`)

- [ ] **Step 1:** Escribir el E2E en Chromium. Usa Supabase simulado y la carpeta OPFS, igual que en el Plan 1.
  - Preparación: docente activa → aula «Girasoles» ciclo II 4 años → «Valentina Quispe».
  - Flujo: «Nuevo registro» → elegir a Valentina → evidencia «Agrupó los bloques por color» + 1 foto (una imagen PNG generada en el test) → área Matemática → «Resuelve problemas de cantidad» → marcar el primer desempeño → interpretación y reflexión → Guardar.
  - Comprobaciones: aparece en la lista; tras recargar sigue ahí con su miniatura; el filtro por área lo muestra; borrarlo lo quita.
  - Todas las peticiones a `api.deepseek.com` y `api.anthropic.com` se bloquean con `route.abort()` para verificar que nada sale sin la IA activada.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` → todo PASS; `out/` no cambia.
- [ ] **Step 3:** Commit `test(e2e): field-notebook create, persist, filter and delete`.
