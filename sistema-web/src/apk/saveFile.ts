/**
 * Hands a generated file (backup, report, attachment) to the person.
 * - In a browser: a normal download, or a new tab to view it.
 * - In the Android app: the WebView cannot download blobs, so the bytes go to the native bridge
 *   `window.CuadernoAndroid` (apk/…/MainActivity.java), which opens Android's share sheet or a viewer.
 */
type AndroidBridge = {
  begin(name: string, mime: string): string;
  append(id: string, base64: string): void;
  finish(id: string, mode: "share" | "view"): void;
};

const DOWNLOAD_REVOKE_DELAY_MS = 1000;
const VIEW_REVOKE_DELAY_MS = 60_000;
/** Bytes per bridge call; a multiple of 3 so each base64 piece decodes on its own. */
const CHUNK_BYTES = 3 * 128 * 1024;

function bridge(): AndroidBridge | undefined {
  return typeof window === "undefined" ? undefined : (window as { CuadernoAndroid?: AndroidBridge }).CuadernoAndroid;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function deliverFile(blob: Blob, name: string, mode: "download" | "view" = "download"): Promise<void> {
  const android = bridge();
  if (android) {
    const id = android.begin(name, blob.type || "application/octet-stream");
    for (let at = 0; at < blob.size; at += CHUNK_BYTES) {
      android.append(id, toBase64(new Uint8Array(await blob.slice(at, at + CHUNK_BYTES).arrayBuffer())));
    }
    android.finish(id, mode === "view" ? "view" : "share");
    return;
  }
  const url = URL.createObjectURL(blob);
  if (mode === "view") {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), VIEW_REVOKE_DELAY_MS);
    return;
  }
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }
}
