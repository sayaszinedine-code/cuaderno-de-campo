# Cuaderno a fondo (fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-step note capture (quick on the phone, complete later), «Por completar» state, a day-grouped timeline and a read-only note view.

**Architecture:** Derived helpers in `src/domain/notes.ts`; UI changes in `cuaderno/page.tsx`, `cuaderno/registro/page.tsx`, `NoteCard.tsx`, `inicio/page.tsx`; new static route `cuaderno/ver/page.tsx`. No schema or validation change.

**Tech Stack:** Next.js 15 static export, React 19, Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-cuaderno-phase2-design.md`

All commands from `sistema-web/`. Full suite: `npx vitest run --maxWorkers=4`.

## Global Constraints

- No change to `FieldNote` schema or `validateNote`; no new dependencies.
- No field, filter, photo or datum removed; existing labels stay exact («Fecha», «Aula», «Momento de la jornada», «Tipo», «¿Qué hizo o dijo? Describe los hechos», «Agregar fotos», «Área», «Competencia», «Interpretación en relación al desempeño», «Reflexión docente en relación a la actividad», «Nivel de logro (opcional)», «Eliminar registro»).
- The submit button keeps the accessible name «Guardar» (tests and E2E click it by exact name).
- Folded sections use native `<details>` so their fields stay in the DOM and reachable by label.
- Offline keeps working; static export needs every new route to be a static page reading `?id=` on the client.

## Review Focus

1. Quick save on a phone with «Completar ahora» folded saves exactly what today's save does (same `validateNote`, photos, `writeLast`). (Task 3 test)
2. Editing an existing note that has an area opens «Completar ahora» so nothing looks lost. (Task 3 test)
3. `?estado=pendiente` from Inicio pre-selects the Estado filter and its chip clears it. (Task 2 test)
4. Day headers across year boundaries and «Ayer» on the 1st of a month. (Task 1 test)
5. Read view with an unknown/deleted id shows a friendly «No encontramos este registro» with «Volver», not a crash. (Task 4 test)

---

### Task 1: Domain helpers

**Files:** Modify `src/domain/notes.ts`, `src/domain/notes.test.ts`

**Interfaces (Produces):**
- `isPending(n: FieldNote): boolean` — `!n.areaId`.
- `filterNotes` query gains `status?: "pending" | "complete"`.
- `dayLabel(date: string, today: string): string` — «Hoy», «Ayer», `"12 nov"` (same year as `today`), `"12 nov 2025"` (other year). Months: ene feb mar abr may jun jul ago sep oct nov dic.
- `groupByDay(notes: FieldNote[]): { date: string; notes: FieldNote[] }[]` — keeps input order, consecutive same-date notes grouped.

- [ ] **Step 1: Failing tests:** `isPending` true without area, false with; `filterNotes` status pending/complete/undefined; `dayLabel("2026-11-24","2026-11-24")==="Hoy"`, `("2026-11-23","2026-11-24")==="Ayer"`, `("2026-10-31","2026-11-01")==="Ayer"`, `("2025-12-31","2026-01-01")==="Ayer"`, `("2026-11-12","2026-11-24")==="12 nov"`, `("2025-11-12","2026-11-24")==="12 nov 2025"`; `groupByDay` groups consecutive dates in order.
- [ ] **Step 2:** `npx vitest run src/domain/notes.test.ts` → FAIL. **Step 3:** Implement (date math in UTC from `YYYY-MM-DD`). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(notes): pending status, day labels and grouping helpers`.

### Task 2: Cuaderno timeline, Estado filter, Inicio count

**Files:** Modify `src/app/(app)/cuaderno/page.tsx`, `src/components/NoteCard.tsx`, `src/app/(app)/inicio/page.tsx`, tests `cuaderno.test.tsx`, `inicio.test.tsx`

