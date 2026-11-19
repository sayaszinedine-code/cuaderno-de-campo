# Sistema web docente — Plan 1: Base (cuentas, carpeta local, currículo, aulas y niños)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar una web estática donde la docente se registra, el administrador la aprueba, ella elige una carpeta de su computadora y gestiona su perfil, año escolar, bimestres, aulas (ciclo I/II) y niños, con todos los datos guardados en esa carpeta y el catálogo curricular completo cargado.

**Architecture:** Next.js con exportación estática (sin servidor) publicada en hosting gratuito. Supabase (plan gratuito) solo para Auth y la tabla `profiles` con RLS. Todo dato pedagógico pasa por una interfaz `Storage` con tres implementaciones: File System Access API (carpeta real), OPFS (respaldo en navegadores sin esa API) y memoria (tests). El dominio se guarda como JSON versionado y validado con zod.

**Tech Stack:** Next.js 15 (App Router, `output: "export"`), React 19, TypeScript estricto, Tailwind CSS 4, zod, `@supabase/supabase-js` v2, `idb-keyval`, Vitest + Testing Library, `@electric-sql/pglite` (tests de RLS), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-sistema-web-docente-inicial-design.md`

## Hoja de ruta (planes siguientes, se escriben al terminar este)

- **Plan 2 — Cuaderno de campo:** ficha completa con evidencias en `Evidencias/`, selector de desempeños por edad, filtros, asistente de IA (DeepSeek/Claude con clave propia, iniciales en vez de nombres, consentimiento).
- **Plan 3 — Notas, unidades y sesiones:** registro por bimestre (ciclo I configurable), conclusiones, consolidado anual, unidades y sesiones con adjuntos.
- **Plan 4 — Asistencia, agenda, reportes y respaldos:** asistencia, agenda, PDF y Excel en `Reportes/`, respaldos `.zip`, restaurar, mover de PC, importar el JSON de la app actual, PWA sin conexión.

## Global Constraints

- Costo cero para el cliente: sin servidor propio; Supabase solo guarda `profiles` (nombre, apellidos, correo, institución, UGEL, región, estado). **Ningún dato de niños ni pedagógico va a Supabase.**
- Interfaz en español (Perú); código, identificadores y commits en inglés (Conventional Commits).
- TypeScript `strict: true`; sin `any` explícito.
- Navegador objetivo: Chrome/Edge de escritorio (File System Access API); fallback OPFS con aviso visible.
- Escritura de JSON atómica: escribir `<archivo>.tmp` y luego reemplazar.
- Estados de cuenta: `pending` | `active` | `suspended`. Revalidación en línea cada 30 días como máximo.
- Ciclo I: grupos de referencia 9, 18, 24, 36 meses. Ciclo II: 3, 4, 5 años (edad cumplida al 31 de marzo del año escolar).
- Ciclo I: 4 áreas y 7 competencias. Ciclo II: 6 áreas y 14 competencias (12 de área + 2 transversales).
- Proyecto en `sistema-web/` dentro del repo `/home/joandry/CUADERNODECAMPOPROFAPK`.

## Review Focus

1. **Permiso de carpeta revocado o carpeta movida/borrada** entre sesiones → la app no debe fallar ni perder datos; debe pedir volver a elegir la carpeta (Task 4).
2. **Fecha de nacimiento posterior a la fecha del registro, o vacía** → la edad no debe ser negativa; el selector de desempeños debe quedar en el grupo del aula (Task 3).
3. **JSON corrupto o de una versión futura en la carpeta** → no sobrescribirlo; mostrar error y ofrecer restaurar respaldo (Task 5).
4. **Sin internet al abrir** con sesión verificada hace menos de 30 días → debe entrar; con más de 30 días → pedir conexión (Task 6).
5. **Docente intentando cambiar su propio `status` a `active` vía API** → RLS lo rechaza (Task 6).

---

### Task 1: Proyecto base y repositorio

**Files:**
- Create: `.gitignore` (raíz: `node_modules/`, `.next/`, `out/`, `entrega/*.apk`, `cuaderno-app/android/app/build/`, `.env*`)
- Create: `sistema-web/` (Next.js con TS, Tailwind, ESLint, App Router, `src/`)
- Create: `sistema-web/next.config.ts` (`output: "export"`, `images: { unoptimized: true }`, `trailingSlash: true`)
- Create: `sistema-web/vitest.config.ts`, `sistema-web/src/test/setup.ts`
- Create: `sistema-web/playwright.config.ts`
- Test: `sistema-web/src/app/page.test.tsx`

**Interfaces:**
- Produces: scripts `npm run dev | build | test | e2e | lint | typecheck` en `sistema-web/package.json`.

- [ ] **Step 1:** `git init` en la raíz y crear la rama de trabajo que proponga el harness. Crear la app: `npx create-next-app@15 sistema-web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`. Instalar dev: `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test`.
- [ ] **Step 2: Test fallido** `page.test.tsx`: renderiza `Home` y espera el texto `"Cuaderno de Campo"` y un enlace `"Iniciar sesión"` con `href="/login/"`.
- [ ] **Step 3:** `npm test` → FAIL (texto no existe).
- [ ] **Step 4:** Reemplazar `src/app/page.tsx` por una portada mínima con ese título y enlace. Configurar `next.config.ts` y `tsconfig` estricto.
- [ ] **Step 5:** `npm test && npm run typecheck && npm run build` → PASS; existe `sistema-web/out/index.html`.
- [ ] **Step 6:** Commit `chore: scaffold static Next.js app with tests`.

### Task 2: Catálogo curricular (áreas, competencias, desempeños)

**Files:**
- Create: `sistema-web/src/curriculum/types.ts`
- Create: `sistema-web/src/curriculum/catalog.ts` (áreas y competencias por ciclo)
- Create: `sistema-web/src/curriculum/performances/*.json` (un archivo por competencia: `{ "competencyId": "...", "byAge": { "9m": [...], "18m": [...], "24m": [...], "36m": [...], "3y": [...], "4y": [...], "5y": [...] } }`, solo las edades que aplican)
- Create: `sistema-web/src/curriculum/index.ts`
- Test: `sistema-web/src/curriculum/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Cycle = "I" | "II"`
  - `type AgeBand = "9m" | "18m" | "24m" | "36m" | "3y" | "4y" | "5y"`
  - `interface Area { id: string; name: string; cycles: Cycle[] }`
  - `interface Competency { id: string; areaId: string; name: string; cycles: Cycle[]; transversal: boolean; optional: boolean }` (`optional` = desactivable por aula: Religión, Castellano 2.ª lengua, transversales)
  - `getAreas(cycle: Cycle): Area[]`, `getCompetencies(cycle: Cycle): Competency[]`, `getPerformances(competencyId: string, band: AgeBand): string[]`
  - `CYCLE_BANDS: Record<Cycle, AgeBand[]>` = `{ I: ["9m","18m","24m","36m"], II: ["3y","4y","5y"] }`

- [ ] **Step 1: Tests fallidos:**
  - `getAreas("I").map(a=>a.name)` = `["Personal Social","Psicomotriz","Comunicación","Descubrimiento del mundo"]`
  - `getAreas("II").map(a=>a.name)` = `["Personal Social","Psicomotriz","Comunicación","Castellano como segunda lengua","Matemática","Ciencia y Tecnología"]`
  - `getCompetencies("I").length === 7`; `getCompetencies("II").filter(c=>!c.transversal).length === 12`; `getCompetencies("II").filter(c=>c.transversal).length === 2`
  - Para cada competencia no transversal del ciclo y cada banda de `CYCLE_BANDS` → `getPerformances(id, band).length > 0`. Excepción: «Se comunica oralmente en castellano como segunda lengua» solo tiene `5y`, y las competencias de Comunicación «Lee» y «Escribe» empiezan en `3y`/`4y`/`5y` según el PDF.
  - Ningún desempeño con texto vacío, saltos de línea partidos a mitad de palabra ni guiones de corte (`/\w-\s\w/`).
- [ ] **Step 2:** `npx vitest run src/curriculum` → FAIL.
- [ ] **Step 3:** Escribir `types.ts`, `catalog.ts` (nombres exactos de competencias del cuadro de la pág. 66 del Programa Curricular) e `index.ts`.
- [ ] **Step 4:** Transcribir los desempeños por edad de cada competencia desde `docs/fuentes/programa-curricular-educacion-inicial.pdf` (secciones 6.1–6.7, tablas «DESEMPEÑOS POR EDAD»). Ayuda: `pdftotext -layout` da texto a dos columnas; verificar cada lista contra la página renderizada. Un desempeño = una viñeta del PDF, texto íntegro.
- [ ] **Step 5:** `npx vitest run src/curriculum` → PASS.
- [ ] **Step 6:** Commit `feat(curriculum): add CNEB initial-level catalog with performances by age`.

### Task 3: Edad y banda de desempeños

**Files:**
- Create: `sistema-web/src/domain/age.ts`
- Test: `sistema-web/src/domain/age.test.ts`

**Interfaces:**
- Consumes: `Cycle`, `AgeBand` (Task 2).
- Produces:
  - `ageInMonths(birthDate: string, at: string): number | null` (ISO `YYYY-MM-DD`; `null` si falta o si nacimiento > `at`)
  - `ageAtMarch31(birthDate: string, schoolYear: number): number | null` (años cumplidos)
  - `bandFor(params: { cycle: Cycle; birthDate?: string; at: string; schoolYear: number; classroomBand: AgeBand }): AgeBand`
  - `formatAge(birthDate: string, at: string): string` → `"4 años 2 meses"` / `"14 meses"` (< 36 meses en meses)

- [ ] **Step 1: Tests fallidos:**
  - `ageInMonths("2025-01-15","2026-03-14") === 13`; `("2025-01-15","2026-03-15") === 14`; `("2027-01-01","2026-01-01") === null`; `("", "2026-01-01") === null`
  - `ageAtMarch31("2022-03-31", 2026) === 4`; `("2022-04-01", 2026) === 3`
  - Ciclo I, hito siguiente o igual: 0 m → `"9m"`, 9 → `"9m"`, 10 → `"18m"`, 18 → `"18m"`, 19 → `"24m"`, 25 → `"36m"`, 40 → `"36m"`
  - Ciclo II: edad al 31-mar 2 → `"3y"`, 3 → `"3y"`, 4 → `"4y"`, 5 → `"5y"`, 6 → `"5y"`
  - Sin fecha de nacimiento o fecha futura → devuelve `classroomBand`
  - `formatAge("2022-01-10","2026-03-20") === "4 años 2 meses"`; `formatAge("2025-01-15","2026-03-15") === "14 meses"`
- [ ] **Step 2:** `npx vitest run src/domain/age.test.ts` → FAIL.
- [ ] **Step 3:** Implementar en `age.ts` sin dependencias (aritmética de fechas sobre `YYYY-MM-DD`, sin zona horaria).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(domain): age and performance band rules`.

### Task 4: Capa de almacenamiento local

**Files:**
- Create: `sistema-web/src/storage/types.ts`
- Create: `sistema-web/src/storage/memory.ts`, `fs-access.ts`, `opfs.ts`, `pick.ts`
- Test: `sistema-web/src/storage/storage.contract.test.ts`, `sistema-web/src/storage/fs-access.test.ts`

**Interfaces:**
- Produces:
  - `interface Storage { kind: "fs-access" | "opfs" | "memory"; label: string; readText(path: string): Promise<string | null>; writeTextAtomic(path: string, text: string): Promise<void>; readFile(path: string): Promise<Blob | null>; writeFile(path: string, data: Blob): Promise<void>; list(dir: string): Promise<{ name: string; kind: "file" | "dir" }[]>; remove(path: string): Promise<void>; }` — rutas relativas con `/`, se crean carpetas intermedias.
  - `class MemoryStorage implements Storage`
  - `class FsAccessStorage implements Storage` (constructor recibe `FileSystemDirectoryHandle`)
  - `class OpfsStorage implements Storage`
  - `type StorageState = { status: "ready"; storage: Storage } | { status: "needs-folder" } | { status: "needs-permission"; folderName: string }`
  - `restoreStorage(): Promise<StorageState>` (lee el handle guardado con `idb-keyval` clave `"workspace-dir"`, consulta `queryPermission({mode:"readwrite"})`)
  - `chooseFolder(): Promise<Storage>` (`showDirectoryPicker({ mode: "readwrite", startIn: "documents" })`, guarda el handle)
  - `grantPermission(): Promise<Storage | null>` (requiere gesto del usuario)
  - `supportsFolderAccess(): boolean`

- [ ] **Step 1: Tests de contrato fallidos** (se corren contra `MemoryStorage` y contra `FsAccessStorage` con un `FileSystemDirectoryHandle` falso en memoria definido en el test): escribir y leer texto con carpetas anidadas; `writeTextAtomic` no deja `.tmp` al terminar; `readText` de inexistente → `null`; `list` ordenado por nombre; `remove` de inexistente no lanza; `writeFile`/`readFile` conservan bytes.
- [ ] **Step 2: Tests fallidos de `restoreStorage`** (mockear `idb-keyval` y el handle): sin handle → `needs-folder`; permiso `"prompt"` → `needs-permission` con `folderName`; permiso `"granted"` → `ready`; handle cuya carpeta ya no existe (`getDirectoryHandle` lanza `NotFoundError` en una lectura de prueba) → `needs-folder`.
- [ ] **Step 3:** `npx vitest run src/storage` → FAIL.
- [ ] **Step 4:** Implementar. Atomicidad en `FsAccessStorage`: escribir `<name>.tmp`, luego `move()` si existe en el handle, si no, reescribir el destino y borrar el `.tmp`.
- [ ] **Step 5:** → PASS.
- [ ] **Step 6:** Commit `feat(storage): local folder storage with fs-access, opfs and memory backends`.

### Task 5: Modelo de datos del espacio de trabajo

**Files:**
- Create: `sistema-web/src/domain/schema.ts` (zod)
- Create: `sistema-web/src/domain/workspace-repo.ts`
- Create: `sistema-web/src/domain/paths.ts`
- Test: `sistema-web/src/domain/workspace-repo.test.ts`, `sistema-web/src/domain/paths.test.ts`

**Interfaces:**
- Consumes: `Storage` (Task 4), `Cycle`, `AgeBand`, `Competency` (Task 2).
- Produces:
  - `SCHEMA_VERSION = 1`
  - `TeacherProfile { firstNames, lastNames, phone, region, address, email, level: "Inicial", ugel, institution }`
  - `Period { id: "B1"|"B2"|"B3"|"B4"; name: string; start: string; end: string }`
  - `Classroom { id; name; cycle: Cycle; bands: AgeBand[] /* >1 = multiedad */; disabledCompetencyIds: string[]; cycleIGrading: "descriptive" | "scale" }`
  - `Student { id; classroomId; firstNames; lastNames; birthDate?; dni?; guardian?; guardianPhone?; motherTongue?; healthNotes?; photo?: string /* ruta relativa */ ; active: boolean }`
  - `YearData { version: 1; schoolYear: number; periods: Period[]; classrooms: Classroom[]; students: Student[] }`
  - `WorkspaceRepo`: `loadProfile(): Promise<TeacherProfile | null>`, `saveProfile(p)`, `listYears(): Promise<number[]>`, `loadYear(y: number): Promise<YearData>` (crea uno por defecto si no existe), `saveYear(d: YearData)`
  - `class WorkspaceDataError extends Error { kind: "corrupt" | "future-version"; path: string }`
  - `defaultPeriods(year: number): Period[]` → B1 `${y}-03-16`..`${y}-05-15`, B2 `${y}-05-18`..`${y}-07-24`, B3 `${y}-08-10`..`${y}-10-09`, B4 `${y}-10-12`..`${y}-12-18`
  - `paths`: `profilePath() = "datos/perfil.json"`, `yearDataPath(y) = "${y}/datos/anio.json"`, `classroomDir(y, c) = "${y}/Aula ${c.name} (${label})/"` donde `label` = `"4 años"`, `"18 meses"` o `"multiedad"`; `studentDir(...) = classroomDir + "Niños/${lastNames}, ${firstNames}/"`; `safeName(s)` elimina `\ / : * ? " < > |` y recorta a 80 caracteres.

