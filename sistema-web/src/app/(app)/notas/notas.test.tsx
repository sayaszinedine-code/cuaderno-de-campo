import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { gradesPath, notesPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type FieldNote, type GradeEntry, type YearData } from "@/domain/schema";

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

import { WorkspaceProvider, useWorkspace } from "@/workspace/WorkspaceProvider";
import NotasPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const base = (cycle: "I" | "II" = "II"): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-01-01`, end: `${year}-03-31` },
    { id: "B2", name: "II Bimestre", start: `${year}-04-01`, end: `${year}-06-30` },
    { id: "B3", name: "III Bimestre", start: `${year}-07-01`, end: `${year}-09-30` },
    { id: "B4", name: "IV Bimestre", start: `${year}-10-01`, end: `${year}-12-31` },
  ],
  classrooms: [
    {
      id: "c1", name: "Girasoles", cycle, bands: [cycle === "II" ? "4y" : "18m"],
      disabledCompetencyIds: ["gestiona-aprendizaje"], cycleIGrading: "descriptive",
    } as YearData["classrooms"][number],
  ],
  students: [
    { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", active: true },
    { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", active: true },
    { id: "s3", classroomId: "c1", firstNames: "Inés", lastNames: "Paz", active: false },
  ] as YearData["students"],
});

const note = (over: Partial<FieldNote>): FieldNote => ({
  id: "n", date: `${year}-02-10`, classroomId: "c1", studentIds: [], wholeGroup: false, moment: "Taller",
  kind: "obs", performances: [], evidenceText: "", evidence: [], interpretation: "", reflection: "",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

const entry = (over: Partial<GradeEntry>): GradeEntry => ({
  studentId: "s1", competencyId: "x", periodId: "B1", conclusion: "", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

async function seed(opts: { data?: YearData; notes?: FieldNote[]; entries?: GradeEntry[] } = {}) {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(opts.data ?? base()));
  await storage.writeTextAtomic(
    notesPath(year),
    JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, notes: opts.notes ?? [] }),
  );
  await storage.writeTextAtomic(
    gradesPath(year),
    JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, entries: opts.entries ?? [], finals: [] }),
  );
}
const savedGrades = async () => JSON.parse((await storage.readText(gradesPath(year))) ?? "{}");

function mockMatchMedia(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes("max-width"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/");
  mockMatchMedia(false);
});
afterEach(() => cleanup());

const renderIn = () => render(<WorkspaceProvider userId="u1"><NotasPage /></WorkspaceProvider>);
const COMP = "Se comunica oralmente en su lengua materna";
const cellBtn = (child: string, comp = COMP) =>
  screen.getByRole("button", { name: new RegExp(`^${child} — ${comp}:`) });

describe("Notas page", () => {
  it("shows an empty state without classrooms", async () => {
    await seed({ data: { ...base(), classrooms: [], students: [] } });
    renderIn();
    expect(await screen.findByText("Primero crea un aula en «Aulas».")).toBeInTheDocument();
  });

  it("links each child to the yearly summary", async () => {
    await seed();
    renderIn();
    await screen.findByText("Luz Rojas");
    expect(screen.getByRole("link", { name: "Ver año de Luz Rojas" })).toHaveAttribute(
      "href",
      expect.stringContaining("/notas/anual?aula=c1&nino=s1"),
    );
  });

  it("lists active children and active competencies", async () => {
    await seed();
    renderIn();
    expect(await screen.findByText("Luz Rojas")).toBeInTheDocument();
    expect(screen.getByText("Mateo Díaz")).toBeInTheDocument();
    expect(screen.queryByText("Inés Paz")).toBeNull();
    expect(cellBtn("Luz Rojas")).toHaveAccessibleName(`Luz Rojas — ${COMP}: sin nota`);
    expect(screen.queryByRole("button", { name: /Gestiona su aprendizaje/ })).toBeNull();
  });

  it("defaults to the bimester containing today and reports progress", async () => {
    await seed({ entries: [entry({ competencyId: "comunica-oralmente", level: "A" })] });
    renderIn();
    await screen.findByText("Luz Rojas");
    const month = new Date().getMonth();
    expect(screen.getByLabelText("Bimestre")).toHaveValue(["B1", "B2", "B3", "B4"][Math.floor(month / 3)]);
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    expect(screen.getByText(/Calificado: 1 de \d+/)).toBeInTheDocument();
  });

  it("saves a level and a conclusion to notas.json", async () => {
    await seed();
    renderIn();
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    fireEvent.click(cellBtn("Luz Rojas"));
    const panel = await screen.findByRole("dialog");
    fireEvent.click(within(panel).getByLabelText(/^A — Logro esperado/));
    fireEvent.change(within(panel).getByLabelText("Conclusión descriptiva"), { target: { value: "Dialoga con sus pares." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Nota guardada.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(async () =>
      expect((await savedGrades()).entries[0]).toMatchObject({
        studentId: "s1", periodId: "B1", level: "A", conclusion: "Dialoga con sus pares.",
      }),
    );
  });

  it("hides the level selector for a descriptive cycle I classroom", async () => {
    await seed({ data: base("I") });
    renderIn();
    await screen.findByText("Luz Rojas");
    fireEvent.click(screen.getAllByRole("button", { name: /^Luz Rojas — / })[0]);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByLabelText(/Logro esperado/)).toBeNull();
    expect(within(panel).getByLabelText("Conclusión descriptiva")).toBeInTheDocument();
  });

  it("shows only the matching evidence, or the empty message", async () => {
    await seed({
      notes: [
        note({ id: "a", studentIds: ["s1"], competencyId: "comunica-oralmente", evidenceText: "Contó un cuento" }),
        note({ id: "b", studentIds: ["s2"], competencyId: "comunica-oralmente", evidenceText: "De Mateo" }),
        note({ id: "c", studentIds: ["s1"], competencyId: "comunica-oralmente", date: `${year}-05-01`, evidenceText: "Otro bimestre" }),
      ],
    });
    renderIn();
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    fireEvent.click(cellBtn("Luz Rojas"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Evidencias del bimestre (1)")).toBeInTheDocument();
    expect(within(panel).getByText("Contó un cuento")).toBeInTheDocument();
    expect(within(panel).queryByText("De Mateo")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(cellBtn("Mateo Díaz", "Lee diversos tipos de texto en su lengua materna"));
    expect(
      await screen.findByText("Aún no hay registros del cuaderno para esta competencia en este bimestre."),
    ).toBeInTheDocument();
  });

  it("keeps the panel and data open when saving fails", async () => {
    await seed();
    renderIn();
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    fireEvent.click(cellBtn("Luz Rojas"));
    const panel = await screen.findByRole("dialog");
    fireEvent.change(within(panel).getByLabelText("Conclusión descriptiva"), { target: { value: "Texto" } });
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk"));
    fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    expect(await within(panel).findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Nota guardada.")).toBeNull();
    expect(within(panel).getByLabelText("Conclusión descriptiva")).toHaveValue("Texto");
  });

  it("does not write into another year when the year changes with the editor open", async () => {
    await seed();
    const prev = year - 1;
    await storage.writeTextAtomic(yearDataPath(prev), JSON.stringify({ ...base(), schoolYear: prev }));
    await storage.writeTextAtomic(notesPath(prev), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: prev, notes: [] }));
    await storage.writeTextAtomic(
      gradesPath(prev),
      JSON.stringify({ version: SCHEMA_VERSION, schoolYear: prev, entries: [], finals: [] }),
    );
    function Switch() {
      const ws = useWorkspace();
      return <button onClick={() => void ws.setYear(prev)}>cambiar año</button>;
    }
    render(
      <WorkspaceProvider userId="u1">
        <Switch />
        <NotasPage />
      </WorkspaceProvider>,
    );
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    fireEvent.click(cellBtn("Luz Rojas"));
    const panel = await screen.findByRole("dialog");
    fireEvent.change(within(panel).getByLabelText("Conclusión descriptiva"), { target: { value: "Texto" } });
    fireEvent.click(screen.getByRole("button", { name: "cambiar año" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    // let the year switch be applied before saving
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
    expect(JSON.parse((await storage.readText(gradesPath(prev))) ?? "{}").entries).toEqual([]);
  });

  it("changing the bimester changes the cells", async () => {
    await seed({ entries: [entry({ competencyId: "comunica-oralmente", level: "AD", periodId: "B2" })] });
    renderIn();
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B1" } });
    expect(cellBtn("Luz Rojas")).toHaveAccessibleName(/sin nota$/);
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B2" } });
    expect(cellBtn("Luz Rojas")).toHaveAccessibleName(/: AD/);
  });

  it("shows a per-child list on mobile", async () => {
    mockMatchMedia(true);
    await seed();
    renderIn();
    await screen.findByText("Luz Rojas");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Luz Rojas$/ }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^Luz Rojas — ${COMP}:`) }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
