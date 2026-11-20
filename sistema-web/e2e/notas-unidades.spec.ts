import { expect, test, type Page } from "@playwright/test";
import { createClassroomAndStudent, createNote, mockSupabase, signUpActiveTeacher, useOpfsFolder } from "./helpers";

const COMPETENCY = "Resuelve problemas de cantidad";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Paths (relative to OPFS root) of the files whose full path contains `fragment`. */
const opfsFiles = (page: Page, fragment: string) =>
  page.evaluate(async (frag) => {
    const found: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        const path = `${prefix}${name}`;
        if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle, `${path}/`);
        else if (path.includes(frag)) found.push(path);
      }
    };
    await walk(await navigator.storage.getDirectory(), "");
    return found;
  }, fragment);

test("notas y unidades: nota con evidencia, consolidado anual, unidad con adjunto y sesión vinculada; sin IA", async ({ page }) => {
  const aiRequests: string[] = [];
  page.on("request", (r) => {
    if (/api\.deepseek\.com|api\.anthropic\.com/.test(r.url())) aiRequests.push(r.url());
  });
  await page.route(/api\.deepseek\.com|api\.anthropic\.com/, (r) => r.abort());

  const profile = await mockSupabase(page);
  await useOpfsFolder(page);
  await signUpActiveTeacher(page, profile);
  await createClassroomAndStudent(page);

  // Registro del cuaderno dentro de B4 (12 oct – 18 dic) del año cargado
  const noteDate = `${new Date().getFullYear()}-11-10`;
  await createNote(page, { date: noteDate, text: "Agrupó los bloques por color", competency: COMPETENCY });

  // Notas: B4, celda de Valentina en la competencia
  await page.goto("/notas/");
  await page.getByLabel("Bimestre").selectOption("B4");
  await page.getByRole("button", { name: `Valentina Quispe — ${COMPETENCY}: sin nota` }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("heading", { name: "Evidencias del bimestre (1)" })).toBeVisible();
  await expect(editor.getByText("Agrupó los bloques por color")).toBeVisible();
  await editor.getByRole("radio", { name: /^A — / }).check();
  await editor.getByLabel("Conclusión descriptiva").fill("Clasifica objetos según un criterio.");
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nota guardada." })).toBeVisible();

  await page.reload();
  await page.getByLabel("Bimestre").selectOption("B4");
  const cell = page.getByRole("button", { name: `Valentina Quispe — ${COMPETENCY}: A` });
  await expect(cell).toBeVisible();
  await expect(cell.getByText("A", { exact: true })).toBeVisible();
  await cell.click();
  await expect(page.getByRole("dialog").getByLabel("Conclusión descriptiva")).toHaveValue("Clasifica objetos según un criterio.");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Consolidado anual: final automático desde B4
  await page.getByRole("link", { name: "Ver año de Valentina Quispe" }).click();
  await expect(page.getByRole("heading", { name: "Notas del año — Valentina Quispe" })).toBeVisible();
  const finalButton = page.getByRole("button", { name: `${COMPETENCY} — Final: auto (de B4)` });
  await expect(finalButton).toBeVisible();
  await expect(finalButton.getByText("A", { exact: true })).toBeVisible();

  // Unidad «Mi familia» en B4 con adjunto .docx
  await page.goto("/unidades/");
  await page.getByLabel("Bimestre").selectOption("B4");
  await page.getByRole("link", { name: "Nueva unidad" }).click();
  await expect(page.getByRole("heading", { name: "Nueva unidad" })).toBeVisible();
  await page.getByLabel("Título").fill("Mi familia");
  await page.getByLabel("Propósito").fill("Conocer a mi familia");
  await page.getByRole("group", { name: "Competencias" }).getByLabel(COMPETENCY).check();
  await page.getByLabel("Agregar archivos").setInputFiles({
    name: "Planificacion.docx",
    mimeType: DOCX,
    buffer: Buffer.from("PK\u0003\u0004 contenido de prueba"),
  });
  await expect(page.getByText("Planificacion.docx").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeEnabled();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/unidades\/\?/);
  await expect(page.getByRole("link", { name: /Mi familia/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mi familia/ })).toContainText("1 archivo");

  await page.getByRole("link", { name: /Mi familia/ }).click();
  await expect(page.getByRole("heading", { name: "Editar unidad" })).toBeVisible();
  const unitUrl = page.url();

  // Sesión vinculada al registro
  await page.getByRole("link", { name: "Nueva sesión" }).click();
  await expect(page.getByRole("heading", { name: "Nueva sesión" })).toBeVisible();
  await page.getByLabel("Fecha").fill(noteDate);
  await page.getByLabel("Título").fill("Dibujo mi familia");
  await page.getByRole("group", { name: "Registros del cuaderno vinculados" }).getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(unitUrl);
  await expect(page.getByRole("link", { name: new RegExp(`${noteDate} · Dibujo mi familia`) })).toBeVisible();

  // Todo persiste tras recargar
  await page.reload();
  await expect(page.getByLabel("Título")).toHaveValue("Mi familia");
  await expect(page.getByText("Planificacion.docx")).toBeVisible();
  await page.getByRole("link", { name: new RegExp("Dibujo mi familia") }).click();
  await expect(page.getByRole("heading", { name: "Editar sesión" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Registros del cuaderno vinculados" }).getByRole("checkbox").first(),
  ).toBeChecked();

  // El archivo existe de verdad en la carpeta
  const files = await opfsFiles(page, "Unidades y sesiones/Bimestre 4/Mi familia - ");
  expect(files.filter((f) => f.endsWith("Planificacion.docx"))).toHaveLength(1);

  // Eliminar la unidad borra sus archivos
  await page.goto(unitUrl);
  await page.getByRole("button", { name: "Eliminar unidad" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page).toHaveURL(/\/unidades\/\?/);
  await expect(page.getByText("Aún no hay unidades en este bimestre.")).toBeVisible();
  await expect.poll(() => opfsFiles(page, "Unidades y sesiones/Bimestre 4/Mi familia - ")).toEqual([]);

  expect(aiRequests).toEqual([]);
});
