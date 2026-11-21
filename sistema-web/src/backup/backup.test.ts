import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../storage/memory";
import type { Storage } from "../storage/types";
import {
  hasData,
  inspectBackup,
  lastBackupDate,
  listAllFiles,
  saveBackup,
} from "./backup";
import { bytesOf, enc, makeZip, seed, wrap } from "./helpers.test-util";

const at = (y: number, mo: number, d: number, h = 9, mi = 5) =>
  new Date(y, mo - 1, d, h, mi, 0);
const INVALID = "Este archivo no es un respaldo válido del Cuaderno de Campo.";

async function backupBlob(s: MemoryStorage, name: string): Promise<Blob> {
  return (await s.readFile(`Respaldos/${name}`)) as Blob;
}

describe("listAllFiles", () => {
  it("is recursive and excludes Respaldos/ (any case) and temp files", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await s.writeFile("Respaldos/respaldo-2026-01-01-0000.zip", enc("old"));
    await s.writeFile("respaldos/x.zip", enc("old"));
    await s.writeFile("2026/datos/anio.json.tmp", enc("half"));
    await s.writeFile("Respaldos/respaldo-2026-01-02-0000.zip.tmp", enc("half"));
    expect((await listAllFiles(s)).sort()).toEqual([
      "2026/datos/anio.json",
      "2026/fotos/a.jpg",
      "datos/perfil.json",
    ]);
  });

  it("keeps the teacher's own .tmp files: only the app's `name.ext.tmp` temps are skipped", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await s.writeFile("notas.tmp", enc("mis notas"));
    await s.writeFile("2026/datos/anio.json.TMP", enc("half"));
    expect((await listAllFiles(s)).sort()).toEqual([
      "2026/datos/anio.json",
      "2026/fotos/a.jpg",
      "datos/perfil.json",
      "notas.tmp",
    ]);
  });
});

