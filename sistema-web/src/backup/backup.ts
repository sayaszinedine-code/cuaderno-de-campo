import type { FileWriter, Storage } from "../storage/types";
import { readCentralDirectory, readEntry, type ZipEntry } from "./zip-reader";
import {
  APP_ID,
  BACKUP_DIR,
  FILES_PREFIX,
  INVALID_BACKUP,
  MANIFEST_NAME,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
  SCHEMA_VERSION,
  TOO_BIG_MESSAGE,
  TOO_MANY_MESSAGE,
  crc32,
  forEachChunk,
  isBackupPath,
  isSafePath,
  isTempFile,
  manifestSchema,
  type Manifest,
} from "./manifest";

export type BackupKind = "auto" | "manual" | "safety";
export type Inspected =
  { ok: true; manifest: Manifest } | { ok: false; error: string };

const KEEP_AUTO = 8;
const NAME_RE =
  /^respaldo-(\d{4}-\d{2}-\d{2})-(\d{4})(-auto|-seguridad)?(?: \((\d+)\))?\.zip$/;
const READ_CHUNK = 1024 * 1024;
const FLUSH_AT = 512 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;

/** Every file under `dir` (recursive), as relative paths. Backup folder (any case) and temp files are skipped. */
export async function listAllFiles(
  storage: Storage,
  dir = "",
  exclude: string[] = [`${BACKUP_DIR}/`],
): Promise<string[]> {
  const out: string[] = [];
  const skip = exclude.map((x) => x.toLowerCase());
  for (const e of await storage.list(dir)) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    const lp = p.toLowerCase();
    if (skip.some((x) => `${lp}/`.startsWith(x) || lp.startsWith(x))) continue;
    if (e.kind === "dir")
      out.push(...(await listAllFiles(storage, p, exclude)));
    else if (!isTempFile(e.name)) out.push(p);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const STORED_TYPES =
  /\.(jpe?g|png|webp|gif|heic|heif|avif|zip|mp4|mov|pdf|docx|xlsx|pptx|odt|ods|odp)$/i;

/** Sums sizes without reading any bytes and enforces the limits. Returns the sorted paths. */
export async function preflight(storage: Storage): Promise<string[]> {
  const paths = (await listAllFiles(storage)).sort();
  if (paths.length > MAX_FILE_COUNT) throw new Error(TOO_MANY_MESSAGE);
  let total = 0;
  for (const path of paths) {
    const blob = await storage.readFile(path);
    if (!blob) throw new Error(`No se pudo leer ${path}.`);
    if (!isSafePath(path))
      throw new Error(
        `El archivo «${path}» tiene un nombre que no se puede respaldar. Cámbiale el nombre.`,
      );
    total += blob.size;
    if (total > MAX_TOTAL_BYTES) throw new Error(TOO_BIG_MESSAGE);
  }
  return paths;
}

/** Streams a zip of the whole folder into `writer` (memory stays O(chunk)). Does not close the writer. */
export async function writeBackupTo(
  storage: Storage,
  writer: FileWriter,
  now: Date = new Date(),
  checked?: string[],
): Promise<Manifest> {
  const paths = checked ?? (await preflight(storage));
  const { Zip, ZipDeflate, ZipPassThrough, strToU8 } = await import("fflate");
  let queue: Uint8Array[] = [];
  let queued = 0;
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else if (chunk.length) {
      queue.push(chunk);
      queued += chunk.length;
    }
  });
  const flush = async (force: boolean) => {
    if (zipError) throw zipError;
    if (queued === 0 || (!force && queued < FLUSH_AT)) return;
    const merged = new Uint8Array(queued);
    let o = 0;
    for (const c of queue) {
      merged.set(c, o);
      o += c.length;
    }
    queue = [];
    queued = 0;
    await writer.write(merged);
  };

  const files: Manifest["files"] = [];
  for (const path of paths) {
    const blob = await storage.readFile(path);
    if (!blob) throw new Error(`No se pudo leer ${path}.`);
    const entry = STORED_TYPES.test(path)
      ? new ZipPassThrough(`${FILES_PREFIX}${path}`)
      : new ZipDeflate(`${FILES_PREFIX}${path}`, { level: 6 });
    zip.add(entry);
    let crc = 0;
    let size = 0;
    await forEachChunk(blob, READ_CHUNK, async (chunk, last) => {
      crc = crc32(crc, chunk);
      size += chunk.length;
      entry.push(chunk, last);
      await flush(false);
    });
    files.push({ path, size, crc32: crc });
  }

  const manifest: Manifest = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    files,
  };
  const m = new ZipDeflate(MANIFEST_NAME, { level: 6 });
  zip.add(m);
  m.push(strToU8(JSON.stringify(manifest)), true);
  zip.end();
  await flush(true);
  return manifest;
}

function stamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Writes a backup into `Respaldos/`, re-reads and fully verifies it, then applies retention. Returns the file name. */
export async function saveBackup(
  storage: Storage,
  kind: BackupKind,
  now: Date = new Date(),
): Promise<string> {
  const suffix =
    kind === "auto" ? "-auto" : kind === "safety" ? "-seguridad" : "";
  const taken = new Set(
    (await storage.list(BACKUP_DIR)).map((e) => e.name.toLowerCase()),
  );
  const base = `respaldo-${stamp(now)}${suffix}`;
  let name = `${base}.zip`;
  for (let n = 2; taken.has(name.toLowerCase()); n++)
    name = `${base} (${n}).zip`;
  const path = `${BACKUP_DIR}/${name}`;

  const paths = await preflight(storage); // limits and names are checked before anything is created

  const writer = await storage.createWriter(path);
  try {
    await writeBackupTo(storage, writer, now, paths);
    await writer.close();
  } catch (e) {
    await writer.abort().catch(() => undefined);
    throw e;
  }
  const written = await storage.readFile(path);
  const check = written ? await inspectBackup(written) : null;
  if (!check?.ok) {
    await storage.remove(path).catch(() => undefined);
    throw new Error("No se pudo guardar el respaldo completo.");
  }
  await applyRetention(storage, name).catch(() => undefined); // best effort: the backup itself is already safe
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

/** Keeps the 8 most recent automatic backups; manual and safety backups and the file just written are never deleted. */
async function applyRetention(
  storage: Storage,
  justWritten: string,
): Promise<void> {
  const autos = (await listBackups(storage)).filter((b) => b.kind === "auto");
  const excess = autos
    .slice(0, Math.max(0, autos.length - KEEP_AUTO))
    .filter((b) => b.name !== justWritten);
  for (const old of excess) await storage.remove(`${BACKUP_DIR}/${old.name}`);
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
      !isBackupPath(e.name) &&
      (await storage.readFile(`${e.name}/datos/anio.json`))
    )
      return true;
  }
  return false;
}

export interface ValidatedBackup {
  manifest: Manifest;
  entries: Map<string, ZipEntry>;
}

/** Full validation, streaming: structure, manifest, limits, names, sizes and CRC-32 of every entry. Throws on any problem. */
export async function validateBackup(file: Blob): Promise<ValidatedBackup> {
  const cd = await readCentralDirectory(file);
  const manifests = cd.filter((e) => e.name === MANIFEST_NAME);
  if (manifests.length !== 1 || manifests[0].size > MAX_MANIFEST_BYTES)
    throw new Error("manifest");

  const parts: Uint8Array[] = [];
  await readEntry(file, manifests[0], (c) => void parts.push(c.slice()));
  const raw = new Uint8Array(manifests[0].size);
  let o = 0;
  for (const p of parts) {
    raw.set(p, o);
    o += p.length;
  }
  const manifest = manifestSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
  );
  if (manifest.files.length > MAX_FILE_COUNT) throw new Error("too many files");

  const entries = new Map<string, ZipEntry>();
  for (const e of cd) {
    if (e.name === MANIFEST_NAME || e.name.endsWith("/")) continue;
    if (!e.name.startsWith(FILES_PREFIX))
      throw new Error("entry outside files/");
    entries.set(e.name.slice(FILES_PREFIX.length), e);
  }
  if (entries.size !== manifest.files.length)
    throw new Error("file list mismatch");

  const seen = new Set<string>();
  let total = 0;
  for (const f of manifest.files) {
    const lower = f.path.toLowerCase();
    if (seen.has(lower)) throw new Error("colliding paths");
    seen.add(lower);
    const e = entries.get(f.path);
    if (!e || e.size !== f.size || e.crc !== f.crc32)
      throw new Error("manifest mismatch");
    total += f.size;
    if (total > MAX_TOTAL_BYTES) throw new Error("too big");
  }
  // Verify every byte (size + CRC-32) without keeping anything in memory.
  for (const e of entries.values()) await readEntry(file, e, () => undefined);
  return { manifest, entries };
}

/** Validates a backup without writing anything. */
export async function inspectBackup(file: Blob): Promise<Inspected> {
  try {
    const { manifest } = await validateBackup(file);
    return { ok: true, manifest };
  } catch {
    return { ok: false, error: INVALID_BACKUP };
  }
}
