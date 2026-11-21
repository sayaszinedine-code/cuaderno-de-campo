import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { classroomDir, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type YearData } from "@/domain/schema";

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

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import ReportesPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const classroom = {
  id: "c1",
  name: "Girasoles",
  cycle: "II",
  bands: ["4y"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
} as YearData["classrooms"][number];

const base = (): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-03-01`, end: `${year}-05-15` },
    { id: "B2", name: "II Bimestre", start: `${year}-05-16`, end: `${year}-07-31` },
    { id: "B3", name: "III Bimestre", start: `${year}-08-01`, end: `${year}-10-15` },
    { id: "B4", name: "IV Bimestre", start: `${year}-10-16`, end: `${year}-12-20` },
  ],
  classrooms: [classroom],
  students: [{ id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", active: true }] as YearData["students"],
});

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderPage = async (data: YearData = base()) => {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  render(
    <WorkspaceProvider userId="u1">
      <ReportesPage />
    </WorkspaceProvider>,
  );
};

describe("Reportes page", () => {
  it("shows an empty state without classrooms", async () => {
    await renderPage({ ...base(), classrooms: [], students: [] });
    expect(await screen.findByText("Primero crea un aula en «Aulas».")).toBeInTheDocument();
  });

  it("generates the grade register, saves it in Reportes and offers Abrir and Descargar", async () => {
    await renderPage();
    const card = (await screen.findByRole("heading", { name: "Registro de notas (Excel)" })).closest("section")!;
    expect(screen.getByLabelText("Aula")).toBeInTheDocument();
    expect(screen.getByLabelText("Bimestre")).toBeInTheDocument();
    expect(screen.getByLabelText("Mes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Generar" }));
    const msg = await within(card as HTMLElement).findByText(/^Guardado en Reportes: /, {}, { timeout: 10000 });
    const name = msg.textContent!.replace("Guardado en Reportes: ", "");
    expect(name).toMatch(/^Registro de notas Bimestre 1 Girasoles \d{4}-\d{2}-\d{2} \d{4}\.xlsx$/);
    const files = await storage.list(`${classroomDir(year, classroom)}Reportes`);
    expect(files.map((f) => f.name)).toEqual([name]);
    expect(within(card as HTMLElement).getByRole("button", { name: "Abrir" })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole("button", { name: "Descargar" })).toBeInTheDocument();
  });

  it("generates the monthly attendance and can open it in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const createUrl = vi.fn(() => "blob:fake");
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    await renderPage();
    fireEvent.change(await screen.findByLabelText("Mes"), { target: { value: `${year}-04` } });
    const card = screen.getByRole("heading", { name: "Asistencia del mes (Excel)" }).closest("section") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Generar" }));
    const msg = await within(card).findByText(/^Guardado en Reportes: /, {}, { timeout: 10000 });
    expect(msg.textContent).toMatch(new RegExp(`Asistencia ${year}-04 Girasoles .*\\.xlsx$`));
    fireEvent.click(within(card).getByRole("button", { name: "Abrir" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:fake", "_blank"));
  });

  it("shows the error inside the card when saving fails", async () => {
    await renderPage();
    const card = (await screen.findByRole("heading", { name: "Registro de notas (Excel)" })).closest("section") as HTMLElement;
    vi.spyOn(storage, "writeFile").mockRejectedValue(new Error("disk"));
    fireEvent.click(within(card).getByRole("button", { name: "Generar" }));
    expect(await within(card).findByRole("alert", {}, { timeout: 10000 })).toHaveTextContent("No se pudo generar el reporte.");
  });
});