- [ ] **Step 1: Tests fallidos:** guardar y cargar perfil y año en `MemoryStorage` (ida y vuelta igual); `loadYear(2026)` sin archivo → `periods` = `defaultPeriods(2026)` y listas vacías; archivo con texto `"{oops"` → lanza `WorkspaceDataError` `kind:"corrupt"` y **el archivo no cambia**; archivo con `version: 2` → `kind:"future-version"`; `listYears` devuelve los años con `anio.json`, ordenados de forma descendente. `paths.test.ts`: `safeName('Aula "A"/B')==='Aula A B'` (espacios colapsados); `classroomDir` para ciclo II 4 años = `"2026/Aula Girasoles (4 años)/"`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(domain): versioned workspace data with zod validation`.

### Task 6: Cuentas, aprobación y RLS en Supabase

**Files:**
- Create: `sistema-web/supabase/migrations/0001_profiles.sql`
- Create: `sistema-web/src/auth/client.ts`, `sistema-web/src/auth/session.ts`
- Create: `sistema-web/.env.example` (`NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`)
- Test: `sistema-web/supabase/rls.test.ts` (PGlite), `sistema-web/src/auth/session.test.ts`

**Interfaces:**
- Produces:
  - Tabla `public.profiles(id uuid pk references auth.users on delete cascade, first_names text not null, last_names text not null, email text not null, institution text, ugel text, region text, status text not null default 'pending' check (status in ('pending','active','suspended')), role text not null default 'teacher' check (role in ('teacher','admin')), created_at timestamptz default now(), status_changed_at timestamptz)`
  - Trigger `on auth.users insert` → crea `profiles` desde `raw_user_meta_data` (`first_names`, `last_names`, `institution`, `ugel`, `region`).
  - Función `public.is_admin() returns boolean security definer` (`role = 'admin'` del `auth.uid()`).
  - Políticas: select propio o admin; update propio **solo** de `first_names, last_names, institution, ugel, region` (trigger `before update` que rechaza cambios en `status`/`role` si `not is_admin()`); update de `status` solo admin; sin insert/delete desde el cliente.
  - `type AccountState = { kind: "signed-out" } | { kind: "pending" | "active" | "suspended"; profile: Profile } | { kind: "offline-expired" }`
  - `resolveAccountState(deps: { fetchProfile(): Promise<Profile | null>; online: boolean; cache: { get(): CachedCheck | null; set(c: CachedCheck): void }; now: Date }): Promise<AccountState>` con `CachedCheck = { userId: string; status: Profile["status"]; checkedAt: string }` y regla de 30 días.
  - `signUp(input: SignUpInput)`, `signIn(email, password)`, `signOut()`, `sendPasswordReset(email)` en `client.ts`.

- [ ] **Step 1: Test de RLS fallido** con PGlite: crear el esquema `auth` mínimo (`auth.users(id uuid, raw_user_meta_data jsonb)`, `auth.uid()` que lee `current_setting('request.jwt.claim.sub', true)::uuid`), los roles `authenticated` y `anon`, y aplicar `0001_profiles.sql`. Casos: la docente A no ve el perfil de B; A no puede `update profiles set status='active'` (error); A sí puede cambiar su `institution`; el admin cambia el `status` de A a `active`; `anon` no ve nada; insertar en `auth.users` crea un perfil `pending` con los datos del metadata.
- [ ] **Step 2: Tests fallidos de `resolveAccountState`:** online con perfil `active` → `active` y guarda en cache; offline con cache `active` hace 29 días → `active`; hace 31 días → `offline-expired`; offline con cache `suspended` → `suspended`; sin sesión → `signed-out`.
- [ ] **Step 3:** → FAIL. **Step 4:** Implementar SQL y módulos. **Step 5:** → PASS.
- [ ] **Step 6:** Commit `feat(auth): supabase profiles with approval status and RLS`.

### Task 7: Pantallas de cuenta y panel de administrador

**Files:**
- Create: `sistema-web/src/app/login/page.tsx`, `registro/page.tsx`, `recuperar/page.tsx`, `cuenta/page.tsx`, `admin/page.tsx`
- Create: `sistema-web/src/components/AccountGate.tsx`
- Create: `sistema-web/src/admin/admin-api.ts`
- Test: `sistema-web/src/components/AccountGate.test.tsx`, `sistema-web/src/admin/admin-api.test.ts`

**Interfaces:**
- Consumes: `resolveAccountState`, `signUp/signIn/...` (Task 6).
- Produces:
  - `<AccountGate>{children}</AccountGate>`: muestra children solo si `active`; `pending` → «Tu cuenta está en revisión. Te avisaremos cuando sea aprobada.»; `suspended` → «Tu cuenta está suspendida. Puedes abrir tu carpeta y exportar tus datos.» + enlace a `/cuenta/`; `offline-expired` → «Conéctate a internet para verificar tu cuenta.»; `signed-out` → redirige a `/login/`.
  - `listTeachers(filter: { status?: Status; q?: string }): Promise<Profile[]>`, `setTeacherStatus(id: string, status: Status): Promise<void>`
  - Registro: campos nombres, apellidos, correo, contraseña (mín. 8), institución, UGEL, región (select con las 25 regiones del Perú + Lima Metropolitana) y casilla obligatoria de aceptación de la política de privacidad (texto de Ley 29733 en `/privacidad/`).

- [ ] **Step 1: Tests fallidos:** `AccountGate` renderiza cada estado con los textos de arriba (mock de `resolveAccountState`); `admin-api` arma la consulta con filtro de estado y búsqueda `ilike` sobre nombre, apellidos, correo e institución (mock del cliente supabase).
- [ ] **Step 2:** → FAIL. **Step 3:** Implementar las páginas y la API (la página `/admin/` solo se muestra si `profile.role === "admin"`; tabla con estado, fecha, institución, UGEL, región; botones Aprobar / Suspender / Reactivar). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(auth): sign-up, login, account gate and admin approval panel`.

