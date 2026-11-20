import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/memory";
import type { Storage } from "../storage/types";
import { buildBackup, inspectBackup, listAllFiles } from "./backup";
import { restoreBackup } from "./restore";

const enc = (s: string) => new Blob([s]);
async function bytes(s: Storage, p: string): Promise<number[]> {
  const b = await s.readFile(p);
  if (!b) return [];
  return [...new Uint8Array(await new Response(b).arrayBuffer())];
}
async function seed(s: MemoryStorage) {
  await s.writeFile("datos/perfil.json", enc('{"a":1}'));
  await s.writeFile("2026/datos/anio.json", enc('{"year":2026}'));
  await s.writeFile(
    "2026/fotos/a.jpg",
    new Blob([new Uint8Array([0, 255, 1, 2, 3])]),
  );
}
async function inspected(s: MemoryStorage) {
  const { blob } = await buildBackup(s);
  const r = await inspectBackup(blob);
  if (!r.ok) throw new Error("inspect failed");
  return r;
}
function failingOn(
  base: MemoryStorage,
  match: (p: string) => boolean,
): Storage {
  return {
    kind: base.kind,
    label: base.label,
    readText: (p) => base.readText(p),
    writeTextAtomic: (p, t) =>
      match(p) ? Promise.reject(new Error("boom")) : base.writeTextAtomic(p, t),
    readFile: (p) => base.readFile(p),
    writeFile: (p, d) =>
      match(p) ? Promise.reject(new Error("boom")) : base.writeFile(p, d),
    list: (d) => base.list(d),
    remove: (p) => base.remove(p),
  };
}

describe("restoreBackup", () => {
  it("round-trips into an empty folder with identical bytes", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const ins = await inspected(src);
    const dst = new MemoryStorage();
    await restoreBackup(dst, ins, { replace: false });
    expect((await listAllFiles(dst)).sort()).toEqual(
      (await listAllFiles(src)).sort(),
    );
    for (const p of await listAllFiles(src))
      expect(await bytes(dst, p)).toEqual(await bytes(src, p));
  });

  it("refuses to overwrite data without replace and touches nothing", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const ins = await inspected(src);
    const dst = new MemoryStorage();
    await dst.writeFile("datos/perfil.json", enc("MINE"));
    await expect(restoreBackup(dst, ins, { replace: false })).rejects.toThrow();
    expect(await dst.readText("datos/perfil.json")).toBe("MINE");
    expect(await dst.list("Respaldos")).toEqual([]);
  });

  it("with replace: safety backup holds the old data, old files are gone, Respaldos kept", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const ins = await inspected(src);
    const dst = new MemoryStorage();
    await dst.writeFile("datos/perfil.json", enc("OLD"));
    await dst.writeFile("2025/datos/anio.json", enc("OLD25"));
    await dst.writeFile("Respaldos/respaldo-2026-01-01-0000.zip", enc("prev"));
    await restoreBackup(dst, ins, { replace: true });
    expect(await dst.readText("datos/perfil.json")).toBe('{"a":1}');
    expect(await dst.readFile("2025/datos/anio.json")).toBeNull();
    expect(await dst.readText("Respaldos/respaldo-2026-01-01-0000.zip")).toBe(
      "prev",
    );
    const safety = (await dst.list("Respaldos")).find((e) =>
      e.name.endsWith("-seguridad.zip"),
    );
    expect(safety).toBeDefined();
    const r = await inspectBackup(
      (await dst.readFile(`Respaldos/${safety?.name}`)) as Blob,
    );
    expect(
      r.ok && new TextDecoder().decode(r.entries.get("datos/perfil.json")),
    ).toBe("OLD");
  });

  it("leaves the folder intact when the safety backup fails", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const ins = await inspected(src);
    const base = new MemoryStorage();
    await base.writeFile("datos/perfil.json", enc("OLD"));
    const dst = failingOn(base, (p) => p.startsWith("Respaldos/"));
    await expect(restoreBackup(dst, ins, { replace: true })).rejects.toThrow();
    expect(await base.readText("datos/perfil.json")).toBe("OLD");
    expect(await listAllFiles(base)).toEqual(["datos/perfil.json"]);
  });

  it("reports the safety backup name if writing fails midway, writing index files last", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const ins = await inspected(src);
    const base = new MemoryStorage();
    await base.writeFile("datos/perfil.json", enc("OLD"));
    const dst = failingOn(base, (p) => p === "2026/fotos/a.jpg");
    await expect(restoreBackup(dst, ins, { replace: true })).rejects.toThrow(
      /^La restauración no terminó\. Tus datos anteriores están en el respaldo de seguridad: respaldo-.*-seguridad\.zip\.$/,
    );
    // Index files (perfil/anio) are written last, so a half restore never looks like a finished one.
    expect(await base.readFile("2026/datos/anio.json")).toBeNull();
    expect(await base.readFile("datos/perfil.json")).toBeNull();
    expect(
      (await base.list("Respaldos")).some((e) =>
        e.name.endsWith("-seguridad.zip"),
      ),
    ).toBe(true);
  });
});