- [ ] **Step 1: Failing tests:** Cuaderno — `groups records under day headings` (today's note under heading «Hoy»); `Estado filter shows only pending records` (label «Estado», options «Todos», «Por completar», «Completos»); `a pending record is tagged Por completar`; `?estado=pendiente pre-selects the filter` (pushState before render; chip «Quitar filtro: Por completar»). Inicio — `links to pending records` (text «2 registros por completar», href `/cuaderno/?estado=pendiente`); nothing shown when 0.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Cuaderno: read `estado` from `window.location.search` once on mount; Estado select inside FilterBar; list rendered as `groupByDay(list.slice(0, visible))` with `<h2>` `dayLabel` per group and the card grid under it; NoteCard thumbs 96 px (`h-24 w-24`), «Por completar» chip (warning colors) when `isPending`. Pagination text/«Ver más» unchanged. Inicio: count of pending notes in the current year → link card.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(cuaderno): day timeline, pending status filter and Inicio reminder`.

### Task 3: Two-step registro form

**Files:** Modify `src/app/(app)/cuaderno/registro/page.tsx`, `registro.test.tsx`, `src/styles/theme.css`

**Interfaces:** none new outside the page.

- [ ] **Step 1: Failing tests:** `essentials come first` (DOM order: «Niños y niñas» legend, «¿Qué hizo o dijo?…», «Agregar fotos», «Tipo» all before the «Completar ahora» summary); `date, aula and moment are summarised and still editable by label` (summary text contains «Hoy» and the aula name; `getByLabelText("Fecha")` exists); `Completar ahora is open for an existing note with an area`; `Completar ahora is folded for a new note on a phone` (stub `matchMedia` min-width:768px → false); `quick save with the folded section saves the note` (fill essentials, click «Guardar», note persisted with no area); existing tests unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Reorder JSX: header, linked sessions, `<details>` «{dayLabel} · {aula} · {momento} — Cambiar» containing Fecha/Aula/Momento (folded by default), «Lo esencial» section (Niños chips with `Avatar size="sm"`, text, photos with big camera button styling, Tipo), `<details>` «Completar ahora» (Área … Nivel; open when `existing?.areaId` or `matchMedia("(min-width: 768px)").matches`, defaulting to open when `matchMedia` is unavailable), feedback, actions. Phone: actions bar `sticky bottom-[4.5rem]` with full-width «Guardar».
- [ ] **Step 4:** Run registro + cuaderno tests → PASS; `npm run pree2e && npx playwright test e2e/cuaderno.spec.ts e2e/base.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(registro): quick two-step capture with collapsible details`.

### Task 4: Read view

**Files:** Create `src/app/(app)/cuaderno/ver/page.tsx`, `src/app/(app)/cuaderno/ver/ver.test.tsx`; modify `NoteCard.tsx` (Abrir → `/cuaderno/ver/?id=`), `cuaderno.test.tsx` (Abrir href), `e2e/cuaderno.spec.ts` (Abrir → Editar → Eliminar)

- [ ] **Step 1: Failing tests:** `shows the full note read-only` (text, interpretation, reflection, kind, area, children names; no textbox); `Editar goes to the form` (href `/cuaderno/registro/?id=…`); `unknown id shows a friendly message` («No encontramos este registro.» + link «Volver al cuaderno»); `photos load via storage` (alt «Foto 1 del registro»); Cuaderno card `Abrir` href now `/cuaderno/ver?id=a`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (reuse NoteCard's thumbnail hook by exporting it as `useThumbs`). **Step 4:** PASS; E2E cuaderno PASS.
- [ ] **Step 5:** Commit `feat(cuaderno): read-only note view`.

### Task 5: Verification

- [ ] `npm run lint && npm run typecheck && npx vitest run --maxWorkers=4 && npm run e2e` → green.
- [ ] Screenshots (throwaway Playwright, signed-in mock): registro phone 375 (new note), registro desktop 1440, Cuaderno phone with 2 days of notes, read view phone.
