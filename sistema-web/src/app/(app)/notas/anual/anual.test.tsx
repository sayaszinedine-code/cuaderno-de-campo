import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { gradesPath, notesPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type FinalOverride, type GradeEntry, type YearData } from "@/domain/schema";

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
import AnualPage from "./page";

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

const entry = (over: Partial<GradeEntry>): GradeEntry => ({
  studentId: "s1", competencyId: "comunica-oralmente", periodId: "B1", conclusion: "", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

async function seed(opts: { data?: YearData; entries?: GradeEntry[]; finals?: FinalOverride[] } = {}) {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(opts.data ?? base()));
  await storage.writeTextAtomic(notesPath(year), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, notes: [] }));
  await storage.writeTextAtomic(
    gradesPath(year),
    JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, entries: opts.entries ?? [], finals: opts.finals ?? [] }),
  );
}
const savedGrades = async () => JSON.parse((await storage.readText(gradesPath(year))) ?? "{}");

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/notas/anual/?aula=c1&nino=s1");
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

const renderIn = () => render(<WorkspaceProvider userId="u1"><AnualPage /></WorkspaceProvider>);
const COMP = "Se comunica oralmente en su lengua materna";
const row = () => screen.getByRole("row", { name: new RegExp(COMP) });
const finalBtn = () => screen.getByRole("button", { name: new RegExp(`^${COMP} — Final`) });

describe("Anual page", () => {
  it("shows B1..B4 and the automatic final with its origin", async () => {
    await seed({ entries: [entry({ level: "B" }), entry({ periodId: "B2", level: "A" })] });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    for (const h of ["B1", "B2", "B3", "B4", "Final"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    const cells = within(row()).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("B");
    expect(cells[1]).toHaveTextContent("A");
    expect(finalBtn()).toHaveTextContent("A");
    expect(finalBtn()).toHaveTextContent("auto (de B2)");
  });

  it("saves an override and shows it as «ajustado»", async () => {
    await seed({ entries: [entry({ level: "B" })] });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    fireEvent.click(finalBtn());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/^AD/));
    fireEvent.change(within(dialog).getByLabelText("Conclusión descriptiva"), { target: { value: "Logra mucho." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(finalBtn()).toHaveTextContent("ajustado"));
    expect(finalBtn()).toHaveTextContent("AD");
    const saved = await savedGrades();
    expect(saved.finals).toHaveLength(1);
    expect(saved.finals[0]).toMatchObject({ studentId: "s1", competencyId: "comunica-oralmente", level: "AD", conclusion: "Logra mucho." });
  });

  it("does not create an override when saving the automatic values unchanged", async () => {
    await seed({ entries: [entry({ level: "B", conclusion: "ok" })] });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    const before = await storage.readText(gradesPath(year));
    fireEvent.click(finalBtn());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(finalBtn()).toHaveTextContent("auto (de B1)");
    expect(await storage.readText(gradesPath(year))).toBe(before);
  });

  it("clears the override when saved empty", async () => {
    await seed({
      entries: [entry({ level: "B" })],
      finals: [{ studentId: "s1", competencyId: "comunica-oralmente", level: "AD", conclusion: "x", updatedAt: "2026-01-01T00:00:00.000Z" }],
    });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    fireEvent.click(finalBtn());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Sin nivel"));
    fireEvent.change(within(dialog).getByLabelText("Conclusión descriptiva"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await savedGrades()).finals).toEqual([]));
  });

  it("does not write into another year when the year changes with the editor open", async () => {
    await seed({ entries: [entry({ level: "B" })] });
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
        <AnualPage />
      </WorkspaceProvider>,
    );
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    fireEvent.click(finalBtn());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/^AD/));
    fireEvent.click(screen.getByRole("button", { name: "cambiar año" }));
    await new Promise((r) => setTimeout(r, 100));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
    expect(JSON.parse((await storage.readText(gradesPath(prev))) ?? "{}").finals).toEqual([]);
  });

  it("«Volver al automático» removes the override", async () => {
    await seed({
      entries: [entry({ level: "B" })],
      finals: [{ studentId: "s1", competencyId: "comunica-oralmente", level: "AD", conclusion: "x", updatedAt: "2026-01-01T00:00:00.000Z" }],
    });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    expect(finalBtn()).toHaveTextContent("ajustado");
    fireEvent.click(finalBtn());
    fireEvent.click(await screen.findByRole("button", { name: "Volver al automático" }));
    await waitFor(() => expect(finalBtn()).toHaveTextContent("auto (de B1)"));
    expect((await savedGrades()).finals).toEqual([]);
  });

  it("does not offer «Volver al automático» without an override", async () => {
    await seed();
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    fireEvent.click(finalBtn());
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Volver al automático" })).toBeNull();
  });

  it("navigates between children with Anterior and Siguiente and the selector", async () => {
    await seed();
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByRole("heading", { name: /Mateo Díaz/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(window.location.search).toContain("nino=s2");
    fireEvent.change(screen.getByLabelText("Niño o niña"), { target: { value: "s1" } });
    expect(await screen.findByRole("heading", { name: /Luz Rojas/ })).toBeInTheDocument();
  });

  it("falls back to the first classroom and child without params", async () => {
    window.history.pushState({}, "", "/notas/anual/");
    await seed();
    renderIn();
    expect(await screen.findByRole("heading", { name: /Luz Rojas/ })).toBeInTheDocument();
  });

  it("explains unknown ids with a link back", async () => {
    window.history.pushState({}, "", "/notas/anual/?aula=c1&nino=nope");
    await seed();
    renderIn();
    expect(await screen.findByText("No encontramos a ese niño o niña.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Notas/ })).toHaveAttribute("href", expect.stringMatching(/^\/notas\/?$/));
  });

  it("shows no levels in a descriptive classroom", async () => {
    await seed({ data: base("I"), entries: [entry({ competencyId: "comunica-oralmente", conclusion: "Dice palabras." })] });
    renderIn();
    await screen.findByRole("heading", { name: /Luz Rojas/ });
    fireEvent.click(finalBtn());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Nivel de logro")).toBeNull();
  });
});
