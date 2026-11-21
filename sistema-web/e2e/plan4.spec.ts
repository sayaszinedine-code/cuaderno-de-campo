import { expect, test, type Page } from "@playwright/test";
// Aliased: `use…` is a Playwright helper, not a React hook (keeps react-hooks/rules-of-hooks quiet inside `setUp`).
import { createClassroomAndStudent, mockSupabase, signUpActiveTeacher, useOpfsFolder as withOpfsFolder } from "./helpers";

const YEAR = new Date().getFullYear();
const COMPETENCY = "Resuelve problemas de cantidad";

type OpfsFile = { path: string; size: number };

/** Every file under the OPFS root (path relative to it, size in bytes). */
const opfsFiles = (page: Page): Promise<OpfsFile[]> =>
  page.evaluate(async () => {
    const found: { path: string; size: number }[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        const path = `${prefix}${name}`;
        if (h.kind === "directory") await walk(h as FileSystemDirectoryHandle, `${path}/`);
        else found.push({ path, size: (await (h as FileSystemFileHandle).getFile()).size });
      }
    };
    await walk(await navigator.storage.getDirectory(), "");
    return found.sort((a, b) => a.path.localeCompare(b.path));
  });

const opfsPaths = async (page: Page, pattern: RegExp) => (await opfsFiles(page)).map((f) => f.path).filter((p) => pattern.test(p));

/** Reads one OPFS file (path relative to the OPFS root) as text, or null when it does not exist. */
const opfsText = (page: Page, path: string): Promise<string | null> =>
  page.evaluate(async (p) => {
    let dir = await navigator.storage.getDirectory();
    const parts = p.split("/");
    try {
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text();
    } catch {
      return null;
    }
  }, path);

