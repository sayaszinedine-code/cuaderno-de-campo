# Tema colorido de inicial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pastel early-childhood palette with one color per section, Fredoka/Nunito fonts, and the new notebook-and-crayon logo across the web app.

**Architecture:** Tokens in `src/styles/theme.css` (light + dark) drive everything; a single section→color map (`src/components/sections.ts`) feeds nav, headers, tiles and Fab; a `Logo` component replaces the PNG in the UI; PNG app icons are rendered from `public/logo.svg` by a Playwright script.

**Tech Stack:** Next.js 15 static export (`next/font/google`, self-hosted at build), Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-colorful-theme-design.md`

Commands from `sistema-web/`. Full suite: `npx vitest run --maxWorkers=4`.

## Global Constraints

- No new npm dependencies; fonts via built-in `next/font/google` (self-hosted at build, offline OK).
- No change to labels, button texts, accessible names, routes or data.
- Palette (light): background `#FFF9F0`, foreground `#3b2f5c`; strong/soft: rosa `#E0408F`/`#FFE0F0`, celeste `#1A9BD7`/`#DDF4FF`, naranja `#E8890C`/`#FFEFD6`, lima `#5E9A0A`/`#EAFBC8`, lila `#8A4FD8`/`#F0E6FF`, amarillo `#C98A00`/`#FFF3D6`. Strong tones may be darkened only as needed to reach contrast.
- Text contrast ≥ 4.5:1 (strong tone on its soft tone and on white; foreground on background), in light and dark.
- Section colors: inicio amarillo, cuaderno rosa, ninos celeste, notas naranja, asistencia lima, agenda lila, reportes lila, aulas celeste, unidades naranja, perfil/carpeta/cuenta/admin lila.
- Primary button rosa. No third-party deck illustrations.

## Review Focus

1. Dark mode: every strong/soft pair and the multicolor wordmark stay readable on dark surfaces. (Task 1 contrast test covers both themes)
2. Moving legacy `.card/.btn-*/.field` into `@layer components` must not undo intentional overrides elsewhere (e.g. `!min-h-9` on the year select, `rounded-none` on the sidebar). (Task 1: grep + screenshots in Task 5)
3. Active section in nav when on a sub-route (`/cuaderno/registro/`, `/notas/anual/`, `/unidades/unidad/`) → parent section color. (Task 2 test)
4. App icon PNGs: maskable icon keeps the logo inside the safe zone (80% circle). (Task 3 script pads to 80%)
5. Fonts unavailable at build time (no network) must not break the build silently → `next/font` fails loudly; documented. (Task 3 note)

---

### Task 1: Palette tokens, section map, CSS layering

**Files:** Modify `src/styles/theme.css`; Create `src/components/sections.ts`, `src/components/sections.test.ts`, `src/styles/palette.test.ts`

**Interfaces (Produces):**
- `type SectionColor = "rosa" | "celeste" | "naranja" | "lima" | "lila" | "amarillo"`
- `sectionColor(pathname: string): SectionColor` — longest matching section prefix of the map in Global Constraints, default `"lila"`.
- CSS: `--c-{color}` and `--c-{color}-soft` for each color (light + dark); utility class `.sec-{color}` that sets `--sec` and `--sec-soft` to that pair.

- [ ] **Step 1: Failing tests:** `sections.test.ts` — `sectionColor("/cuaderno/")==="rosa"`, `("/cuaderno/registro/")==="rosa"`, `("/notas/anual/")==="naranja"`, `("/ninos/ficha/")==="celeste"`, `("/inicio/")==="amarillo"`, `("/agenda/")==="lila"`, `("/desconocido/")==="lila"`. `palette.test.ts` — parse `theme.css` (`fs.readFileSync`), for light and dark blocks read each `--c-X` / `--c-X-soft`, assert WCAG contrast(strong, soft) ≥ 4.5 and contrast(foreground, background) ≥ 4.5.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement tokens (light, `prefers-color-scheme: dark` and `[data-theme="dark"]` blocks), map base tokens (`--background`, `--foreground`, `--primary` = rosa, `--accent` = amarillo, `--accent-soft`, success/warning/attention) to the palette; add `.sec-*`; wrap `.card`, `.btn-primary`, `.btn-secondary`, `.field` in `@layer components`; primary button gets `box-shadow: 0 3px 0` darker rosa.
- [ ] **Step 4:** Run → PASS; `npx vitest run --maxWorkers=4` green.
- [ ] **Step 5:** Commit `feat(theme): pastel palette, section colors and layered components`.

