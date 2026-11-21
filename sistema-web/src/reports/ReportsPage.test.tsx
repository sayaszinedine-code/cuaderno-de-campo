import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { classroomDir, profilePath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type YearData } from "@/domain/schema";
import type * as Generate from "@/reports/pdf/generate";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);
vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ refresh: vi.fn(), profile: { id: "u1" } }),
}));
const pdfs = vi.hoisted(() => {
  const result = () => Promise.resolve({ blob: new Blob(["%PDF-1.7 fake"], { type: "application/pdf" }), skippedPhotos: 0 });
  return {
    portfolioPdf: vi.fn<typeof Generate.portfolioPdf>(result),
    progressPdf: vi.fn<typeof Generate.progressPdf>(result),
    notebookPdf: vi.fn<typeof Generate.notebookPdf>(result),
  };
});
vi.mock("@/reports/pdf/generate", () => pdfs);

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import { ReportsPage } from "./ReportsPage";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const room = { id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" } as YearData["classrooms"][number];
const base = (): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-03-01`, end: `${year}-05-15` },
    { id: "B2", name: "II Bimestre", start: `${year}-05-16`, end: `${year}-07-31` },
    { id: "B3", name: "III Bimestre", start: `${year}-08-01`, end: `${year}-10-15` },
    { id: "B4", name: "IV Bimestre", start: `${year}-10-16`, end: `${year}-12-20` },
  ],
  classrooms: [room],
  students: [
    { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", active: true },
    { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", active: true },
  ] as YearData["students"],
});

const PROFILE = {
  version: SCHEMA_VERSION,
  firstNames: "Rosa",
  lastNames: "Quispe",
  phone: "",
  region: "Cusco",
  address: "",
  email: "",
  level: "Inicial",
  ugel: "UGEL Cusco",
  institution: "IEI 123",
};

async function seed(withProfile: boolean) {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(base()));
  if (withProfile) await storage.writeTextAtomic(profilePath(), JSON.stringify(PROFILE));
}

const NOTICE = "Completa tu perfil para que aparezca en los reportes.";
const card = (title: string) => within(screen.getByRole("region", { name: title }));

async function renderPage(withProfile = true) {
  await seed(withProfile);
  render(
    <WorkspaceProvider userId="u1">
      <ReportsPage />
    </WorkspaceProvider>,
  );
  await screen.findByRole("heading", { name: "Reportes" });
}

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  pdfs.portfolioPdf.mockClear();
  pdfs.progressPdf.mockClear();
  pdfs.notebookPdf.mockClear();
});
afterEach(() => cleanup());

describe("ReportsPage PDF reports", () => {
  it("warns, without blocking, when the profile is missing", async () => {
    await renderPage(false);
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(card("Portafolio de evidencias (PDF)").getByRole("button", { name: "Generar" })).toBeEnabled();
  });

  it("does not warn when the profile exists", async () => {
    await renderPage(true);
    await screen.findByLabelText("Niño o niña");
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("generates the portfolio of the chosen child between two dates and saves it in Reportes", async () => {
    await renderPage();
    fireEvent.change(await screen.findByLabelText("Niño o niña"), { target: { value: "s2" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: `${year}-03-01` } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: `${year}-04-30` } });
    fireEvent.click(card("Portafolio de evidencias (PDF)").getByRole("button", { name: "Generar" }));

    const status = await card("Portafolio de evidencias (PDF)").findByRole("status");
    expect(status.textContent).toMatch(
      new RegExp(`^Guardado en Reportes: Portafolio Mateo Díaz ${year}-03-01_${year}-04-30 \\d{4}-\\d{2}-\\d{2} \\d{4}\\.pdf$`),
    );
    const args = pdfs.portfolioPdf.mock.calls[0][0];
    expect(args.student.id).toBe("s2");
    expect(args.classroom.id).toBe("c1");
    expect(args.from).toBe(`${year}-03-01`);
    expect(args.to).toBe(`${year}-04-30`);
    expect(args.profile?.firstNames).toBe("Rosa");
    const files = await storage.list(`${classroomDir(year, room)}Reportes`);
    expect(files.map((f) => f.name)).toEqual([status.textContent?.replace("Guardado en Reportes: ", "")]);
    expect(card("Portafolio de evidencias (PDF)").getByRole("button", { name: "Abrir" })).toBeInTheDocument();
    expect(card("Portafolio de evidencias (PDF)").getByRole("button", { name: "Descargar" })).toBeInTheDocument();
  });

  it("generates the progress report of the chosen child and bimester", async () => {
    await renderPage();
    fireEvent.change(await screen.findByLabelText("Niño o niña"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B2" } });
    fireEvent.click(card("Informe de progreso (PDF)").getByRole("button", { name: "Generar" }));
    const status = await card("Informe de progreso (PDF)").findByRole("status");
    expect(status.textContent).toMatch(/^Guardado en Reportes: Informe de progreso Luz Rojas Bimestre 2 .+\.pdf$/);
    const args = pdfs.progressPdf.mock.calls[0][0];
    expect(args.student.id).toBe("s1");
    expect(args.period.id).toBe("B2");
  });

  it("generates the field notebook of the classroom for the date range", async () => {
    await renderPage();
    fireEvent.change(await screen.findByLabelText("Desde"), { target: { value: `${year}-05-01` } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: `${year}-06-30` } });
    fireEvent.click(card("Cuaderno de campo del periodo (PDF)").getByRole("button", { name: "Generar" }));
    const status = await card("Cuaderno de campo del periodo (PDF)").findByRole("status");
    expect(status.textContent).toMatch(
      new RegExp(`^Guardado en Reportes: Cuaderno de campo Girasoles ${year}-05-01_${year}-06-30 .+\\.pdf$`),
    );
    const args = pdfs.notebookPdf.mock.calls[0][0];
    expect(args.classroom.id).toBe("c1");
    expect(args.year).toBe(year);
    expect([args.from, args.to]).toEqual([`${year}-05-01`, `${year}-06-30`]);
  });

  it("keeps the date range and the bimester in the file name of a child with a long name", async () => {
    const long = "Ana María Valentina Fernández de la Cruz Huamaní".padEnd(50, "x");
    expect(long).toHaveLength(50);
    const data = base();
    data.students = [{ id: "s9", classroomId: "c1", firstNames: long, lastNames: "Rojas", active: true }];
    await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
    render(
      <WorkspaceProvider userId="u1">
        <ReportsPage />
      </WorkspaceProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Desde"), { target: { value: `${year}-03-01` } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: `${year}-04-30` } });
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B2" } });
    fireEvent.click(card("Portafolio de evidencias (PDF)").getByRole("button", { name: "Generar" }));
    fireEvent.click(card("Informe de progreso (PDF)").getByRole("button", { name: "Generar" }));
    expect((await card("Portafolio de evidencias (PDF)").findByRole("status")).textContent).toMatch(
      new RegExp(`^Guardado en Reportes: Portafolio Ana María .+ ${year}-03-01_${year}-04-30 \\d{4}-\\d{2}-\\d{2} \\d{4}\\.pdf$`),
    );
    expect((await card("Informe de progreso (PDF)").findByRole("status")).textContent).toMatch(
      /^Guardado en Reportes: Informe de progreso Ana María .+ Bimestre 2 \d{4}-\d{2}-\d{2} \d{4}\.pdf$/,
    );
  });

  it("says how many photos were left out, without blocking", async () => {
    pdfs.notebookPdf.mockResolvedValueOnce({ blob: new Blob(["%PDF"], { type: "application/pdf" }), skippedPhotos: 2 });
    await renderPage();
    fireEvent.click(await card("Cuaderno de campo del periodo (PDF)").findByRole("button", { name: "Generar" }));
    await card("Cuaderno de campo del periodo (PDF)").findByRole("status");
    expect(
      card("Cuaderno de campo del periodo (PDF)").getByText(
        "2 foto(s) no se incluyeron (formato no compatible o archivo no encontrado).",
      ),
    ).toBeInTheDocument();
    expect(card("Cuaderno de campo del periodo (PDF)").getByRole("button", { name: "Abrir" })).toBeInTheDocument();
  });

  it("does not mention photos when none were left out", async () => {
    await renderPage();
    fireEvent.click(await card("Cuaderno de campo del periodo (PDF)").findByRole("button", { name: "Generar" }));
    await card("Cuaderno de campo del periodo (PDF)").findByRole("status");
    expect(card("Cuaderno de campo del periodo (PDF)").queryByText(/foto\(s\) no se incluyeron/)).toBeNull();
  });

  it("refuses an inverted date range", async () => {
    await renderPage();
    fireEvent.change(await screen.findByLabelText("Desde"), { target: { value: `${year}-06-30` } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: `${year}-05-01` } });
    fireEvent.click(card("Cuaderno de campo del periodo (PDF)").getByRole("button", { name: "Generar" }));
    expect(await card("Cuaderno de campo del periodo (PDF)").findByRole("alert")).toHaveTextContent(
      "La fecha «Desde» no puede ser posterior a «Hasta».",
    );
    expect(pdfs.notebookPdf).not.toHaveBeenCalled();
  });

  it("ignores dates outside the open year", async () => {
    await renderPage();
    const from = await screen.findByLabelText("Desde");
    fireEvent.change(from, { target: { value: `${year}-03-02` } });
    fireEvent.change(from, { target: { value: `${year - 1}-12-01` } });
    expect(from).toHaveValue(`${year}-03-02`);
  });

  it("shows an error when the PDF cannot be generated", async () => {
    pdfs.notebookPdf.mockRejectedValueOnce(new Error("boom"));
    await renderPage();
    fireEvent.click(await card("Cuaderno de campo del periodo (PDF)").findByRole("button", { name: "Generar" }));
    expect(await card("Cuaderno de campo del periodo (PDF)").findByRole("alert")).toHaveTextContent("No se pudo generar el reporte.");
    await waitFor(() => expect(card("Cuaderno de campo del periodo (PDF)").getByRole("button", { name: "Generar" })).toBeEnabled());
  });
});