/** Reads one OPFS file as bytes. */
async function opfsBytes(page: Page, path: string): Promise<Buffer> {
  const base64 = await page.evaluate(async (p) => {
    let dir = await navigator.storage.getDirectory();
    const parts = p.split("/");
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const bytes = new Uint8Array(await (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, path);
  return Buffer.from(base64, "base64");
}

/** All attendance marks saved in this year's `asistencia.json`, sorted. */
async function savedMarks(page: Page): Promise<string[]> {
  const text = await opfsText(page, `Cuaderno de Campo/${YEAR}/datos/asistencia.json`);
  if (!text) return [];
  const file = JSON.parse(text) as { days: { marks: Record<string, string> }[] };
  return file.days.flatMap((d) => Object.values(d.marks)).sort();
}

/** Mocked Supabase, OPFS folder, AI blocked (and recorded); signed in on the folder screen. */
async function setUp(page: Page): Promise<string[]> {
  const aiRequests: string[] = [];
  page.on("request", (r) => {
    if (/api\.deepseek\.com|api\.anthropic\.com/.test(r.url())) aiRequests.push(r.url());
  });
  await page.route(/api\.deepseek\.com|api\.anthropic\.com/, (r) => r.abort());
  const profile = await mockSupabase(page);
  await withOpfsFolder(page);
  await signUpActiveTeacher(page, profile);
  return aiRequests;
}

async function addStudent(page: Page, firstNames: string, lastNames: string) {
  await page.goto("/ninos/");
  await page.getByLabel("Nombres").fill(firstNames);
  await page.getByLabel("Apellidos").fill(lastNames);
  await page.getByRole("button", { name: "Agregar niño" }).click();
  await expect(page.getByRole("link", { name: `${lastNames}, ${firstNames}` })).toBeVisible();
}

test("asistencia: P y F persisten tras recargar y el resumen del mes muestra el porcentaje", async ({ page }) => {
  const aiRequests = await setUp(page);
  await createClassroomAndStudent(page);
  await addStudent(page, "Mateo", "Flores");

  await page.goto("/asistencia/");
  await page.getByRole("button", { name: "Valentina Quispe: Presente" }).click();
  await page.getByRole("button", { name: "Mateo Flores: Falta", exact: true }).click();
  await expect(page.getByLabel("Contadores del día")).toHaveText(
    "Presentes: 1 · Tardanzas: 0 · Faltas: 1 · Justificadas: 0 · Sin marcar: 0",
  );
  // The counters are optimistic: wait until both marks are on disk before reloading.
  await expect.poll(() => savedMarks(page)).toEqual(["F", "P"]);

  await page.reload();
  await expect(page.getByRole("button", { name: "Valentina Quispe: Presente" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Mateo Flores: Falta", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Mateo Flores: Presente" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("tab", { name: "Resumen" }).click();
  const summary = page.getByRole("region", { name: "Resumen de asistencia" });
  // Columns: name | month P T F J % | period P T F J %
  const cells = (name: string) => summary.getByRole("row").filter({ has: page.getByRole("rowheader", { name }) }).getByRole("cell");
  await expect(cells("Valentina Quispe")).toHaveText(["1", "0", "0", "0", "100%", "1", "0", "0", "0", "100%"]);
  await expect(cells("Mateo Flores")).toHaveText(["0", "0", "1", "0", "0%", "0", "0", "1", "0", "0%"]);

  expect(aiRequests).toEqual([]);
});

test("agenda: un evento creado aparece en Inicio", async ({ page }) => {
  const aiRequests = await setUp(page);

  await page.goto("/agenda/");
  await page.getByRole("button", { name: "Agregar evento" }).click();
  await page.getByLabel("Título").fill("Reunión con familias");
  await page.getByLabel("Tipo").selectOption("Reunión");
  await page.getByLabel("Hora").fill("15:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  const dayEvents = page.getByRole("region", { name: "Eventos del día" });
  await expect(dayEvents.getByText("Reunión con familias")).toBeVisible();

  await page.goto("/inicio/");
  const upcoming = page.getByRole("region", { name: "Próximos eventos" });
  await expect(upcoming.getByRole("link", { name: /15:00 — Reunión con familias$/ })).toBeVisible();

  expect(aiRequests).toEqual([]);
});

test("respaldo: hacer respaldo, archivar un niño y restaurar el zip con confirmación y respaldo de seguridad", async ({ page }) => {
  const aiRequests = await setUp(page);
  await createClassroomAndStudent(page);

  await page.goto("/carpeta/");
  await page.getByRole("button", { name: "Hacer respaldo ahora" }).click();
  const saved = page.getByRole("status").filter({ hasText: "Respaldo guardado en Respaldos/" });
  await expect(saved).toBeVisible();
  const name = (await saved.textContent())?.match(/respaldo-\d{4}-\d{2}-\d{2}-\d{4}(?: \(\d+\))?\.zip/)?.[0];
  if (!name) throw new Error("backup name not shown");
  const zipPath = `Cuaderno de Campo/Respaldos/${name}`;
  expect((await opfsFiles(page)).find((f) => f.path === zipPath)?.size ?? 0).toBeGreaterThan(0);
  const zip = await opfsBytes(page, zipPath);

  // The UI has no hard delete for children: archiving takes Valentina off the active list.
  await page.goto("/ninos/");
  await page.getByRole("link", { name: "Quispe, Valentina" }).click();
  await page.getByRole("button", { name: "Archivar niño" }).click();
  await expect(page.getByRole("button", { name: "Restaurar niño" })).toBeVisible();
  await page.goto("/ninos/");
  await expect(page.getByText("Todavía no hay niños en esta lista.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toHaveCount(0);

  await page.goto("/carpeta/");
  await page.getByLabel("Archivo de respaldo", { exact: true }).setInputFiles({ name, mimeType: "application/zip", buffer: zip });
  await expect(page.getByText("Esto reemplazará los datos de esta carpeta. Se hará antes un respaldo de seguridad.")).toBeVisible();
  await page.getByRole("button", { name: "Sí, reemplazar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Respaldo restaurado." })).toBeVisible();

  const safety = await opfsPaths(page, /^Cuaderno de Campo\/Respaldos\/respaldo-\d{4}-\d{2}-\d{2}-\d{4}-seguridad(?: \(\d+\))?\.zip$/);
  expect(safety).toHaveLength(1);
  expect(await opfsPaths(page, /^Cuaderno de Campo\/Respaldos\//)).toContain(zipPath);

  await page.goto("/ninos/");
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toBeVisible();

  expect(aiRequests).toEqual([]);
});

test("importación: JSON de la app anterior con 2 niños y 1 registro con foto; importar de nuevo no duplica", async ({ page }) => {
  const aiRequests = await setUp(page);
  await createClassroomAndStudent(page);

  // A real JPEG data URL, as the old app exported it.
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#9a6";
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/jpeg", 0.8);
  });
  expect(jpeg.startsWith("data:image/jpeg;base64,")).toBe(true);

  // Shape of «Descargar respaldo completo (JSON)» (cuaderno-app/www/index.html: `respaldo()` / `cargarEjemplo()`).
  const legacy = {
    perfil: { nombre: "María Pérez", ie: "IEI 123", aula: "Girasoles", ugel: "UGEL 01" },
    ninos: [
      { id: "n1", nombre: "Mateo Flores Ccori", nac: "2021-02-03", apo: "Luis Flores", tel: "", notas: "" },
      { id: "n2", nombre: "Camila Rojas Mamani", nac: "2021-08-21", apo: "Elena Mamani", tel: "", notas: "" },
    ],
    registros: {
      r1: {
        id: "r1",
        fecha: `${YEAR}-11-10`,
        hora: "09:30",
        momento: "Juego libre en sectores",
        tipo: "obs",
        area: "Matemática",
        comp: COMPETENCY,
        nivel: "A",
        ninos: ["n1"],
        hecho: "Mateo agrupó los bloques por color",
        interpretacion: "",
        acciones: "",
        fotos: [{ src: jpeg }],
      },
    },
    asis: { [`${YEAR}-11`]: { [`${YEAR}-11-10`]: { n1: "P", n2: "F" } } },
    agenda: [{ id: "e1", fecha: `${YEAR}-12-01`, hora: "15:00", titulo: "Reunión con familias", tipo: "Reunión", nota: "" }],
  };
  const file = { name: "cuaderno-respaldo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(legacy)) };

  await page.goto("/carpeta/");
  await page.getByLabel("Archivo de respaldo (.json)").setInputFiles(file);
  await expect(page.getByLabel("Aula de destino")).toHaveValue(/.+/);
  await expect(page.getByText("Niños: 2")).toBeVisible();
  await expect(page.getByText("Registros: 1")).toBeVisible();
  await expect(page.getByText("Fotos: 1")).toBeVisible();
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importación terminada" })).toHaveText(
    "Importación terminada: se agregaron 2 niños, 1 registros, 1 fotos, 1 días de asistencia y 1 eventos.",
  );

  const photos = () => opfsPaths(page, /\/evidencia-\d+\.jpg$/);
  expect(await photos()).toHaveLength(1);

  // Importing the same file again only adds what is new: nothing.
  await page.getByLabel("Archivo de respaldo (.json)").setInputFiles(file);
  await expect(page.getByText("Este respaldo ya se importó. Solo se agregará lo nuevo.")).toBeVisible();
  await expect(page.getByText("Niños: 0")).toBeVisible();
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importación terminada" })).toHaveText(
    "Importación terminada: se agregaron 0 niños, 0 registros, 0 fotos, 0 días de asistencia y 0 eventos.",
  );
  expect(await photos()).toHaveLength(1);

  await page.goto("/ninos/");
  await expect(page.getByRole("link", { name: "Flores Ccori, Mateo" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Rojas Mamani, Camila" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Quispe, Valentina" })).toHaveCount(1);

  await page.goto("/cuaderno/");
  const card = page.getByRole("article").filter({ hasText: "Mateo agrupó los bloques por color" });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("img", { name: "Foto 1 del registro" })).toBeVisible();

  expect(aiRequests).toEqual([]);
});

test("reportes: el Excel de notas y el PDF de progreso se guardan en Reportes/ del aula", async ({ page }) => {
  const aiRequests = await setUp(page);
  await createClassroomAndStudent(page);

  await page.goto("/reportes/");
  const grades = page.getByRole("region", { name: "Registro de notas (Excel)" });
  await grades.getByRole("button", { name: "Generar" }).click();
  await expect(grades.getByRole("status")).toContainText(/Guardado en Reportes: Registro de notas Girasoles .*\.xlsx$/);

  const progress = page.getByRole("region", { name: "Informe de progreso (PDF)" });
  await progress.getByRole("button", { name: "Generar" }).click();
  await expect(progress.getByRole("status").first()).toContainText(
    /Guardado en Reportes: Informe de progreso Valentina Quispe .*\.pdf$/,
  );

  const reports = (await opfsFiles(page)).filter((f) => new RegExp(`^Cuaderno de Campo/${YEAR}/[^/]+/Reportes/`).test(f.path));
  const xlsx = reports.filter((f) => /\/Registro de notas Girasoles [^/]*\.xlsx$/.test(f.path));
  const pdf = reports.filter((f) => /\/Informe de progreso Valentina Quispe [^/]*\.pdf$/.test(f.path));
  expect(xlsx).toHaveLength(1);
  expect(pdf).toHaveLength(1);
  expect(xlsx[0].size).toBeGreaterThan(0);
  expect(pdf[0].size).toBeGreaterThan(0);

  expect(aiRequests).toEqual([]);
});

test.describe("sin conexión", () => {
  test.use({ serviceWorkers: "allow" });

  test("con el service worker activo la app abre sin red, muestra «Sin conexión» y guarda la asistencia", async ({
    page,
    context,
  }) => {
    const aiRequests = await setUp(page);
    await createClassroomAndStudent(page);

    await page.goto("/asistencia/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    await context.setOffline(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByText("Sin conexión: tus datos se guardan en tu computadora.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asistencia" })).toBeVisible();
    await page.getByRole("button", { name: "Valentina Quispe: Presente" }).click();
    await expect(page.getByRole("button", { name: "Valentina Quispe: Presente" })).toHaveAttribute("aria-pressed", "true");

    await expect.poll(() => savedMarks(page)).toEqual(["P"]);

    await context.setOffline(false);
    expect(aiRequests).toEqual([]);
  });
});
