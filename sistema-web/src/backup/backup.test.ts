import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/memory";
import {
  buildBackup,
  hasData,
  inspectBackup,
  lastBackupDate,
  listAllFiles,
  saveBackup,
} from "./backup";

const enc = (s: string) => new Blob([s]);
const at = (y: number, mo: number, d: number, h = 9, mi = 5) =>
  new Date(y, mo - 1, d, h, mi, 0);

async function seed(s: MemoryStorage) {
  await s.writeFile("datos/perfil.json", enc('{"a":1}'));
  await s.writeFile("2026/datos/anio.json", enc('{"year":2026}'));
  await s.writeFile(
    "2026/fotos/a.jpg",
    new Blob([new Uint8Array([0, 255, 1, 2, 3])]),
  );
  await s.writeFile("Respaldos/respaldo-2026-01-01-0000.zip", enc("old"));
}

describe("listAllFiles", () => {
  it("is recursive and excludes Respaldos/", async () => {
    const s = new MemoryStorage();
    await seed(s);
    expect((await listAllFiles(s)).sort()).toEqual([
      "2026/datos/anio.json",
      "2026/fotos/a.jpg",
      "datos/perfil.json",
    ]);
  });
});

describe("buildBackup / inspectBackup", () => {
  it("builds a manifest and round-trips through inspect", async () => {
    const s = new MemoryStorage();
    await seed(s);
    const { blob, manifest } = await buildBackup(s, at(2026, 11, 21));
    expect(manifest.app).toBe("cuaderno-de-campo");
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.files.map((f) => f.path).sort()).toEqual([
      "2026/datos/anio.json",
      "2026/fotos/a.jpg",
      "datos/perfil.json",
    ]);
    const r = await inspectBackup(blob);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([...r.entries.keys()].sort()).toEqual(
        manifest.files.map((f) => f.path).sort(),
      );
      expect([...(r.entries.get("2026/fotos/a.jpg") ?? [])]).toEqual([
        0, 255, 1, 2, 3,
      ]);
    }
  });
});

const INVALID = "Este archivo no es un respaldo válido del Cuaderno de Campo.";

async function makeZip(files: Record<string, string>): Promise<Blob> {
  const { zip, strToU8 } = await import("fflate");
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) data[k] = strToU8(v);
  const out = await new Promise<Uint8Array>((res, rej) =>
    zip(data, (e, d) => (e ? rej(e) : res(d))),
  );
  return new Blob([out.slice()]);
}
const manifest = (
  over: Record<string, unknown> = {},
  files = [{ path: "datos/perfil.json", size: 2 }],
) =>
  JSON.stringify({
    app: "cuaderno-de-campo",
    schemaVersion: 1,
    createdAt: "2026-11-21T00:00:00.000Z",
    files,
    ...over,
  });

describe("inspectBackup validation", () => {
  const bad = async (blob: Blob) => {
    expect(await inspectBackup(blob)).toEqual({ ok: false, error: INVALID });
  };
  it("accepts a well-formed zip", async () => {
    const r = await inspectBackup(
      await makeZip({
        "manifest.json": manifest(),
        "files/datos/perfil.json": "{}",
      }),
    );
    expect(r.ok).toBe(true);
  });
  it("rejects a corrupt zip", async () => bad(new Blob(["not a zip at all"])));
  it("rejects a missing manifest", async () =>
    bad(await makeZip({ "files/datos/perfil.json": "{}" })));
  it("rejects a malformed manifest", async () =>
    bad(
      await makeZip({
        "manifest.json": "nope",
        "files/datos/perfil.json": "{}",
      }),
    ));
  it("rejects another app", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest({ app: "otra" }),
        "files/datos/perfil.json": "{}",
      }),
    ));
  it("rejects schemaVersion 2", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest({ schemaVersion: 2 }),
        "files/datos/perfil.json": "{}",
      }),
    ));
  it("rejects traversal paths", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest({}, [{ path: "../x", size: 2 }]),
        "files/../x": "{}",
      }),
    ));
  it("rejects Respaldos/ paths", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest({}, [{ path: "Respaldos/a.zip", size: 2 }]),
        "files/Respaldos/a.zip": "{}",
      }),
    ));
  it("rejects a size mismatch", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest({}, [{ path: "datos/perfil.json", size: 9 }]),
        "files/datos/perfil.json": "{}",
      }),
    ));
  it("rejects a manifest file missing from the zip", async () =>
    bad(await makeZip({ "manifest.json": manifest() })));
  it("rejects an extra file not in the manifest", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest(),
        "files/datos/perfil.json": "{}",
        "files/extra.txt": "x",
      }),
    ));
  it("rejects entries outside files/", async () =>
    bad(
      await makeZip({
        "manifest.json": manifest(),
        "files/datos/perfil.json": "{}",
        "otro.txt": "x",
      }),
    ));
});

describe("saveBackup", () => {
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
    expect(
      await s.readFile("Respaldos/respaldo-2026-11-21-1430-auto.zip"),
    ).not.toBeNull();
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
  it("does not write the backup folder into the backup", async () => {
    const s = new MemoryStorage();
    await seed(s);
    await saveBackup(s, "manual", at(2026, 11, 21));
    const blob = await s.readFile("Respaldos/respaldo-2026-11-21-0905.zip");
    const r = await inspectBackup(blob as Blob);
    expect(
      r.ok && [...r.entries.keys()].some((k) => k.startsWith("Respaldos/")),
    ).toBe(false);
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
