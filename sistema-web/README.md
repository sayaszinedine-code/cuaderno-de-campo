# Cuaderno de Campo — sistema web

Aplicación web estática (Next.js, `output: "export"`) para docentes de educación inicial en el Perú.

- **Supabase** se usa solo para cuentas (autenticación) y la tabla `profiles` (datos de registro y estado de aprobación).
- **Los datos de la docente y de los niños nunca salen de su computadora**: se guardan en una carpeta local (API de acceso a carpetas del navegador; si no existe, almacenamiento interno del navegador).

Navegador recomendado: **Chrome o Edge en computadora**. En otros navegadores los datos se guardan dentro del navegador y la app lo advierte.

## 1. Crear el proyecto Supabase (gratis)

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo (plan Free).
2. Abre **SQL Editor** y ejecuta el contenido completo de `supabase/migrations/0001_profiles.sql`.
3. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.

### Configurar Auth

En **Authentication**:

- **Providers → Email**: deja activado «Confirm email» (las docentes confirman su correo).
- **URL Configuration → Site URL**: la URL pública de la app, por ejemplo `https://tu-app.vercel.app`.
- **URL Configuration → Redirect URLs**: agrega
  - `https://tu-app.vercel.app/login/`
  - `https://tu-app.vercel.app/recuperar/`
  - (opcional, para desarrollo) `http://localhost:3000/login/` y `http://localhost:3000/recuperar/`

### Nombrar a la primera administradora

Primero la persona debe registrarse y confirmar su correo en la app. Luego, en el **SQL Editor** (se ejecuta como `postgres`):

```sql
update public.profiles
set role = 'admin', status = 'active'
where email = 'correo@ejemplo.com';
```

Esto debe hacerse por SQL: la protección de la app (RLS y reglas de la migración) solo limita a las usuarias de la app, no a quien ejecuta SQL como `postgres`. Desde ese momento ella aprueba al resto de docentes en `/admin/`.

## 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave anon public>
```

Son valores públicos (se incluyen en el sitio), pero no subas `.env.local` al repositorio. Nunca uses la clave `service_role`.

## 3. Desplegar (Vercel o Netlify, gratis)

```bash
npm install
npm run build
```

Se genera la carpeta `out/` (sitio estático). Opciones:

- **Vercel / Netlify conectados al repositorio**: Build command `npm run build`, Output directory `out`, y define las dos variables de entorno en el panel del servicio.
- **Subida manual**: arrastra la carpeta `out/` a Netlify Drop (<https://app.netlify.com/drop>), o desde la terminal usa `vercel deploy out` (sube la carpeta estática tal cual) o `netlify deploy --dir=out`.

Después del primer despliegue, actualiza la *Site URL* y las *Redirect URLs* de Supabase con la URL real.

### Uso sin conexión (app instalable): cabeceras del hosting

`npm run build` genera además `out/sw.js` (service worker que guarda la app para abrirla sin internet). El hosting debe servir:

- `/sw.js` con `Cache-Control: no-cache`, para que el navegador detecte cada versión nueva y la docente vea «Hay una nueva versión. Recargar.».
- `/manifest.webmanifest` con `Content-Type: application/manifest+json`, para que Chrome y Edge ofrezcan instalar la app.

Netlify (`out/_headers`, copiado desde `public/_headers` si lo creas):

```
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Content-Type: application/manifest+json
```

Vercel (`vercel.json`): agrega en `headers` las mismas dos reglas para `source: "/sw.js"` y `source: "/manifest.webmanifest"`.

## 4. Supabase gratis: pausa por inactividad

Un proyecto del plan Free se **pausa tras 7 días sin actividad**. Mientras está pausado nadie puede iniciar sesión ni registrarse. Para reactivarlo: entra a <https://supabase.com/dashboard>, abre el proyecto y pulsa **Restore project** (tarda unos minutos). Las docentes que ya tenían sesión y comprobación de cuenta reciente pueden seguir usando la app sin conexión hasta por 30 días. Para evitar pausas, entra al panel al menos una vez por semana o pasa a un plan de pago.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000> |
| `npm test` | Pruebas unitarias y de componentes (Vitest) |
| `npm run e2e` | Prueba de punta a punta (Playwright, Chromium). Antes compila la app con Supabase simulado (`pree2e`) en `out-e2e/`; la primera vez ejecuta `npx playwright install chromium` |
| `npm run lint` | ESLint |
| `npm run typecheck` | Revisión de tipos (`tsc --noEmit`) |
| `npm run build` | Compila el sitio estático en `out/` y genera `out/sw.js` (`postbuild`) |

Nota: la compilación de `npm run e2e` (con claves de prueba) va a `out-e2e/` y nunca toca `out/`, la carpeta que se despliega. No despliegues `out-e2e/`.
