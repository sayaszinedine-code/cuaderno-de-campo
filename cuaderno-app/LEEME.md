# Cuaderno de Campo Inicial

App para docentes de educación inicial (CNEB, Perú). Sirve como cuaderno de campo con fotos de evidencia, fichas por niño, asistencia y agenda. Incluye dictado por voz, asistente de redacción con IA y exportación del portafolio, la asistencia y los respaldos.

Funciona **sin internet**. Los datos y las fotos se guardan solo en el dispositivo de la docente. Solo el asistente de IA necesita conexión.

---

## Para la docente: cómo instalar

### En el celular Android (APK)
1. Copia `cuaderno-de-campo.apk` al celular (por WhatsApp, Drive o cable).
2. Ábrelo. Si Android lo pide, permite **"Instalar apps desconocidas"** para esa app (WhatsApp, Archivos…).
3. Toca **Instalar** y abre **Cuaderno de Campo**.

### En la laptop (o en iPhone)
La versión web es la carpeta `www`. Se instala como app desde el navegador:
1. Publica la carpeta `www` en un hosting gratuito. La forma más fácil es **app.netlify.com/drop**: arrastra la carpeta y te da un enlace `https://…`.
2. Abre el enlace en **Chrome o Edge** y pulsa el ícono **Instalar** de la barra de direcciones (en iPhone: Safari › Compartir › "Añadir a pantalla de inicio").
3. Desde entonces abre como una app y funciona sin internet.

> Los datos de la laptop y del celular **no se sincronizan solos**. Para pasar los datos de un equipo a otro: Más › *Descargar respaldo* en uno, y Más › *Restaurar respaldo* en el otro.

### Activar el asistente de IA (opcional)
1. Crea una cuenta en **console.anthropic.com**, carga saldo y genera una clave en *API Keys*.
2. En la app: **Más › Asistente de IA**. Pega la clave, toca **Guardar** y luego **Probar**.
3. Cada redacción cuesta aproximadamente 1 a 3 céntimos de dólar. La clave queda guardada solo en ese dispositivo.

### Importante
- **Haz un respaldo cada semana** (Más › Descargar respaldo) y guárdalo en Drive o en tu correo. Si desinstalas la app o cambias de celular, solo se recupera con el respaldo.

---

## Para el desarrollador: cómo compilar el APK

Requisitos: Node 18+, JDK 17 y Android SDK (plataforma 34, build-tools 34).

```bash
npm install
npm run apk
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

**Sin instalar el Android SDK:** sube el proyecto a GitHub y ejecuta la acción **"Compilar APK"** (`.github/workflows/apk.yml`). El APK aparece en *Artifacts*.

**Para publicar en Play Store** hace falta un APK/AAB firmado (`./gradlew bundleRelease` con un keystore propio) y una cuenta de Google Play Console.

### Estructura
- `www/index.html` — toda la app (HTML, CSS y JS sin frameworks).
- `src/ia.js` — conexión con Claude (SDK oficial de Anthropic, modelo `claude-opus-5-5`). Se empaqueta en `www/vendor/ia.js` con `npm run build:ia`.
- `www/sw.js`, `www/manifest.webmanifest` — versión web instalable y sin conexión.
- `android/` — proyecto nativo generado por Capacitor 6. Plugins: voz (`@capacitor-community/speech-recognition`), archivos y compartir.
