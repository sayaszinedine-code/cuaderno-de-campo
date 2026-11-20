import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/memory";
import { listAllFiles, saveBackup } from "./backup";
import { restoreBackup } from "./restore";
import { bytesOf, enc, makeZip, seed, wrap } from "./helpers.test-util";

async function backupOf(s: MemoryStorage): Promise<Blob> {
  const name = await saveBackup(s, "manual", new Date(2026, 10, 21));
  const blob = (await s.readFile(`Respaldos/${name}`)) as Blob;
  await s.remove(`Respaldos/${name}`);
  return blob;
}

describe("restoreBackup", () => {
  it("round-trips into an empty folder with identical bytes", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const blob = await backupOf(src);
    const dst = new MemoryStorage();
    await restoreBackup(dst, blob, { replace: false });
    expect((await listAllFiles(dst)).sort()).toEqual(
      (await listAllFiles(src)).sort(),
    );
    for (const p of await listAllFiles(src))
      expect(await bytesOf(await dst.readFile(p))).toEqual(
        await bytesOf(await src.readFile(p)),
      );
  });

  it("round-trips many files through streaming writers with small chunks", async () => {
    const src = new MemoryStorage();
    await seed(src);
    for (let i = 0; i < 60; i++) {
      const b = new Uint8Array(64 * 1024);
      for (let j = 0; j < b.length; j++)
        b[j] = (i * 13 + j * 5 + (j >> 7)) & 255;
      await src.writeFile(
        `2026/x/f${i}.${i % 2 ? "png" : "txt"}`,
        new Blob([b]),
      );
    }
    const blob = await backupOf(src);
    const dst = new MemoryStorage();
    const chunks: number[] = [];
    await restoreBackup(
      wrap(dst, { onChunk: (_p, n) => chunks.push(n) }),
      blob,
      { replace: false },
    );
    expect(Math.max(...chunks)).toBeLessThanOrEqual(1024 * 1024 + 1);
    for (const p of await listAllFiles(src))
      expect(await bytesOf(await dst.readFile(p))).toEqual(
        await bytesOf(await src.readFile(p)),
      );
  });

  it("writes nothing when the file is invalid, even with replace", async () => {
    const dst = new MemoryStorage();
    await dst.writeFile("datos/perfil.json", enc("MINE"));
    const bad = await makeZip({
      manifestFiles: [{ path: "datos/perfil.json", size: 9, crc32: 0 }],
    });
    await expect(restoreBackup(dst, bad, { replace: true })).rejects.toThrow(
      "Este archivo no es un respaldo válido del Cuaderno de Campo.",
    );
    expect(await dst.readText("datos/perfil.json")).toBe("MINE");
    expect(await dst.list("Respaldos")).toEqual([]);
  });

  it("refuses to overwrite data without replace and touches nothing", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const blob = await backupOf(src);
    const dst = new MemoryStorage();
    await dst.writeFile("datos/perfil.json", enc("MINE"));
    await expect(
      restoreBackup(dst, blob, { replace: false }),
    ).rejects.toThrow();
    expect(await dst.readText("datos/perfil.json")).toBe("MINE");
    expect(await dst.list("Respaldos")).toEqual([]);
  });

  it("with replace: safety backup holds the old data, old files are gone, Respaldos kept (any case)", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const blob = await backupOf(src);
    const dst = new MemoryStorage();
    await dst.writeFile("datos/perfil.json", enc("OLD"));
    await dst.writeFile("2025/datos/anio.json", enc("OLD25"));
    await dst.writeFile("Respaldos/respaldo-2026-01-01-0000.zip", enc("prev"));
    await dst.writeFile("respaldos/other.zip", enc("prev2"));
    await restoreBackup(dst, blob, { replace: true });
    expect(await dst.readText("datos/perfil.json")).toBe('{"a":1}');
    expect(await dst.readFile("2025/datos/anio.json")).toBeNull();
    expect(await dst.readText("Respaldos/respaldo-2026-01-01-0000.zip")).toBe(
      "prev",
    );
    expect(await dst.readText("respaldos/other.zip")).toBe("prev2");
    const safety = (await dst.list("Respaldos")).find((e) =>
      e.name.endsWith("-seguridad.zip"),
    );
    expect(safety).toBeDefined();
    // Restoring the safety backup brings the old data back.
    const back = new MemoryStorage();
    await restoreBackup(
      back,
      (await dst.readFile(`Respaldos/${safety?.name}`)) as Blob,
      { replace: false },
    );
    expect(await back.readText("datos/perfil.json")).toBe("OLD");
    expect(await back.readText("2025/datos/anio.json")).toBe("OLD25");
  });

  it("leaves the folder intact when the safety backup fails", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const blob = await backupOf(src);
    const base = new MemoryStorage();
    await base.writeFile("datos/perfil.json", enc("OLD"));
    const dst = wrap(base, { failWrite: (p) => p.startsWith("Respaldos/") });
    await expect(restoreBackup(dst, blob, { replace: true })).rejects.toThrow();
    expect(await listAllFiles(base)).toEqual(["datos/perfil.json"]);
    expect(await base.readText("datos/perfil.json")).toBe("OLD");
  });

  it("reports the safety backup name if writing fails midway; index files are written last", async () => {
    const src = new MemoryStorage();
    await seed(src);
    const blob = await backupOf(src);
    const base = new MemoryStorage();
    await base.writeFile("datos/perfil.json", enc("OLD"));
    const dst = wrap(base, { failWrite: (p) => p === "2026/fotos/a.jpg" });
    const err = await restoreBackup(dst, blob, { replace: true }).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(
      /^La restauración no terminó\. Tus datos anteriores están en el respaldo de seguridad: respaldo-.*-seguridad\.zip\.$/,
    );
    expect((err as Error).cause).toBeDefined();
    expect(await base.readFile("2026/datos/anio.json")).toBeNull();
    expect(await base.readFile("datos/perfil.json")).toBeNull();
    expect(
      (await base.list("Respaldos")).some((e) =>
        e.name.endsWith("-seguridad.zip"),
      ),
    ).toBe(true);
  });
});
