# APK de Android + descarga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Capacitor Android APK that opens the published web system, and a download button/page on the web.

**Architecture:** Web side: `src/apk/inApk.ts` detects the APK by a user-agent marker; landing + `/descargar/` link to `/descargas/cuaderno-de-campo.apk`. APK side: new `apk/` Capacitor 6 project with `server.url` = the live site, offline fallback page, icons/splash rendered from `sistema-web/public/logo.svg`.

**Tech Stack:** Next.js 15 static export, Vitest/Playwright; Capacitor 6, Android SDK 34, JDK 17, Gradle.

**Spec:** `docs/superpowers/specs/2026-11-27-android-apk-design.md`

## Global Constraints

- appId `pe.cuadernodecampo.web`; appName «Cuaderno de Campo»; `server.url` `https://cuaderno-de-campo-inicial.netlify.app/inicio/`; user-agent marker `CuadernoDeCampoApp`.
- Status bar / theme `#E0408F`, splash background `#FFF9F0`.
- APK served at `/descargas/cuaderno-de-campo.apk` with `Content-Type: application/vnd.android.package-archive`; never precached by `sw.js`.
- Do not touch `cuaderno-app/` or `entrega/`. No personal names.
- Only new deps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` 6.x in `apk/`.

## Review Focus

1. Opening the APK with no internet the first time → friendly offline page, not a WebView error. (Task 2: fallback page + `errorPath`)
2. Inside the APK the «Descargar para Android» button and the browser «Instalar app» button are hidden. (Task 1 test)
3. `.apk` not added to the service-worker precache. (Task 1 test on build-sw)
4. Links to other hosts (e.g. Supabase email links) don't trap the user inside the WebView. (Task 2: `allowNavigation` limited to the site host)
5. Installing the new APK never replaces the old app (different appId). (Task 2 verification with apkanalyzer)

---

### Task 1: Web download (button, page, headers)

**Files:** Create `sistema-web/src/apk/inApk.ts`, `inApk.test.ts`, `sistema-web/src/app/descargar/page.tsx`, `descargar.test.tsx`; Modify `sistema-web/src/app/page.tsx`, `page.test.tsx`, `sistema-web/src/pwa/InstallButton.tsx`, `sistema-web/public/_headers`, `netlify.toml`, `sistema-web/scripts/build-sw.test.ts`

**Interfaces (Produces):** `APK_URL = "/descargas/cuaderno-de-campo.apk"`; `isInApk(userAgent?: string): boolean` (default `navigator.userAgent`, contains `CuadernoDeCampoApp`).

- [ ] **Step 1: Failing tests:** `isInApk` true/false by UA; landing has link «Descargar para Android» → `/descargar/`; `/descargar/` page has heading «Instala la app en tu Android», link «Descargar APK» with `href=APK_URL` and `download` attribute, and 3 list items (descargar / permitir apps desconocidas / abrir); landing hides the Android link when `isInApk()` (stub UA); InstallButton renders nothing in the APK; build-sw does not precache `.apk` (fixture dir with an .apk).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; headers for `/descargas/*.apk`. **Step 4:** PASS + full suite. **Step 5:** Commit `feat(web): Android download button and page`.

### Task 2: Capacitor project and APK

**Files:** Create `apk/package.json`, `apk/capacitor.config.json`, `apk/www/index.html` (offline fallback), `apk/scripts/build-assets.mjs`, `apk/README.md`, `apk/.gitignore`; generated `apk/android/` (committed like `cuaderno-app/android`, minus build outputs).

- [ ] **Step 1:** `npm install` the 3 deps in `apk/` (approved). `npx cap add android`.
- [ ] **Step 2:** Config: `server.url`, `server.errorPath: "index.html"`, `server.allowNavigation: ["cuaderno-de-campo-inicial.netlify.app"]`, `android.appendUserAgent: "CuadernoDeCampoApp"`, `backgroundColor: "#FFF9F0"`; status-bar color via `styles.xml` `colorPrimaryDark`.
- [ ] **Step 3:** `build-assets.mjs` (Playwright, from `../sistema-web`) renders `logo.svg` into `mipmap-*/ic_launcher(.png|_round.png|_foreground.png)` at 48/72/96/144/192 px and splash `drawable*/splash.png` (logo centered on `#FFF9F0`).
- [ ] **Step 4:** `npx cap sync android && cd android && ./gradlew assembleDebug` → `app-debug.apk`; `apkanalyzer manifest application-id` = `pe.cuadernodecampo.web`, label «Cuaderno de Campo».
- [ ] **Step 5:** Copy to `sistema-web/public/descargas/cuaderno-de-campo.apk`; commit `feat(apk): Capacitor Android app that opens the web system`.

### Task 3: Verification

- [ ] `npm run lint && npm run typecheck && npx vitest run --maxWorkers=4 && npm run e2e` in `sistema-web` → green; `npm run build` then `out/descargas/cuaderno-de-campo.apk` exists and `out/sw.js` does not mention it.
- [ ] Screenshot landing + `/descargar/` (desktop, phone).
