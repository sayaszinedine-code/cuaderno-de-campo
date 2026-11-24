import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { createClassroomAndStudent, mockSupabase, signUpActiveTeacher, useOpfsFolder } from "./helpers";

/** 8x8 solid-color PNG (valid zlib stream), generated here so the test needs no fixture file. */
function makePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(8 * 3, 0x9a)]);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row));
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("cuaderno: crear, persistir con foto, filtrar por área y eliminar; sin peticiones a IA", async ({ page }) => {
  const aiRequests: string[] = [];
  page.on("request", (r) => {
    if (/api\.deepseek\.com|api\.anthropic\.com/.test(r.url())) aiRequests.push(r.url());
  });
  await page.route(/api\.deepseek\.com|api\.anthropic\.com/, (r) => r.abort());

  const profile = await mockSupabase(page);
  await useOpfsFolder(page);
  await signUpActiveTeacher(page, profile);
  await createClassroomAndStudent(page);

  // Nuevo registro
  await page.goto("/cuaderno/");
  await page.getByRole("link", { name: "Nuevo registro" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo registro" })).toBeVisible();
  await page.getByRole("button", { name: "Valentina Quispe" }).click();
  await page.getByLabel("¿Qué hizo o dijo? Describe los hechos").fill("Agrupó los bloques por color");
  await page.getByLabel("Agregar fotos").setInputFiles({ name: "bloques.png", mimeType: "image/png", buffer: makePng() });
  await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();
  await page.getByLabel(/^Área/).selectOption({ label: "Matemática" });
  await page.getByLabel(/^Competencia/).selectOption({ label: "Resuelve problemas de cantidad" });
  await page.getByRole("group", { name: "Desempeños" }).getByRole("checkbox").first().check();
  await page.getByLabel("Interpretación en relación al desempeño").fill("Clasifica según un criterio.");
  await page.getByLabel("Reflexión docente en relación a la actividad").fill("Repetir con material variado.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  // En la lista
  await expect(page).toHaveURL(/\/cuaderno\/$/);
  const card = page.getByRole("article").filter({ hasText: "Agrupó los bloques por color" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Valentina Quispe")).toBeVisible();
  await expect(card.getByRole("img", { name: "Foto 1 del registro" })).toBeVisible();

  // Tras recargar sigue ahí con su miniatura
  await page.reload();
  const reloaded = page.getByRole("article").filter({ hasText: "Agrupó los bloques por color" });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.getByRole("img", { name: "Foto 1 del registro" })).toBeVisible();
  const thumbWidth = await reloaded.getByRole("img", { name: "Foto 1 del registro" }).evaluate((i: HTMLImageElement) => i.naturalWidth);
  expect(thumbWidth).toBeGreaterThan(0);

  // La foto existe de verdad en la carpeta (comprimida a JPEG)
  const countPhotos = () =>
    page.evaluate(async () => {
      let n = 0;
      const walk = async (dir: FileSystemDirectoryHandle): Promise<void> => {
        for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle);
          else if (/^evidencia-\d+\.jpg$/.test(name)) n++;
        }
      };
      await walk(await navigator.storage.getDirectory());
      return n;
    });
  expect(await countPhotos()).toBe(1);

  // El filtro por área lo muestra (y otra área no); los filtros están plegados tras «Filtros»
  await page.getByText("Filtros", { exact: true }).click();
  await page.getByLabel(/^Área/).selectOption({ label: "Matemática" });
  await expect(page.getByRole("article").filter({ hasText: "Agrupó los bloques por color" })).toBeVisible();
  await page.getByLabel(/^Área/).selectOption({ label: "Comunicación" });
  await expect(page.getByText("Ningún registro coincide con los filtros.")).toBeVisible();
  await page.getByLabel(/^Área/).selectOption({ label: "Matemática" });

  // Eliminar
  await page.getByRole("article").filter({ hasText: "Agrupó los bloques por color" }).getByRole("link", { name: "Abrir" }).click();
  // «Abrir» shows the read-only view; deleting happens from «Editar».
  await expect(page.getByText("Agrupó los bloques por color")).toBeVisible();
  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Eliminar registro" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page).toHaveURL(/\/cuaderno\/$/);
  await expect(page.getByText("Agrupó los bloques por color")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Todavía no hay registros.")).toBeVisible();
  expect(await countPhotos()).toBe(0);

  expect(aiRequests).toEqual([]);
});
