# APK de Android del sistema web + descarga desde la web — diseño corto

## Intención
La docente quiere que la app de Android tenga los colores y el logo nuevos y que se pueda **descargar desde la página
web**. Eligió la opción **B**: la APK es el **mismo sistema web nuevo** dentro de una app de Android (misma cuenta, mismas
funciones, mismo diseño), no la app anterior (`cuaderno-app`).

## Metas
1. **APK nueva** en una carpeta propia `apk/` (Capacitor 6, como la app anterior):
   - Abre `https://cuaderno-de-campo-inicial.netlify.app/inicio/` dentro de la app (`server.url`); por eso cada
     publicación de la web llega sola a la APK, sin reinstalar.
   - Nombre «Cuaderno de Campo», identificador **`pe.cuadernodecampo.web`** (distinto de la app anterior
     `pe.cuadernoinicial.app`, así ambas pueden convivir y nada borra los datos de la anterior).
   - Ícono y pantalla de inicio con el logo nuevo (cuaderno con crayón) y el rosa/crema de la paleta; barra de estado
     rosa `#E0408F`.
   - Pantalla propia «Sin conexión — conéctate a internet para la primera apertura» si no hay red la primera vez.
   - Compilada como APK instalable (mismo método que la app anterior: `assembleDebug`, firmada con la clave de esta
     computadora).
2. **Descarga desde la web**:
   - El archivo va en `sistema-web/public/descargas/cuaderno-de-campo.apk`, servido con
     `Content-Type: application/vnd.android.package-archive` (en `netlify.toml` y `public/_headers`). No se guarda en la
     caché sin conexión (pesa ~4 MB).
   - Portada: botón **«Descargar para Android»** junto a «Iniciar sesión»/«Crear una cuenta», con 3 pasos cortos
     (descargar, permitir «instalar apps desconocidas», abrir). Una página `/descargar/` con los pasos y el botón.
   - Dentro de la app (menú «Más» / Inicio) no se muestra el botón de descarga cuando ya se está en la APK.
3. **README** de `apk/`: cómo recompilar y volver a subir la APK.

## No-metas
- No se toca la app anterior (`cuaderno-app`) ni su APK en `entrega/`.
- No se publica en Google Play (eso pide cuenta de pago y firma de publicación).
- No cambia el sistema web salvo la descarga y detectar «estoy dentro de la APK».

## Anti-metas
- Que instalar la APK borre o reemplace la app anterior y sus datos.
- Ofrecer una APK con un nombre propio de una docente.
- Que la web pública pese más o funcione peor sin conexión por culpa del archivo APK.

## Enfoques considerados
- **APK que abre la web publicada** (elegido): siempre al día y con el mismo diseño; necesita internet la primera vez y
  para iniciar sesión (luego funciona sin conexión gracias al modo sin internet de la web).
- APK con la web copiada dentro: abre sin internet desde el primer momento, pero cada cambio exige compilar e instalar
  de nuevo; las docentes quedarían con versiones viejas.
- Sin APK, solo guía para «Instalar app» desde el navegador: descartado por la docente (quiere un archivo APK).

## Limitaciones a decir en la página de descarga
- Dentro de la APK no se puede elegir una carpeta del celular: los datos se guardan en la app; hay que hacer respaldos
  (la web ya lo avisa).

## Requiere confirmación
- Instalar dependencias en `apk/`: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (6.x, oficiales de Ionic, las
  mismas que usa la app anterior).

## Para quien lo construya
- Tamaños de ícono/splash por densidad; textos exactos de la página de descarga; cómo detectar la APK
  (`navigator.userAgent` con marca propia vía `appendUserAgent` de Capacitor: `CuadernoDeCampoApp`).
