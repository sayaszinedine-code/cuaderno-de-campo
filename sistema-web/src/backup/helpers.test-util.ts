import { MemoryStorage } from "../storage/memory";
import type { FileWriter, Storage } from "../storage/types";
import { crc32 } from "./manifest";

export const enc = (s: string) => new Blob([s]);

export async function bytesOf(b: Blob | null): Promise<number[]> {
  if (!b) return [];
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve([...new Uint8Array(r.result as ArrayBuffer)]);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

export async function seed(s: MemoryStorage) {
  await s.writeFile("datos/perfil.json", enc('{"a":1}'));
  await s.writeFile("2026/datos/anio.json", enc('{"year":2026}'));
  await s.writeFile(
    "2026/fotos/a.jpg",
    new Blob([new Uint8Array([0, 255, 1, 2, 3])]),
  );
}

/** Builds a zip with fflate's sync API so tests can forge arbitrary (invalid) archives. */
export async function makeZip(opts: {
  files?: Record<string, string | Uint8Array>;
  manifest?: Record<string, unknown>;
  manifestFiles?: { path: string; size: number; crc32: number }[];
  extra?: Record<string, string>;
  manifestFirst?: boolean;
  noManifest?: boolean;
}): Promise<Blob> {
  const { zipSync, strToU8 } = await import("fflate");
  const files = opts.files ?? { "datos/perfil.json": "{}" };
  const u8 = (v: string | Uint8Array) =>
    typeof v === "string" ? strToU8(v) : v;
  const manifest = {
    app: "cuaderno-de-campo",
    schemaVersion: 1,
    createdAt: "2026-11-21T00:00:00.000Z",
    files:
      opts.manifestFiles ??
      Object.entries(files).map(([path, v]) => ({
        path,
        size: u8(v).length,
        crc32: crc32(0, u8(v)),
      })),
    ...opts.manifest,
  };
  const data: Record<string, Uint8Array> = {};
  if (opts.manifestFirst && !opts.noManifest)
    data["manifest.json"] = strToU8(JSON.stringify(manifest));
  for (const [k, v] of Object.entries(files)) data[`files/${k}`] = u8(v);
  for (const [k, v] of Object.entries(opts.extra ?? {})) data[k] = u8(v);
  if (!opts.manifestFirst && !opts.noManifest)
    data["manifest.json"] = strToU8(JSON.stringify(manifest));
  return new Blob([zipSync(data).slice()]);
}

/** Storage wrapper for failure injection and write instrumentation. */
export function wrap(
  base: MemoryStorage,
  hooks: {
    failWrite?: (p: string) => boolean;
    onChunk?: (p: string, n: number) => void;
    onCreateWriter?: (p: string) => void;
  } = {},
): Storage {
  return {
    kind: base.kind,
    label: base.label,
    readText: (p) => base.readText(p),
    writeTextAtomic: (p, t) =>
      hooks.failWrite?.(p)
        ? Promise.reject(new Error("boom"))
        : base.writeTextAtomic(p, t),
    readFile: (p) => base.readFile(p),
    writeFile: (p, d) =>
      hooks.failWrite?.(p)
        ? Promise.reject(new Error("boom"))
        : base.writeFile(p, d),
    createWriter: async (p): Promise<FileWriter> => {
      hooks.onCreateWriter?.(p);
      if (hooks.failWrite?.(p)) throw new Error("boom");
      const w = await base.createWriter(p);
      return {
        write: async (c) => {
          hooks.onChunk?.(p, c.length);
          await w.write(c);
        },
        close: () => w.close(),
        abort: () => w.abort(),
      };
    },
    list: (d) => base.list(d),
    remove: (p) => base.remove(p),
  };
}

export { crc32 };