### Task 8: Elegir carpeta, perfil y estructura de la app

**Files:**
- Create: `sistema-web/src/app/(app)/layout.tsx` (navegación: Inicio, Cuaderno, Niños, Notas, Unidades, Asistencia, Agenda, Más; los de planes futuros muestran «Próximamente»)
- Create: `sistema-web/src/app/(app)/inicio/page.tsx`, `(app)/perfil/page.tsx`, `(app)/carpeta/page.tsx`
- Create: `sistema-web/src/workspace/WorkspaceProvider.tsx` (contexto con `storage`, `repo`, `year`, `yearData`, `reload()`, `update(fn)`)
- Create: `sistema-web/src/styles/theme.css` (tokens claro/oscuro; patrón decorativo de la presentación: `public/fondo-infantil.png` a baja opacidad)
- Test: `sistema-web/src/workspace/WorkspaceProvider.test.tsx`, `sistema-web/src/app/(app)/carpeta/carpeta.test.tsx`

**Interfaces:**
- Consumes: `restoreStorage`, `chooseFolder`, `grantPermission`, `supportsFolderAccess` (Task 4); `WorkspaceRepo`, `WorkspaceDataError` (Task 5); `AccountGate` (Task 7).
- Produces: `useWorkspace(): { storage: Storage; repo: WorkspaceRepo; year: number; setYear(y: number): Promise<void>; years: number[]; yearData: YearData; update(fn: (d: YearData) => YearData): Promise<void> }` (guarda con `saveYear` tras cada `update`; el año por defecto es el actual, y la cabecera tiene un selector de año para consultar años anteriores).