describe("saveBackup + inspectBackup", () => {
  it("writes a verifiable zip whose manifest lists every file with a crc32", async () => {
    const s = new MemoryStorage();
    await seed(s);
    const name = await saveBackup(s, "manual", at(2026, 11, 21));
    const r = await inspectBackup(await backupBlob(s, name));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.app).toBe("cuaderno-de-campo");
      expect(r.manifest.files.map((f) => f.path).sort()).toEqual([
        "2026/datos/anio.json",
        "2026/fotos/a.jpg",
        "datos/perfil.json",
      ]);
      expect(r.manifest.files.every((f) => Number.isInteger(f.crc32))).toBe(
        true,
      );
    }
  });

  it("does not put Respaldos/ or temp files into the backup", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await s.writeFile("respaldos/x.zip", enc("old"));
    await s.writeFile("datos/perfil.json.tmp", enc("half"));
    const name = await saveBackup(s, "manual", at(2026, 11, 21));
    const r = await inspectBackup(await backupBlob(s, name));
    expect(
      r.ok && r.manifest.files.some((f) => /respaldos|\.tmp$/i.test(f.path)),
    ).toBe(false);
  });

  it("detects a flipped byte in a stored entry (crc)", async () => {
    const s = new MemoryStorage();
    await s.writeFile("datos/perfil.json", enc("{}"));
    await s.writeFile("2026/datos/anio.json", enc("{}"));
    await s.writeFile(
      "2026/fotos/a.jpg",
      new Blob([new Uint8Array(100).fill(0xab)]),
    );
    const name = await saveBackup(s, "manual", at(2026, 11, 21));
    const zip = new Uint8Array(await bytesOf(await backupBlob(s, name)));
    const at0 = zip.findIndex((_, i) =>
      zip.subarray(i, i + 20).every((b) => b === 0xab),
    );
    expect(at0).toBeGreaterThan(0);
    zip[at0 + 50] = 0xac;
    expect(await inspectBackup(new Blob([zip]))).toEqual({
      ok: false,
      error: INVALID,
    });
  });

  it("accepts big folders (many files and a 3 MB photo) reading only small slices", async () => {
    const s = new MemoryStorage();
    await seed(s);
    // Stored (jpg) files keep their size in the zip, so the output spans several flushes; the 3 MB photo
    // is bigger than one read slice.
    for (let i = 0; i < 50; i++) {
      await s.writeFile(
        `2026/fotos/p${i}.${i % 2 ? "jpg" : "txt"}`,
        new Blob([new Uint8Array(64 * 1024).fill((i * 31) & 255)]),
      );
    }
    await s.writeFile("2026/fotos/grande.jpg", new Blob([new Uint8Array(3 * 1024 * 1024).fill(0x5a)]));
    const sizes: number[] = [];
    const orig = FileReader.prototype.readAsArrayBuffer;
    const spy = vi
      .spyOn(FileReader.prototype, "readAsArrayBuffer")
      .mockImplementation(function (this: FileReader, b: Blob) {
        sizes.push(b.size);
        return orig.call(this, b);
      });
    const chunks: number[] = [];
    const name = await saveBackup(
      wrap(s, { onChunk: (_p, n) => chunks.push(n) }),
      "manual",
      at(2026, 11, 21),
    );
    const r = await inspectBackup(await backupBlob(s, name));
    spy.mockRestore();
    expect(r.ok).toBe(true);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1024 * 1024 + 1);
    expect(Math.max(...chunks)).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("limits", () => {
  const fake = (count: number, size: number, onWriter: () => void): Storage => {
    const base = new MemoryStorage();
    return {
      ...wrap(base),
      list: async (d) =>
        d === ""
          ? Array.from({ length: count }, (_, i) => ({
              name: `f${i}.bin`,
              kind: "file" as const,
            }))
          : [],
      readFile: async () => ({ size }) as Blob,
      createWriter: async (p) => {
        onWriter();
        return base.createWriter(p);
      },
    };
  };
  it("refuses more than 3.5 GB before writing anything", async () => {
    const created = vi.fn();
    await expect(
      saveBackup(fake(3, 1_300_000_000, created), "manual"),
    ).rejects.toThrow(
      "Tus datos pesan más de 3,5 GB. Pide ayuda para hacer un respaldo por partes.",
    );
    expect(created).not.toHaveBeenCalled();
  });
  it("refuses too many files before writing anything", async () => {
    const created = vi.fn();
    await expect(
      saveBackup(fake(50_001, 1, created), "manual"),
    ).rejects.toThrow("Tienes demasiados archivos para un solo respaldo.");
    expect(created).not.toHaveBeenCalled();
  });
  it("refuses files whose names cannot be restored", async () => {
    const s = new MemoryStorage();
    await s.writeFile("datos/perfil.json", enc("{}"));
    await s.writeFile("2026/Con/x.json", enc("{}"));
    await expect(saveBackup(s, "manual")).rejects.toThrow(
      /nombre que no se puede respaldar/,
    );
    expect(await s.list("Respaldos")).toEqual([]);
  });
});

describe("inspectBackup validation", () => {
  const bad = async (blob: Blob) =>
    expect(await inspectBackup(blob)).toEqual({ ok: false, error: INVALID });
  it("accepts a well-formed zip, manifest first or last", async () => {
    expect((await inspectBackup(await makeZip({}))).ok).toBe(true);
    expect(
      (await inspectBackup(await makeZip({ manifestFirst: true }))).ok,
    ).toBe(true);
  });
  it("rejects a corrupt zip", async () =>
    bad(new Blob(["not a zip at all, definitely longer than 22 bytes"])));
  it("rejects an empty blob", async () => bad(new Blob([])));
  it("rejects a missing manifest", async () =>
    bad(await makeZip({ noManifest: true })));
  it("rejects another app", async () =>
    bad(await makeZip({ manifest: { app: "otra" } })));
  it("rejects schemaVersion 2", async () =>
    bad(await makeZip({ manifest: { schemaVersion: 2 } })));
  it("rejects traversal paths", async () =>
    bad(await makeZip({ files: { "../x": "{}" } })));
  it("rejects a size mismatch", async () =>
    bad(
      await makeZip({
        manifestFiles: [{ path: "datos/perfil.json", size: 9, crc32: 0 }],
      }),
    ));
  it("rejects a crc mismatch in the manifest", async () =>
    bad(
      await makeZip({
        manifestFiles: [{ path: "datos/perfil.json", size: 2, crc32: 12345 }],
      }),
    ));
  it("rejects a manifest file missing from the zip", async () =>
    bad(
      await makeZip({
        files: {},
        manifestFiles: [{ path: "datos/perfil.json", size: 2, crc32: 0 }],
      }),
    ));
  it("rejects an extra file not in the manifest", async () =>
    bad(
      await makeZip({
        files: { "datos/perfil.json": "{}", "extra.txt": "x" },
        manifestFiles: [
          { path: "datos/perfil.json", size: 2, crc32: 0x4e1e9c2b },
        ],
      }),
    ));
  it("rejects entries outside files/", async () =>
    bad(await makeZip({ extra: { "otro.txt": "x" } })));

  it("rejects Respaldos paths in any case", async () => {
    for (const p of ["Respaldos/x.zip", "respaldos/x.zip", "RESPALDOS/a"])
      await bad(await makeZip({ files: { [p]: "x" } }));
  });
  it("rejects paths that collide case-insensitively", async () =>
    bad(await makeZip({ files: { "a.json": "1", "A.json": "2" } })));

  it("rejects unsafe segments", async () => {
    const long = `${"a".repeat(256)}.json`;
    const names = [
      "a<b.json",
      "a:b",
      'a"b',
      "a|b",
      "a?b",
      "a*b",
      "tab\there",
      "ctl\u0001x",
      "dir./x.json",
      "dir /x.json",
      "con",
      "CON.txt",
      "x/nul.json",
      "Com1",
      "lpt9.x",
      "aux",
      "prn",
      long,
    ];
    for (const n of names) await bad(await makeZip({ files: { [n]: "x" } }));
  });
  it("accepts ordinary Spanish names", async () => {
    const r = await inspectBackup(
      await makeZip({
        files: {
          "2026/Niños/Ángel Pérez/foto 1.jpg": "x",
          "datos/console.json": "{}",
        },
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("saveBackup naming and retention", () => {
  it("names backups by kind and local time", async () => {
    const s = new MemoryStorage();
    await seed(s);
    expect(await saveBackup(s, "manual", at(2026, 11, 21, 14, 30))).toBe(
      "respaldo-2026-11-21-1430.zip",
    );
    expect(await saveBackup(s, "auto", at(2026, 11, 21, 14, 30))).toBe(
      "respaldo-2026-11-21-1430-auto.zip",
    );
    expect(await saveBackup(s, "safety", at(2026, 11, 21, 14, 30))).toBe(
      "respaldo-2026-11-21-1430-seguridad.zip",
    );
  });
  it("adds (2) when the name exists", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await saveBackup(s, "manual", at(2026, 11, 21, 14, 30));
    expect(await saveBackup(s, "manual", at(2026, 11, 21, 14, 30))).toBe(
      "respaldo-2026-11-21-1430 (2).zip",
    );
    expect(await saveBackup(s, "manual", at(2026, 11, 21, 14, 30))).toBe(
      "respaldo-2026-11-21-1430 (3).zip",
    );
  });
  it("keeps only the 8 most recent auto backups and never deletes manual or safety", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await s.writeFile("Respaldos/respaldo-2026-01-01-0000.zip", enc("old"));
    await saveBackup(s, "manual", at(2026, 1, 1));
    await saveBackup(s, "safety", at(2026, 1, 2));
    for (let d = 1; d <= 12; d++) await saveBackup(s, "auto", at(2026, 2, d));
    const names = (await s.list("Respaldos")).map((e) => e.name);
    const autos = names.filter((n) => n.includes("-auto")).sort();
    expect(autos).toHaveLength(8);
    expect(autos[0]).toBe("respaldo-2026-02-05-0905-auto.zip");
    expect(names).toContain("respaldo-2026-01-01-0905.zip");
    expect(names).toContain("respaldo-2026-01-02-0905-seguridad.zip");
    expect(names).toContain("respaldo-2026-01-01-0000.zip");
  });
  it("never deletes the backup it just wrote, even when it is the oldest auto", async () => {
    const s = new MemoryStorage();
    await seed(s);
    for (let d = 10; d <= 17; d++) await saveBackup(s, "auto", at(2026, 2, d));
    const name = await saveBackup(s, "auto", at(2026, 1, 1)); // older than all existing autos
    expect(await s.readFile(`Respaldos/${name}`)).not.toBeNull();
  });
  it("leaves nothing behind when writing fails", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await expect(
      saveBackup(
        wrap(s, { failWrite: (p) => p.startsWith("Respaldos/") }),
        "manual",
      ),
    ).rejects.toThrow();
    expect(await s.list("Respaldos")).toEqual([]);
  });
});

describe("lastBackupDate / hasData", () => {
  it("returns the date of the most recent backup name", async () => {
    const s = new MemoryStorage();
    expect(await lastBackupDate(s)).toBeNull();
    await s.writeFile("Respaldos/respaldo-2026-03-01-0800.zip", enc("x"));
    await s.writeFile("Respaldos/respaldo-2026-05-09-1000-auto.zip", enc("x"));
    await s.writeFile("Respaldos/notas.txt", enc("x"));
    expect(await lastBackupDate(s)).toBe("2026-05-09");
  });
  it("detects data by perfil.json or any year anio.json", async () => {
    const s = new MemoryStorage();
    expect(await hasData(s)).toBe(false);
    await s.writeFile("2026/fotos/a.jpg", enc("x"));
    expect(await hasData(s)).toBe(false);
    await s.writeFile("2026/datos/anio.json", enc("{}"));
    expect(await hasData(s)).toBe(true);
    const t = new MemoryStorage();
    await t.writeFile("datos/perfil.json", enc("{}"));
    expect(await hasData(t)).toBe(true);
  });
});
