import { relPath } from "../domain/schema";
import type { Storage } from "../storage/types";
import { hasData, listAllFiles, saveBackup, type Inspected } from "./backup";
import {
  BACKUP_DIR,
  blobToBytes,
  bytesToBlob,
  INVALID_BACKUP,
} from "./manifest";

type Valid = Extract<Inspected, { ok: true }>;

const isIndexFile = (p: string) =>
  p === "datos/perfil.json" || /^[^/]+\/datos\/anio\.json$/.test(p);

/** Non-JSON files first, then other JSON, then the index files (perfil/anio) last: a crash never leaves a finished-looking folder. */
function writeRank(p: string): number {
  if (isIndexFile(p)) return 2;
  return p.toLowerCase().endsWith(".json") ? 1 : 0;
}

/**
 * Restores a validated backup. A safety backup of the current folder is taken first whenever anything exists
 * there; if that fails nothing is touched. With `replace`, every existing file (except `Respaldos/`) is removed.
 */
export async function restoreBackup(
  storage: Storage,
  inspected: Valid,
  opts: { replace: boolean },
): Promise<void> {
  for (const path of inspected.entries.keys()) {
    if (
      !relPath.safeParse(path).success ||
      path === BACKUP_DIR ||
      path.startsWith(`${BACKUP_DIR}/`)
    ) {
      throw new Error(INVALID_BACKUP);
    }
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
        if (entry.name !== BACKUP_DIR) await storage.remove(entry.name);
      }
    }
    const paths = [...inspected.entries.keys()].sort(
      (a, b) => writeRank(a) - writeRank(b) || (a < b ? -1 : 1),
    );
    for (const path of paths) {
      const data = inspected.entries.get(path);
      if (!data) continue;
      await storage.writeFile(path, bytesToBlob(data));
      const back = await storage.readFile(path);
      if (!back || (await blobToBytes(back)).length !== data.length)
        throw new Error(`write mismatch: ${path}`);
    }
  } catch {
    throw new Error(
      `La restauración no terminó. Tus datos anteriores están en el respaldo de seguridad: ${safety ?? "ninguno"}.`,
    );
  }
}