- [ ] **Step 1: Tests fallidos:** con `needs-folder` se ve «Elige dónde guardar tu cuaderno» y el botón «Elegir carpeta»; con `needs-permission` se ve «Permite el acceso a la carpeta "Cuaderno de Campo"» y el botón «Permitir»; si `supportsFolderAccess()` es falso, se ve el aviso «Tu navegador no permite elegir una carpeta. Tus datos se guardarán dentro del navegador: usa Chrome o Edge en tu computadora y haz respaldos.» y se usa `OpfsStorage`; ante `WorkspaceDataError` se ve «No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada.» y no hay escritura; `update` persiste el año en el storage de memoria.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementar provider, páginas y perfil (formulario con los campos de `TeacherProfile`, que guarda en `datos/perfil.json`; los campos de registro también actualizan `profiles` en Supabase). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(app): folder onboarding, teacher profile and app shell`.

### Task 9: Año escolar, bimestres, aulas y niños

**Files:**
- Create: `sistema-web/src/app/(app)/aulas/page.tsx`, `(app)/ninos/page.tsx`, `(app)/ninos/ficha/page.tsx` (ficha por `?id=`; no hay rutas dinámicas con export estático)
- Create: `sistema-web/src/domain/classrooms.ts`
- Test: `sistema-web/src/domain/classrooms.test.ts`, `sistema-web/src/app/(app)/aulas/aulas.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace` (Task 8); `getCompetencies`, `CYCLE_BANDS` (Task 2); `formatAge` (Task 3); `paths` (Task 5).
- Produces:
  - `createClassroom(d: YearData, input: { name: string; cycle: Cycle; bands: AgeBand[] }): YearData` (por defecto, `disabledCompetencyIds: []` y `cycleIGrading: "descriptive"`)
  - `activeCompetencies(c: Classroom): Competency[]`
  - `addStudent(d, input)`, `updateStudent(d, id, patch)`, `archiveStudent(d, id)` (marca `active: false`; no borra)
  - `updatePeriods(d, periods)` (valida `start <= end` y que no se solapen)

- [ ] **Step 1: Tests fallidos:** `createClassroom` rechaza bandas de otro ciclo (`cycle:"I", bands:["4y"]` → error «Las edades no corresponden al ciclo I»); `activeCompetencies` excluye las desactivadas; `updatePeriods` rechaza solapamientos con el mensaje «El bimestre 2 empieza antes de que termine el bimestre 1»; la UI de aulas permite crear «Girasoles», ciclo II, 4 años, y luego se ve «Aula Girasoles · Ciclo II · 4 años».
- [ ] **Step 2:** → FAIL. **Step 3:** Implementar lógica y pantallas (lista de niños con edad calculada, ficha editable, foto opcional guardada en `studentDir/foto.jpg`, comprimida a 800 px). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(classrooms): school year periods, classrooms by cycle and students`.

### Task 10: Flujo completo de punta a punta y despliegue

**Files:**
- Create: `sistema-web/e2e/base.spec.ts`
- Create: `sistema-web/README.md` (crear el proyecto Supabase gratis, aplicar la migración, nombrar admin con `update profiles set role='admin', status='active' where email='...'`, variables de entorno, desplegar en Vercel o Netlify)

- [ ] **Step 1: E2E** (Playwright, Chromium, con Supabase simulado por `page.route` y `showDirectoryPicker` reemplazado por OPFS en `addInitScript`): registro → pantalla «en revisión» → (mock pasa a `active`) → elegir carpeta → completar perfil → crear aula «Girasoles» ciclo II 4 años → agregar a «Valentina Quispe» → recargar la página → la niña sigue ahí.
- [ ] **Step 2:** `npm run e2e` → PASS. `npm run lint && npm run typecheck && npm test && npm run build` → todo PASS.
- [ ] **Step 3:** Commit `test(e2e): base onboarding flow; docs: setup and deploy guide`.
