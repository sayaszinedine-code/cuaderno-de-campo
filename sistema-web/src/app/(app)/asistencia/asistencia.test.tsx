import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { attendancePath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type AttendanceDay, type YearData } from "@/domain/schema";

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
import AsistenciaPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const base = (): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-03-01`, end: `${year}-05-15` },
    { id: "B2", name: "II Bimestre", start: `${year}-05-16`, end: `${year}-07-31` },
    { id: "B3", name: "III Bimestre", start: `${year}-08-01`, end: `${year}-10-15` },
    { id: "B4", name: "IV Bimestre", start: `${year}-10-16`, end: `${year}-12-20` },
  ],
  classrooms: [
    { id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" } as YearData["classrooms"][number],
  ],
  students: [
    { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", active: true },
    { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", active: true },
    { id: "s3", classroomId: "c1", firstNames: "Inés", lastNames: "Paz", active: false },
  ] as YearData["students"],
});

async function seed(days: AttendanceDay[] = [], data: YearData = base()) {
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  await storage.writeTextAtomic(attendancePath(year), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, days }));
}
const saved = async (): Promise<{ days: AttendanceDay[] }> => JSON.parse((await storage.readText(attendancePath(year))) ?? "{}");

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/");
});
afterEach(() => cleanup());

const D = `${year}-04-14`;
const renderIn = async (date = D) => {
  render(<WorkspaceProvider userId="u1"><AsistenciaPage /></WorkspaceProvider>);
  await screen.findByText("Luz Rojas");
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: date } });
};
const btn = (child: string, label: string) => screen.getByRole("button", { name: `${child}: ${label}` });

describe("Asistencia page", () => {
  it("shows an empty state without classrooms", async () => {
    await seed([], { ...base(), classrooms: [], students: [] });
    render(<WorkspaceProvider userId="u1"><AsistenciaPage /></WorkspaceProvider>);
    expect(await screen.findByText("Primero crea un aula en «Aulas».")).toBeInTheDocument();
  });

  it("lists only active children with four toggle buttons each", async () => {
    await seed();
    await renderIn();
    expect(screen.getByText("Mateo Díaz")).toBeInTheDocument();
    expect(screen.queryByText("Inés Paz")).toBeNull();
    for (const l of ["Presente", "Tardanza", "Falta", "Falta justificada"]) {
      expect(btn("Luz Rojas", l)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("marks, changes and unmarks a child, saving each tap", async () => {
    await seed();
    await renderIn();
    fireEvent.click(btn("Luz Rojas", "Presente"));
    await waitFor(() => expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "true"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "P" }));
    fireEvent.click(btn("Luz Rojas", "Falta"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "F" }));
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn("Luz Rojas", "Falta"));
    await waitFor(async () => expect((await saved()).days).toEqual([]));
    expect(btn("Luz Rojas", "Falta")).toHaveAttribute("aria-pressed", "false");
  });

  it("does not lose marks on rapid taps for different children", async () => {
    await seed();
    await renderIn();
    fireEvent.click(btn("Luz Rojas", "Presente"));
    fireEvent.click(btn("Mateo Díaz", "Tardanza"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "P", s2: "T" }));
  });

  it("«Todos presentes» fills only unmarked children", async () => {
    await seed([{ date: D, classroomId: "c1", marks: { s1: "F" } }]);
    await renderIn();
    fireEvent.click(screen.getByRole("button", { name: "Todos presentes" }));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "F", s2: "P" }));
    expect(btn("Luz Rojas", "Falta")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the day counters", async () => {
    await seed([{ date: D, classroomId: "c1", marks: { s1: "T" } }]);
    await renderIn();
    expect(screen.getByLabelText("Contadores del día")).toHaveTextContent(
      "Presentes: 0 · Tardanzas: 1 · Faltas: 0 · Justificadas: 0 · Sin marcar: 1",
    );
  });

  it("merges a duplicated day when saving", async () => {
    await seed([
      { date: D, classroomId: "c1", marks: { s1: "F" } },
      { date: D, classroomId: "c1", marks: { s2: "J" } },
    ]);
    await renderIn();
    fireEvent.click(btn("Luz Rojas", "Presente"));
    await waitFor(async () => {
      const days = (await saved()).days;
      expect(days).toHaveLength(1);
      expect(days[0].marks).toEqual({ s1: "P", s2: "J" });
    });
  });

  it("reverts the visible mark and shows the provider notice when saving fails", async () => {
    await seed([{ date: D, classroomId: "c1", marks: { s1: "F" } }]);
    await renderIn();
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk"));
    fireEvent.click(btn("Luz Rojas", "Presente"));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    await waitFor(() => expect(btn("Luz Rojas", "Falta")).toHaveAttribute("aria-pressed", "true"));
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "false");
  });

  it("warns when the date is outside every bimester", async () => {
    await seed();
    await renderIn(`${year}-01-15`);
    expect(screen.getByText("Esta fecha está fuera de los bimestres del año.")).toBeInTheDocument();
  });

  it("summarises the chosen month and bimester per child", async () => {
    await seed([
      { date: `${year}-04-10`, classroomId: "c1", marks: { s1: "P", s2: "F" } },
      { date: `${year}-04-11`, classroomId: "c1", marks: { s1: "T", s2: "J" } },
      { date: `${year}-05-20`, classroomId: "c1", marks: { s1: "F" } },
      { date: `${year}-04-12`, classroomId: "c1", marks: { s3: "P" } },
    ]);
    await renderIn();
    fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
    const row = (name: string) => within(screen.getByRole("row", { name: new RegExp(name) })).getAllByRole("cell").map((c) => c.textContent);
    // Month (April): Luz P1 T1 F0 J0 100%; bimester B1 (Mar 1 - May 15): same.
    expect(row("Luz Rojas")).toEqual(["1", "1", "0", "0", "100%", "1", "1", "0", "0", "100%"]);
    expect(row("Mateo Díaz")).toEqual(["0", "0", "1", "1", "0%", "0", "0", "1", "1", "0%"]);
    expect(screen.queryByText("Inés Paz")).toBeNull();
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: `${year}-06` } });
    expect(row("Luz Rojas").slice(0, 5)).toEqual(["0", "0", "0", "0", "—"]);
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B2" } });
    expect(row("Luz Rojas").slice(5)).toEqual(["0", "0", "1", "0", "0%"]);
  });

  it("keeps the last tap when the same child is tapped twice without awaiting", async () => {
    await seed();
    await renderIn();
    fireEvent.click(btn("Luz Rojas", "Presente"));
    fireEvent.click(btn("Luz Rojas", "Falta"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "F" }));
    expect(btn("Luz Rojas", "Falta")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the last tap when the first write rejects once", async () => {
    await seed();
    await renderIn();
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValueOnce(new Error("disk"));
    fireEvent.click(btn("Luz Rojas", "Presente"));
    fireEvent.click(btn("Luz Rojas", "Falta"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "F" }));
    await waitFor(() => expect(btn("Luz Rojas", "Falta")).toHaveAttribute("aria-pressed", "true"));
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a third tap pending after P, F, P", async () => {
    await seed();
    await renderIn();
    fireEvent.click(btn("Luz Rojas", "Presente"));
    fireEvent.click(btn("Luz Rojas", "Falta"));
    fireEvent.click(btn("Luz Rojas", "Presente"));
    await waitFor(async () => expect((await saved()).days[0]?.marks).toEqual({ s1: "P" }));
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "true");
  });

  const seedPrevYear = async () => {
    await storage.writeTextAtomic(yearDataPath(year - 1), JSON.stringify({
      ...base(),
      schoolYear: year - 1,
      periods: base().periods.map((p) => ({ ...p, start: p.start.replace(String(year), String(year - 1)), end: p.end.replace(String(year), String(year - 1)) })),
    }));
    await storage.writeTextAtomic(attendancePath(year - 1), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year - 1, days: [] }));
  };
  const Switch = () => {
    const ws = useWorkspace();
    return (
      <>
        <button onClick={() => void ws.setYear(year - 1)}>cambiar año</button>
        <output aria-label="año abierto">{ws.year}</output>
      </>
    );
  };
  const switchYear = async () => {
    fireEvent.click(screen.getByRole("button", { name: "cambiar año" }));
    await waitFor(() => expect(screen.getByLabelText("año abierto")).toHaveTextContent(String(year - 1)));
  };

  it("moves the date into the year switched to and saves taps there", async () => {
    await seed();
    await seedPrevYear();
    render(<WorkspaceProvider userId="u1"><Switch /><AsistenciaPage /></WorkspaceProvider>);
    await screen.findByText("Luz Rojas");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: D } });
    await switchYear();
    const shown = (screen.getByLabelText("Fecha") as HTMLInputElement).value;
    expect(shown.startsWith(`${year - 1}-`)).toBe(true);
    fireEvent.click(btn("Luz Rojas", "Presente"));
    await waitFor(async () => {
      const f = JSON.parse((await storage.readText(attendancePath(year - 1))) ?? "{}");
      expect(f.days).toEqual([{ date: shown, classroomId: "c1", marks: { s1: "P" } }]);
    });
    expect((await saved()).days).toEqual([]);
  });

  it("refuses a tap whose date is outside the open year", async () => {
    await seed();
    await renderIn(`${year - 1}-04-14`);
    fireEvent.click(btn("Luz Rojas", "Presente"));
    expect(await screen.findByText("No se guardó la marca. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "false");
    expect((await saved()).days).toEqual([]);
  });

  it("shows a message when the save is reported as not committed", async () => {
    await seed();
    await renderIn();
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk"));
    fireEvent.click(btn("Luz Rojas", "Presente"));
    expect(await screen.findByText("No se guardó la marca. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(btn("Luz Rojas", "Presente")).toHaveAttribute("aria-pressed", "false");
  });

  it("resets the bimester choice when the date changes", async () => {
    await seed();
    await renderIn(`${year}-04-14`);
    fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B3" } });
    expect(screen.getByLabelText("Bimestre")).toHaveValue("B3");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: `${year}-06-10` } });
    expect(screen.getByLabelText("Bimestre")).toHaveValue("B2");
  });

  it("splits bimester summaries at the boundary dates", async () => {
    await seed([
      { date: `${year}-05-15`, classroomId: "c1", marks: { s1: "F" } },
      { date: `${year}-05-16`, classroomId: "c1", marks: { s1: "P" } },
    ]);
    await renderIn(`${year}-05-15`);
    fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
    const row = () => within(screen.getByRole("row", { name: /Luz Rojas/ })).getAllByRole("cell").map((c) => c.textContent);
    expect(row().slice(5)).toEqual(["0", "0", "1", "0", "0%"]);
    fireEvent.change(screen.getByLabelText("Bimestre"), { target: { value: "B2" } });
    expect(row().slice(5)).toEqual(["1", "0", "0", "0", "100%"]);
  });
});
