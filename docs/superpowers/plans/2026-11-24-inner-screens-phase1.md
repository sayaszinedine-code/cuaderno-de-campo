# Pantallas internas, fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the inner screens feel like an app on phone and desktop: collapsible filters, card lists with avatars, floating «+», full-width layouts, friendlier empty/loading states.

**Architecture:** New presentational primitives in `src/components/ui/`, then applied page by page. No domain, storage or filter-logic changes.

**Tech Stack:** Next.js 15 static export, React 19, Tailwind v4 + `src/styles/theme.css`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-inner-screens-phase1-design.md`

All commands from `sistema-web/`. Full suite: `npx vitest run --maxWorkers=4` (default parallelism times out on this machine).

## Global Constraints

- No new npm dependencies.
- No screen, filter, button, label or datum removed; filter labels stay exactly «Buscar», «Niño o niña», «Área», «Competencia», «Bimestre», «Tipo».
- Existing visible texts asserted by tests stay (e.g. «Todavía no hay registros. Toca «Nuevo registro» para tu primera observación.», «Aún no hay unidades en este bimestre.», «Todavía no hay niños en esta lista.», «Abriendo tu cuaderno…»).
- No hardcoded person names.
- Colors only from theme tokens; animations off under `prefers-reduced-motion`.
- Offline must keep working.

## Review Focus

1. Filters folded away must still be reachable by label (unit tests use `getByLabelText("Tipo")` etc.) and by keyboard. (Task 2 test)
2. Active-filter chip «✕» must reset exactly that filter and the dependent one (clearing Área also clears Competencia, as today). (Task 2 test)
3. Avatar with empty/one-word/accented names → 1–2 uppercase initials, never empty or "undefined"; same name → same color. (Task 1 test)
4. Fab must not cover the bottom nav or the toast area, and must have an accessible name equal to the action. (Task 1 test + screenshot in Task 5)
5. Wider layouts must not stretch forms/text lines across a 1920px screen (forms keep `max-w-3xl`). (Task 5 screenshots)

---

### Task 1: UI primitives

**Files:**
- Modify: `src/components/icons.tsx`, `src/components/icons.test.tsx` (add `buscar`, `filtro`, `cerrar`, `mas-simple`; count 16 → 20)
- Create: `src/components/ui/Avatar.tsx`, `src/components/ui/PageHeader.tsx`, `src/components/ui/Fab.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/ui/Skeleton.tsx`
- Test: `src/components/ui/ui.test.tsx`
- Modify: `src/styles/theme.css` (`.fab`, `.skeleton` shimmer, `.card-interactive` hover/press)

**Interfaces (Produces):**
- `initials(name: string): string` and `avatarHue(name: string): number` (0–359, deterministic) exported from `Avatar.tsx`; `Avatar({ name, size?: "sm" | "md" })` renders `aria-hidden` circle.
- `PageHeader({ title, subtitle?, action?: ReactNode })` — `<h1>` + optional muted subtitle + action slot (action hidden on phones when a Fab exists is the page's choice via className).
- `Fab({ href?, onClick?, label })` — fixed round button bottom-right above the mobile nav (`bottom-24 right-4`, `md:hidden`), `aria-label={label}`, `Icon name="mas-simple"`.
- `EmptyState({ icon: IconName, text, action?: ReactNode })` — `.card` centered, text rendered verbatim in a `<p>`.
- `Skeleton({ lines?: number })` — `aria-hidden` grey bars.

- [ ] **Step 1: Failing tests** in `ui.test.tsx`: `initials("ana lucía quispe") === "AQ"`; `initials("Ana") === "A"`; `initials("  ") === "?"`; `initials("Ñusta Ávila") === "ÑÁ"`; `avatarHue("Ana") === avatarHue("Ana")` and in [0,360); `PageHeader` renders heading + subtitle + action; `Fab` link has accessible name and href; `EmptyState` shows exact text and action; `Skeleton` is aria-hidden. Update `icons.test.tsx` count to 20.
- [ ] **Step 2:** Run `npx vitest run src/components` → FAIL.
- [ ] **Step 3:** Implement. Initials: first letter of first word + first letter of last word (if >1 word), `toLocaleUpperCase("es")`. Hue: simple string hash mod 360.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ui): page header, fab, avatar, empty state and skeleton primitives`.

### Task 2: FilterBar

**Files:**
- Create: `src/components/ui/FilterBar.tsx`, test `src/components/ui/FilterBar.test.tsx`
- Modify: `src/styles/theme.css` (`.filter-panel` sheet on phones)

