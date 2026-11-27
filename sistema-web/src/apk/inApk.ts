/** Where the web serves the Android app (see apk/README.md to rebuild it). */
export const APK_URL = "/descargas/cuaderno-de-campo.apk";

/** True inside the Android app: its WebView appends this marker to the user agent (apk/capacitor.config.json). */
export function isInApk(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return userAgent.includes("CuadernoDeCampoApp");
}
