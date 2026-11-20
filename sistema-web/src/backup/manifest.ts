import { z } from "zod";
import { relPath } from "../domain/schema";

/**
 * Zip layout: `manifest.json` at the root; every user file lives under `files/<relative path>`.
 * The prefix guarantees the manifest can never collide with a user file.
 */
export const APP_ID = "cuaderno-de-campo";
export const SCHEMA_VERSION = 1;
export const FILES_PREFIX = "files/";
export const MANIFEST_NAME = "manifest.json";
export const BACKUP_DIR = "Respaldos";
export const INVALID_BACKUP =
  "Este archivo no es un respaldo válido del Cuaderno de Campo.";

/** Zip-bomb guards. */
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_FILE_COUNT = 50_000;

const safePath = relPath.refine(
  (p) => p !== BACKUP_DIR && !p.startsWith(`${BACKUP_DIR}/`),
  {
    message: "backups cannot contain the backup folder",
  },
);

export const manifestSchema = z.object({
  app: z.literal(APP_ID),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  createdAt: z.string(),
  files: z.array(z.object({ path: safePath, size: z.number().int().min(0) })),
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

export function bytesToBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice()]);
}
