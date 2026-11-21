import type { Storage } from "../storage/types";
import { hasData, listAllFiles, saveBackup, validateBackup } from "./backup";
import { BACKUP_DIR, INVALID_BACKUP, isBackupPath } from "./manifest";
import { readEntry } from "./zip-reader";

const isIndexFile = (p: string) =>
  p === "datos/perfil.json" || /^[^/]+\/datos\/anio\.json$/.test(p);

/** Non-JSON files first, then other JSON, then the index files (perfil/anio) last: a crash never leaves a finished-looking folder. */
function writeRank(p: string): number {
  if (isIndexFile(p)) return 2;
  return p.toLowerCase().endsWith(".json") ? 1 : 0;
}

/**
 * Restores a backup file, re-validating it completely first (nothing is written if it is invalid). A safety backup of
 * the current folder is taken whenever anything exists there; if that fails nothing is touched. With `replace`, every
 * existing file except `Respaldos/` is removed. Entries are streamed one by one, never held in memory.
 */
export async function restoreBackup(
  storage: Storage,
  file: Blob,
  opts: { replace: boolean },
): Promise<void> {
  let backup;
  try {
    backup = await validateBackup(file);
  } catch (e) {
    throw new Error(INVALID_BACKUP, { cause: e });
  }
  const existing = await listAllFiles(storage);
  if (!opts.replace && (await hasData(storage))) {
    throw new Error(
      "La carpeta ya tiene datos. Confirma que quieres reemplazarlos para restaurar.",
    );
  }

  let safety: string | null = null;
  if (existing.length > 0 || opts.replace)
    safety = await saveBackup(storage, "safety"); // throws → nothing touched

  try {
    if (opts.replace) {
      for (const entry of await storage.list("")) {
        if (!isBackupPath(entry.name)) await storage.remove(entry.name);
      }
    }
    const paths = backup.manifest.files
      .map((f) => f.path)
      .sort((a, b) => writeRank(a) - writeRank(b) || (a < b ? -1 : 1));
    for (const path of paths) {
      if (isBackupPath(path))
        throw new Error(`refusing to write inside ${BACKUP_DIR}/`);
      const entry = backup.entries.get(path);
      if (!entry) throw new Error(`missing entry: ${path}`);
      const writer = await storage.createWriter(path);
      try {
        await readEntry(file, entry, (chunk) => writer.write(chunk)); // re-verifies size and CRC while writing
        await writer.close();
      } catch (e) {
        await writer.abort().catch(() => undefined);
        throw e;
      }
      const back = await storage.readFile(path);
      if (!back || back.size !== entry.size)
        throw new Error(`write mismatch: ${path}`);
    }
  } catch (e) {
    throw new Error(
      `La restauración no terminó. Tus datos anteriores están en el respaldo de seguridad: ${safety ?? "ninguno"}.`,
      {
        cause: e,
      },
    );
  }
}
