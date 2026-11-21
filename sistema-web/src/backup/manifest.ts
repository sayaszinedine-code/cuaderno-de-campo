import { z } from "zod";
import { relPath } from "../domain/schema";

/**
 * Zip layout: `manifest.json` (written LAST, anywhere is accepted) and every user file under `files/<relative path>`.
 * The prefix guarantees the manifest can never collide with a user file. Each manifest entry carries a CRC-32.
 */
export const APP_ID = "cuaderno-de-campo";
export const SCHEMA_VERSION = 1;
export const FILES_PREFIX = "files/";
export const MANIFEST_NAME = "manifest.json";
export const BACKUP_DIR = "Respaldos";
export const INVALID_BACKUP =
  "Este archivo no es un respaldo válido del Cuaderno de Campo.";

/** Limits. The count is bounded by the classic (non-zip64) zip format, which holds at most 65 535 entries. */
export const MAX_TOTAL_BYTES = 3_500_000_000;
export const MAX_FILE_COUNT = 50_000;
export const TOO_BIG_MESSAGE =
  "Tus datos pesan más de 3,5 GB. Pide ayuda para hacer un respaldo por partes.";
export const TOO_MANY_MESSAGE =
  "Tienes demasiados archivos para un solo respaldo.";

/** True for `Respaldos` and anything under it, case-insensitively (case-insensitive file systems). */
export function isBackupPath(path: string): boolean {
  return path.split("/")[0].toLowerCase() === BACKUP_DIR.toLowerCase();
}

/**
 * Temp files left by the app's atomic writes and writers (`writeTextAtomic`/`createWriter` write `<name>.<ext>.tmp`
 * next to the target); never part of a backup. A teacher's own `notas.tmp` does not match and is backed up.
 */
export const isTempFile = (name: string): boolean => /\.[^./]+\.tmp$/i.test(name);

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const FORBIDDEN = /[\x00-\x1f\x7f<>:"|?*]/;

/** Names that every supported file system (including Windows) can hold. */
export function isSafeSegment(seg: string): boolean {
  if (FORBIDDEN.test(seg) || /[. ]$/.test(seg)) return false;
  if (RESERVED.test(seg.split(".")[0].trimEnd())) return false;
  return new TextEncoder().encode(seg).length <= 255;
}

export const isSafePath = (path: string): boolean =>
  relPath.safeParse(path).success && path.split("/").every(isSafeSegment);

const safePath = z
  .string()
  .refine((p) => isSafePath(p) && !isBackupPath(p), { message: "unsafe path" });

export const manifestSchema = z.object({
  app: z.literal(APP_ID),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  createdAt: z.string(),
  files: z.array(
    z.object({
      path: safePath,
      size: z.number().int().min(0),
      crc32: z.number().int().min(0).max(0xffffffff),
    }),
  ),
});

export type Manifest = z.infer<typeof manifestSchema>;

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

/** Reads a blob slice by slice so memory stays O(chunkSize). `last` is true on the final chunk (an empty blob yields one empty chunk). */
export async function forEachChunk(
  blob: Blob,
  chunkSize: number,
  fn: (chunk: Uint8Array, last: boolean) => Promise<void> | void,
  start = 0,
  end = blob.size,
): Promise<void> {
  if (end <= start) return fn(new Uint8Array(0), true);
  for (let pos = start; pos < end; pos += chunkSize) {
    const to = Math.min(pos + chunkSize, end);
    await fn(await blobToBytes(blob.slice(pos, to)), to >= end);
  }
}

let table: Uint32Array | null = null;
/** Incremental CRC-32 (IEEE). Start with 0 and feed the previous result back in. */
export function crc32(prev: number, bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = ~prev >>> 0;
  for (let i = 0; i < bytes.length; i++)
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
