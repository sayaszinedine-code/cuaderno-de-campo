import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { notesPath, yearDataPath } from "@/domain/paths";
import { todayISO } from "@/domain/classrooms";
import { SCHEMA_VERSION, type FieldNote, type YearData } from "@/domain/schema";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);
vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ profile: { id: "u1", firstNames: "Ana", role: "teacher" } }),
}));

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import CuadernoPage from "./page";
import InicioPage from "../inicio/page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const base = (): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-01-01`, end: `${year}-06-30` },
    { id: "B2", name: "II Bimestre", start: `${year}-07-01`, end: `${year}-08-31` },
    { id: "B3", name: "III Bimestre", start: `${year}-09-01`, end: `${year}-10-31` },
    { id: "B4", name: "IV Bimestre", start: `${year}-11-01`, end: `${year}-12-31` },
  ],
  classrooms: [
    {
      id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive",
    } as YearData["classrooms"][number],
  ],
  students: [
    { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", birthDate: "2021-05-01", active: true },
    { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", birthDate: "2021-06-01", active: true },
  ] as YearData["students"],
});

const note = (over: Partial<FieldNote>): FieldNote => ({
  id: "n", date: `${year}-03-10`, classroomId: "c1", studentIds: [], wholeGroup: false, moment: "Taller",
  kind: "obs", performances: [], evidenceText: "", evidence: [], interpretation: "", reflection: "",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

async function seed(notes: FieldNote[], data: YearData = base()) {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  await storage.writeTextAtomic(notesPath(year), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, notes }));
}

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/");
});
afterEach(() => cleanup());

const renderIn = (ui: React.ReactElement) => render(<WorkspaceProvider userId="u1">{ui}</WorkspaceProvider>);