**Interfaces (Produces):**
- `type ActiveFilter = { key: string; label: string; onClear: () => void }`
- `FilterBar({ search: ReactNode, active: ActiveFilter[], onClearAll: () => void, children: ReactNode })`: search slot always visible; a native `<details>` whose `<summary>` reads `Filtros` + ` (n)` when `active.length > 0`; `children` (the existing labelled selects) inside the panel; chips row below with one `<button aria-label="Quitar filtro: {label}">{label} ✕</button>` per active filter and a «Limpiar» button when ≥1.
- Panel: phones → fixed bottom sheet (`details[open] .filter-panel` with backdrop, rounded top, safe-area padding, «Listo» button that closes the details); `md+` → inline grid under the search.

- [ ] **Step 1: Failing tests:** `selects stay reachable by label while folded` (render with a labelled select child, `getByLabelText` works); `summary shows the active count` («Filtros (2)»); `chip clears its filter` (onClear called once); `Limpiar clears all`; `no chips and no Limpiar when nothing is active`.
- [ ] **Step 2:** Run → FAIL.  **Step 3:** Implement.  **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ui): collapsible filter bar with chips`.

### Task 3: Cuaderno

**Files:** Modify `src/app/(app)/cuaderno/page.tsx`, `src/components/NoteCard.tsx`, `src/app/(app)/cuaderno/cuaderno.test.tsx`, `e2e/cuaderno.spec.ts` (only if a step needs the panel opened)

- [ ] **Step 1: Failing tests** in `cuaderno.test.tsx`: `shows the record count in the header` («2 registros» / «1 registro»); `offers a floating Nuevo registro button` (link name «Nuevo registro» count ≥ 2: header + Fab, Fab href `/cuaderno/registro/`); `active filters appear as removable chips` (set Tipo → chip «Quitar filtro: Logro» clears it); existing tests unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Wrap page in full width; `PageHeader` (title «Cuaderno», subtitle count, action «Nuevo registro» hidden below `md`); `FilterBar` with «Buscar» search input (with `Icon buscar`) and the 5 selects as children; active filters: Niño (student name), Área, Competencia (clearing Área also clears Competencia), Bimestre, Tipo; list as `grid gap-3 md:grid-cols-2 2xl:grid-cols-3`; `EmptyState` with the two existing texts verbatim; `Fab` to `/cuaderno/registro/`. `NoteCard`: add `Avatar` of the (first) student, `.card-interactive`, area/kind as chips.
- [ ] **Step 4:** Run cuaderno tests → PASS; `npx playwright test e2e/cuaderno.spec.ts` after `npm run pree2e` → PASS.
- [ ] **Step 5:** Commit `feat(cuaderno): app-style list with filter bar, cards and fab`.

### Task 4: Niños and Unidades

**Files:** Modify `src/app/(app)/ninos/page.tsx`, `src/app/(app)/unidades/page.tsx` and their tests.

- [ ] **Step 1: Failing tests:** Niños — `each child shows an avatar and links to the ficha`; `floating Agregar niño jumps to the form` (Fab href `#agregar-nino`, form has `id="agregar-nino"`). Unidades — `floating Nueva unidad keeps the current aula and bimestre` (Fab href equals header link href).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Both pages: `PageHeader`, full-width grids (`md:grid-cols-2 2xl:grid-cols-3`), `.card-interactive` whole-card links (Niños: avatar + name + age/aula), `EmptyState` with existing texts verbatim, `Fab`. The 1–2 selects stay inline (fit one line). Niños add-form keeps `max-w-3xl`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ninos,unidades): card grids, avatars and fab`.

### Task 5: Remaining screens, loading state, verification

**Files:** Modify `inicio`, `agenda`, `asistencia`, `notas`, `notas/anual`, `aulas`, `perfil`, `carpeta` pages (header + width only), `src/workspace/WorkspaceProvider.tsx:660`, `src/app/(app)/inicio/inicio.test.tsx`.

- [ ] **Step 1: Failing test:** Inicio — heading is «Inicio» and the greeting moves to a muted subtitle line «Resumen de tu día» (update the three `¡Hola…` assertions: the header already greets).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: `PageHeader` on each listed page; replace `max-w-2xl/3xl` wrappers on Inicio/Agenda with responsive grids where content is cards, keep `max-w-3xl` for forms and tables; WorkspaceProvider loading shows «Abriendo tu cuaderno…» plus `Skeleton`. **Step 4:** Run → PASS.
- [ ] **Step 5:** `npm run lint && npm run typecheck && npx vitest run --maxWorkers=4 && npm run e2e` → all green.
- [ ] **Step 6:** Screenshots (throwaway Playwright script, signed-in mock): Cuaderno desktop 1440 + phone 375 with filters open, Niños phone, Inicio desktop. Check Fab vs bottom nav and toast.
- [ ] **Step 7:** Commit `feat(ui): consistent headers, widths and loading state across screens`.
