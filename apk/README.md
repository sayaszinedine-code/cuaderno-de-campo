# Cuaderno de Campo — app de Android

App de Android (Capacitor 6) que abre el sistema web publicado
(`https://cuaderno-de-campo-inicial.netlify.app/inicio/`). Cada publicación de la web llega sola a la app: **no hace
falta recompilar la APK para cambios de la web**. Solo hay que recompilarla si cambian el logo, el nombre, los colores
de Android o la dirección del sitio.

- Identificador: `pe.cuadernodecampo.web` (distinto de la app anterior `pe.cuadernoinicial.app`, así pueden convivir).
- Sin internet la primera vez muestra `www/index.html` («Conéctate a internet»).
- La web reconoce la app por la marca `CuadernoDeCampoApp` en el user agent (oculta «Descargar para Android» e
  «Instalar app»).

## Requisitos

Node 18+, JDK 17 y Android SDK 34 (`~/Android/Sdk`). Crea `android/local.properties` con:

```
sdk.dir=/home/<usuario>/Android/Sdk
```

## Recompilar y publicar

```bash
npm install
npm run assets   # solo si cambió el logo (sistema-web/public/logo.svg)
npm run apk      # compila y copia a sistema-web/public/descargas/cuaderno-de-campo.apk
```

Después publica la web (ver `sistema-web/README.md`): la nueva APK queda en `/descargas/cuaderno-de-campo.apk` y la
página `/descargar/` ya apunta ahí.

## Firma

Se compila con `assembleDebug`, firmada con la clave de depuración de esta computadora (`~/.android/debug.keystore`).
Android solo instala una actualización de la APK si viene firmada con la **misma clave**: guarda una copia de ese
archivo. Si se pierde, las docentes tendrían que desinstalar y volver a instalar (sus datos se borrarían; antes, un
respaldo).
