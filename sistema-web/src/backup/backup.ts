import type { Storage } from "../storage/types";
import {
  blobToBytes,
  bytesToBlob,
  BACKUP_DIR,
  FILES_PREFIX,
  INVALID_BACKUP,
  MANIFEST_NAME,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
  APP_ID,
  SCHEMA_VERSION,
  manifestSchema,
  type Manifest,
} from "./manifest";

export type BackupKind = "auto" | "manual" | "safety";
export type Inspected =
  | { ok: true; manifest: Manifest; entries: Map<string, Uint8Array> }
  | { ok: false; error: string };

const KEEP_AUTO = 8;
const NAME_RE =
  /^respaldo-(\d{4}-\d{2}-\d{2})-(\d{4})(-auto|-seguridad)?(?: \((\d+)\))?\.zip$/;

/** Every file under `dir` (recursive), as relative paths. Paths starting with an `exclude` prefix are skipped. */
export async function listAllFiles(
  storage: Storage,
  dir = "",
  exclude: string[] = [`${BACKUP_DIR}/`],
): Promise<string[]> {
  const out: string[] = [];
  for (const e of await storage.list(dir)) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (exclude.some((x) => `${p}/`.startsWith(x) || p.startsWith(x))) continue;
    if (e.kind === "dir")
      out.push(...(await listAllFiles(storage, p, exclude)));
    else out.push(p);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const COMPRESSED = /\.(jpe?g|png|webp|gif|heic|zip|mp4|pdf)$/i;

export async function buildBackup(
  storage: Storage,
  now: Date = new Date(),
): Promise<{ blob: Blob; manifest: Manifest }> {
  const { zip, strToU8 } = await import("fflate");
  const paths = (await listAllFiles(storage)).sort();
  const files: Manifest["files"] = [];
  const data: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const path of paths) {
    const blob = await storage.readFile(path);
    if (!blob) throw new Error(`No se pudo leer ${path}.`);
    const bytes = await blobToBytes(blob);
    files.push({ path, size: bytes.length });
    data[`${FILES_PREFIX}${path}`] = COMPRESSED.test(path)
      ? [bytes, { level: 0 }]
      : bytes;
  }
  const manifest: Manifest = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    files,
  };
  data[MANIFEST_NAME] = strToU8(JSON.stringify(manifest));
  const out = await new Promise<Uint8Array>((resolve, reject) =>
    zip(data, (e, d) => (e ? reject(e) : resolve(d))),
  );
  return { blob: bytesToBlob(out), manifest };
}

function stamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Writes a backup into `Respaldos/`, verifies it was fully written, then applies retention. Returns the file name. */
export async function saveBackup(
  storage: Storage,
  kind: BackupKind,
  now: Date = new Date(),
): Promise<string> {
  const { blob } = await buildBackup(storage, now);
  const suffix =
    kind === "auto" ? "-auto" : kind === "safety" ? "-seguridad" : "";
  const taken = new Set((await storage.list(BACKUP_DIR)).map((e) => e.name));
  const base = `respaldo-${stamp(now)}${suffix}`;
  let name = `${base}.zip`;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n}).zip`;
  await storage.writeFile(`${BACKUP_DIR}/${name}`, blob);
  const written = await storage.readFile(`${BACKUP_DIR}/${name}`);
  if (!written || written.size !== blob.size) {
    await storage.remove(`${BACKUP_DIR}/${name}`).catch(() => undefined);
    throw new Error("No se pudo guardar el respaldo completo.");
  }
  await applyRetention(storage).catch(() => undefined); // best effort: the backup itself is already safe
  return name;
}

interface Parsed {
  name: string;
  date: string;
  key: string;
  kind: BackupKind;
}

function parseName(name: string): Parsed | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const kind: BackupKind =
    m[3] === "-auto" ? "auto" : m[3] === "-seguridad" ? "safety" : "manual";
  return {
    name,
    date: m[1],
    key: `${m[1]}-${m[2]}-${(m[4] ?? "1").padStart(6, "0")}`,
    kind,
  };
}

async function listBackups(storage: Storage): Promise<Parsed[]> {
  const out: Parsed[] = [];
  for (const e of await storage.list(BACKUP_DIR)) {
    if (e.kind !== "file") continue;
    const p = parseName(e.name);
    if (p) out.push(p);
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Keeps the 8 most recent automatic backups; manual and safety backups are never deleted. */
async function applyRetention(storage: Storage): Promise<void> {
  const autos = (await listBackups(storage)).filter((b) => b.kind === "auto");
  for (const old of autos.slice(0, Math.max(0, autos.length - KEEP_AUTO))) {
    await storage.remove(`${BACKUP_DIR}/${old.name}`);
  }
}

export async function lastBackupDate(storage: Storage): Promise<string | null> {
  const all = await listBackups(storage);
  return all.length ? all[all.length - 1].date : null;
}

export async function hasData(storage: Storage): Promise<boolean> {
  if (await storage.readFile("datos/perfil.json")) return true;
  for (const e of await storage.list("")) {
    if (
      e.kind === "dir" &&
      e.name !== BACKUP_DIR &&
      (await storage.readFile(`${e.name}/datos/anio.json`))
    )
      return true;
  }
  return false;
}

/** Validates a backup completely in memory. Never writes anything. */
export async function inspectBackup(file: Blob): Promise<Inspected> {
  const fail: Inspected = { ok: false, error: INVALID_BACKUP };
  try {
    const { unzip, strFromU8 } = await import("fflate");
    let declaredTotal = 0;
    let count = 0;
    let tooBig = false;
    const raw = await new Promise<Record<string, Uint8Array>>(
      (resolve, reject) => {
        blobToBytes(file)
          .then((bytes) =>
            unzip(
              bytes,
              {
                filter: (f) => {
                  count += 1;
                  declaredTotal += f.originalSize;
                  if (count > MAX_FILE_COUNT || declaredTotal > MAX_TOTAL_BYTES)
                    tooBig = true;
                  return !tooBig;
                },
              },
              (e, d) => (e ? reject(e) : resolve(d)),
            ),
          )
          .catch(reject);
      },
    );
    if (tooBig) return fail;

    const manifestBytes = raw[MANIFEST_NAME];
    if (!manifestBytes) return fail;
    const parsed = manifestSchema.safeParse(
      JSON.parse(strFromU8(manifestBytes)),
    );
    if (!parsed.success) return fail;
    const manifest = parsed.data;
    if (manifest.files.length > MAX_FILE_COUNT) return fail;

    const entries = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(raw)) {
      if (name === MANIFEST_NAME || name.endsWith("/")) continue;
      if (!name.startsWith(FILES_PREFIX)) return fail;
      entries.set(name.slice(FILES_PREFIX.length), data);
    }
    if (entries.size !== manifest.files.length) return fail;
    const seen = new Set<string>();
    let total = 0;
    for (const f of manifest.files) {
      if (seen.has(f.path)) return fail;
      seen.add(f.path);
      const data = entries.get(f.path);
      if (!data || data.length !== f.size) return fail;
      total += data.length;
    }
    if (total > MAX_TOTAL_BYTES) return fail;
    return { ok: true, manifest, entries };
  } catch {
    return fail;
  }
}