### Task 2: Section colors in the shell and screens

**Files:** Modify `src/components/AppShell.tsx`, `src/components/ui/PageHeader.tsx`, `src/components/ui/Fab.tsx`, `src/app/(app)/inicio/page.tsx`, `src/components/NoteCard.tsx`; tests `AppShell.test.tsx`, `ui.test.tsx`

**Interfaces:** Consumes `sectionColor`. `PageHeader` gains nothing — it reads the pathname via `usePathname()` and applies `.sec-{color}`.

- [ ] **Step 1: Failing tests:** AppShell — `each nav link carries its section color` (link «Cuaderno» has class `sec-rosa`, «Niños» `sec-celeste`, «Notas» `sec-naranja`); `the active item uses its section color on sub-routes` (mock pathname `/cuaderno/registro/` → «Cuaderno» link `aria-current="page"`). PageHeader — with mocked pathname `/ninos/`, header root has class `sec-celeste`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Nav items: icon inside a 28px rounded square `bg-[var(--sec-soft)] text-[var(--sec)]`; active item `bg-[var(--sec-soft)] text-[var(--sec)]` (replaces `nav-active`); active also for `pathname.startsWith(href)`. PageHeader: 6px rounded accent bar in `--sec` left of the title, title in Fredoka. Fab background `--sec`. Inicio tiles each `.sec-*` of its target with soft background. NoteCard left border `--c-rosa`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(theme): one color per section in nav, headers, tiles and fab`.

### Task 3: Fonts and logo

**Files:** Modify `src/app/layout.tsx`, `src/styles/theme.css`, `src/components/AppShell.tsx`, `src/components/AuthCard.tsx`, `src/app/page.tsx`, `public/manifest.webmanifest`; Create `src/components/Logo.tsx`, `src/components/Logo.test.tsx`, `public/logo.svg`, `scripts/build-icons.mjs`; regenerate `public/icons/*.png`, `src/app/favicon.ico` → replaced by `src/app/icon.svg` (Next app icon).

**Interfaces (Produces):** `Logo({ size?: number })` decorative SVG (aria-hidden); `Wordmark()` renders «Cuaderno de Campo» with «Campo» letters in 5 colors (accessible text intact).

- [ ] **Step 1: Failing tests:** `Logo is decorative and scalable` (svg aria-hidden, width=size); `Wordmark reads as Cuaderno de Campo` (`toHaveTextContent("Cuaderno de Campo")`, 4 colored spans); landing/AuthCard/AppShell render an `svg` logo and no `img[src="/icons/icon-192.png"]`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `Logo` = the approved notebook (rosa cover, white page, rosa-soft lines, orange crayon with celeste band) on rosa-soft rounded square; `public/logo.svg` same artwork. Fonts: `Fredoka` (600, 700) and `Nunito` (400–800) via `next/font/google` with CSS variables `--font-display` / `--font-body`; body uses Nunito, `h1,h2,h3,.font-display` Fredoka. `themeColor` and manifest `theme_color` `#E0408F`, `background_color` `#FFF9F0`. `scripts/build-icons.mjs`: Playwright chromium renders `public/logo.svg` at 192 and 512 (maskable: logo scaled to 80% on rosa-soft) to `public/icons/`.
- [ ] **Step 4:** Run → PASS; `node scripts/build-icons.mjs` writes 3 PNGs; `npm run build` succeeds.
- [ ] **Step 5:** Commit `feat(brand): notebook-and-crayon logo, Fredoka/Nunito fonts`.

### Task 4: Landing and account screens

**Files:** Modify `src/app/page.tsx`, `src/components/AuthCard.tsx`

- [ ] **Step 1: Failing test** in `page.test.tsx`: `each feature card has its own section color` (4 list items with classes `sec-rosa`, `sec-naranja`, `sec-lila`, `sec-lima`).
- [ ] **Step 2:** FAIL. **Step 3:** Feature cards soft-colored by section; hero with Wordmark large; AuthCard header with Logo + Wordmark. **Step 4:** PASS. **Step 5:** Commit `feat(theme): colorful landing and account screens`.

### Task 5: Verification

- [ ] `npm run lint && npm run typecheck && npx vitest run --maxWorkers=4 && npm run e2e` → green.
- [ ] Screenshots (throwaway Playwright, signed-in mock), light and dark: landing, login, Inicio desktop, Cuaderno phone, Niños phone, registro phone. Check legacy overrides (year select height, sidebar corners) and contrast by eye.