describe("Cuaderno list", () => {
  it("shows the empty state and the new-note link", async () => {
    await seed([]);
    renderIn(<CuadernoPage />);
    expect(
      await screen.findByText("Todavía no hay registros. Toca «Nuevo registro» para tu primera observación."),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Nuevo registro" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) expect(l).toHaveAttribute("href", "/cuaderno/registro");
  });

  it("shows the record count in the header", async () => {
    await seed([note({ id: "a", evidenceText: "uno" }), note({ id: "b", evidenceText: "dos" })]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    expect(screen.getByText("2 registros")).toBeInTheDocument();
  });

  it("says 1 registro for a single record", async () => {
    await seed([note({ id: "a", evidenceText: "uno" })]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    expect(screen.getByText("1 registro")).toBeInTheDocument();
  });

  it("active filters appear as chips that remove them", async () => {
    await seed([
      note({ id: "a", evidenceText: "uno", kind: "logro" }),
      note({ id: "b", evidenceText: "dos", kind: "obs" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "logro" } });
    expect(screen.queryByText("dos")).not.toBeInTheDocument();
    expect(screen.getByText("Filtros (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Quitar filtro: / }));
    expect(screen.getByText("dos")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
  });

  it("clearing the area chip also clears the competency", async () => {
    await seed([note({ id: "a", evidenceText: "uno", areaId: "comunicacion", competencyId: "escribe" })]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "comunicacion" } });
    fireEvent.change(screen.getByLabelText("Competencia"), { target: { value: "escribe" } });
    expect(screen.getByText("Filtros (2)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro: Comunicación" }));
    expect(screen.getByLabelText("Área")).toHaveValue("");
    expect(screen.getByLabelText("Competencia")).toHaveValue("");
  });

  it("shows each child's initials on the card", async () => {
    await seed([note({ id: "a", studentIds: ["s1"], evidenceText: "uno" })]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    expect(screen.getByText("LR")).toBeInTheDocument();
  });

  it("renders cards with kind, children and an Abrir link", async () => {
    await seed([
      note({ id: "a", studentIds: ["s1"], evidenceText: "Armó una torre", kind: "logro" }),
      note({ id: "b", wholeGroup: true, evidenceText: "Cantaron" }),
    ]);
    renderIn(<CuadernoPage />);
    expect(await screen.findByText("Armó una torre")).toBeInTheDocument();
    expect(screen.getByText("Luz Rojas", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("Todo el grupo")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Abrir" });
    expect(links.map((l) => l.getAttribute("href")).sort()).toEqual([
      "/cuaderno/registro?id=a",
      "/cuaderno/registro?id=b",
    ]);
  });

  it("filters by kind and by child", async () => {
    await seed([
      note({ id: "a", studentIds: ["s1"], evidenceText: "uno", kind: "logro" }),
      note({ id: "b", studentIds: ["s2"], evidenceText: "dos", kind: "obs" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "logro" } });
    expect(screen.queryByText("dos")).not.toBeInTheDocument();
    expect(screen.getByText("uno")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Niño o niña"), { target: { value: "s2" } });
    expect(screen.queryByText("uno")).not.toBeInTheDocument();
    expect(screen.getByText("dos")).toBeInTheDocument();
  });

  it("filters by area and narrows competencies to it", async () => {
    await seed([
      note({ id: "a", evidenceText: "uno", areaId: "comunicacion", competencyId: "escribe" }),
      note({ id: "b", evidenceText: "dos", areaId: "matematica" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("uno");
    const comp = screen.getByLabelText("Competencia");
    const before = within(comp).getAllByRole("option").length;
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "comunicacion" } });
    expect(screen.queryByText("dos")).not.toBeInTheDocument();
    expect(within(comp).getAllByRole("option").length).toBeLessThan(before);
  });

  it("search ignores accents", async () => {
    await seed([
      note({ id: "a", evidenceText: "Construyó un puente" }),
      note({ id: "b", evidenceText: "Pintó" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("Pintó");
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "construyo" } });
    expect(screen.queryByText("Pintó")).not.toBeInTheDocument();
    expect(screen.getByText("Construyó un puente")).toBeInTheDocument();
  });

  it("loads thumbnails via storage, tolerates missing files and revokes on unmount", async () => {
    await seed([note({ id: "a", evidenceText: "x", evidence: ["a/1.jpg", "a/missing.jpg"] })]);
    await storage.writeFile("a/1.jpg", new Blob(["x"], { type: "image/jpeg" }));
    const create = vi.fn(() => "blob:thumb-1");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const { unmount } = renderIn(<CuadernoPage />);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(await screen.findByAltText("Foto 1 del registro")).toHaveAttribute("src", "blob:thumb-1");
    expect(screen.getByText("Foto no disponible")).toBeInTheDocument();
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:thumb-1");
  });
});

describe("Cuaderno robustness", () => {
  it("does not create a URL for a read that resolves after unmount", async () => {
    await seed([note({ id: "a", evidenceText: "x", evidence: ["a/late.jpg"] })]);
    let release: (b: Blob) => void = () => {};
    const reads = vi.fn();
    const orig = storage.readFile.bind(storage);
    storage.readFile = (path: string) => {
      if (path !== "a/late.jpg") return orig(path);
      reads();
      return new Promise<Blob | null>((r) => (release = r));
    };
    const create = vi.fn(() => "blob:late");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const { unmount } = renderIn(<CuadernoPage />);
    await screen.findByText("x");
    await waitFor(() => expect(reads).toHaveBeenCalled());
    unmount();
    release(new Blob(["z"]));
    await new Promise((r) => setTimeout(r, 20));
    expect(create).not.toHaveBeenCalled();
  });

  it("paginates 30 at a time and resets when a filter changes", async () => {
    await seed(
      Array.from({ length: 45 }, (_, i) =>
        note({ id: `n${i}`, evidenceText: `t${i}`, kind: i < 40 ? "obs" : "logro" }),
      ),
    );
    renderIn(<CuadernoPage />);
    await screen.findByText("Mostrando 30 de 45 registros");
    expect(screen.getAllByRole("link", { name: "Abrir" })).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getAllByRole("link", { name: "Abrir" })).toHaveLength(45);
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "obs" } });
    expect(screen.getByText("Mostrando 30 de 40 registros")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "" } });
    expect(screen.getByText("Mostrando 30 de 45 registros")).toBeInTheDocument();
  });
});

describe("Inicio shortcuts", () => {
  it("shows the new-note button, last 3 notes and the warning with names", async () => {
    const today = todayISO();
    await seed([
      note({ id: "a", date: today, studentIds: ["s1"], evidenceText: "r1" }),
      note({ id: "b", date: `${year}-01-02`, evidenceText: "r2" }),
      note({ id: "c", date: `${year}-01-03`, evidenceText: "r3" }),
      note({ id: "d", date: `${year}-01-04`, evidenceText: "r4" }),
    ]);
    renderIn(<InicioPage />);
    expect(await screen.findByRole("link", { name: "Nuevo registro" })).toHaveAttribute(
      "href",
      "/cuaderno/registro",
    );
    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.queryByText("r2")).not.toBeInTheDocument();
    expect(screen.getByText("1 niño o niña sin observaciones en las últimas 2 semanas")).toBeInTheDocument();
    expect(screen.getByText("Mateo Díaz")).toBeInTheDocument();
  });

  it("uses the plural and hides the warning when everyone has notes", async () => {
    await seed([]);
    const { unmount } = renderIn(<InicioPage />);
    expect(await screen.findByText("2 niños sin observaciones en las últimas 2 semanas")).toBeInTheDocument();
    unmount();
    await seed([note({ id: "a", date: todayISO(), wholeGroup: true })]);
    renderIn(<InicioPage />);
    await screen.findByRole("link", { name: "Nuevo registro" });
    await waitFor(() => expect(screen.queryByText(/sin observaciones/)).not.toBeInTheDocument());
  });
});

describe("Cuaderno timeline and pending status", () => {
  it("groups records under day headings", async () => {
    await seed([note({ id: "a", date: todayISO(), evidenceText: "hoy pasó" })]);
    renderIn(<CuadernoPage />);
    await screen.findByText("hoy pasó");
    expect(screen.getByRole("heading", { level: 2, name: "Hoy" })).toBeInTheDocument();
  });

  it("tags a record without area as Por completar", async () => {
    await seed([note({ id: "a", evidenceText: "rápido" })]);
    renderIn(<CuadernoPage />);
    const card = (await screen.findByText("rápido")).closest("article")!;
    expect(within(card).getByText("Por completar")).toBeInTheDocument();
  });

  it("the Estado filter shows only pending records", async () => {
    await seed([
      note({ id: "a", evidenceText: "sin área" }),
      note({ id: "b", evidenceText: "con área", areaId: "matematica" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("sin área");
    const estado = screen.getByLabelText("Estado");
    expect(within(estado).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todos", "Por completar", "Completos"]);
    fireEvent.change(estado, { target: { value: "pending" } });
    expect(screen.queryByText("con área")).not.toBeInTheDocument();
    expect(screen.getByText("sin área")).toBeInTheDocument();
  });

  it("?estado=pendiente pre-selects the filter and its chip clears it", async () => {
    window.history.pushState({}, "", "/cuaderno/?estado=pendiente");
    await seed([
      note({ id: "a", evidenceText: "sin área" }),
      note({ id: "b", evidenceText: "con área", areaId: "matematica" }),
    ]);
    renderIn(<CuadernoPage />);
    await screen.findByText("sin área");
    expect(screen.queryByText("con área")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro: Por completar" }));
    expect(screen.getByText("con área")).toBeInTheDocument();
  });

  it("Inicio links to the records still to complete", async () => {
    await seed([note({ id: "a", evidenceText: "x" }), note({ id: "b", evidenceText: "y" }), note({ id: "c", evidenceText: "z", areaId: "matematica" })]);
    renderIn(<InicioPage />);
    const link = await screen.findByRole("link", { name: /2 registros por completar/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/^\/cuaderno\/?\?estado=pendiente$/));
  });

  it("Inicio shows no reminder when everything is complete", async () => {
    await seed([note({ id: "c", evidenceText: "z", areaId: "matematica" })]);
    renderIn(<InicioPage />);
    await screen.findByText(/Últimos registros/);
    expect(screen.queryByText(/por completar/)).not.toBeInTheDocument();
  });
});
