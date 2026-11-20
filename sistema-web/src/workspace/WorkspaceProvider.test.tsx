import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import type { Storage } from "@/storage/types";
import { agendaPath, attendancePath, gradesPath, notesPath, unitsPath, yearDataPath } from "@/domain/paths";
import type { FieldNote, NotesFile, YearData } from "@/domain/schema";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

const restoreMock = vi.hoisted(() => ({ restoreBackup: vi.fn() }));
vi.mock("@/backup/restore", () => restoreMock);

import { WorkspaceProvider, useWorkspace } from "./WorkspaceProvider";

const YEAR = new Date().getFullYear();

function Probe() {
  const ws = useWorkspace();
  return (
    <div>
      <p>year:{ws.year}</p>
      <p>classrooms:{ws.yearData.classrooms.length}</p>
      <p>years:{ws.years.join(",")}</p>
      <button
        onClick={() => {
          void ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("a")] }));
          void ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("b")] }));
        }}
      >
        two
      </button>
    </div>
  );
}

function mkRoom(id: string) {
  return { id, name: id, cycle: "II" as const, bands: ["3y" as const], disabledCompetencyIds: [], cycleIGrading: "descriptive" as const };
}

function renderWs() {
  return render(
    <WorkspaceProvider userId="u1">
      <Probe />
    </WorkspaceProvider>,
  );
}

beforeEach(() => {
  Object.values(pick).forEach((f) => f.mockReset());
  pick.supportsFolderAccess.mockReturnValue(true);
  pick.openFallbackStorage.mockResolvedValue(null);
});

describe("WorkspaceProvider", () => {
  it("asks to choose a folder when none is saved", async () => {
    pick.restoreStorage.mockResolvedValue({ status: "needs-folder" });
    pick.chooseFolder.mockResolvedValue(new MemoryStorage());
    renderWs();
    expect(await screen.findByText("Elige dónde guardar tu cuaderno")).toBeInTheDocument();
    expect(pick.restoreStorage).toHaveBeenCalledWith("u1");
    fireEvent.click(screen.getByRole("button", { name: "Elegir carpeta" }));
    expect(await screen.findByText(`year:${YEAR}`)).toBeInTheDocument();
    expect(pick.chooseFolder).toHaveBeenCalledWith("u1");
  });

  it("treats a cancelled picker as a no-op", async () => {
    pick.restoreStorage.mockResolvedValue({ status: "needs-folder" });
    pick.chooseFolder.mockRejectedValue(new DOMException("x", "AbortError"));
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: "Elegir carpeta" }));
    expect(screen.getByText("Elige dónde guardar tu cuaderno")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for permission and offers another folder", async () => {
    pick.restoreStorage.mockResolvedValue({ status: "needs-permission", folderName: "Cuaderno de Campo" });
    pick.grantPermission.mockResolvedValue(new MemoryStorage());
    renderWs();
    expect(await screen.findByText('Permite el acceso a la carpeta "Cuaderno de Campo"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir otra carpeta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Permitir" }));
    expect(await screen.findByText(`year:${YEAR}`)).toBeInTheDocument();
    expect(pick.grantPermission).toHaveBeenCalledWith("u1");
  });

  it("stays on the permission screen when the permission is refused", async () => {
    pick.restoreStorage.mockResolvedValue({ status: "needs-permission", folderName: "Cuaderno de Campo" });
    pick.grantPermission.mockResolvedValue(null);
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: "Permitir" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir otra carpeta" })).toBeInTheDocument();
  });

  it("uses browser storage with a persistent warning when folder access is unsupported", async () => {
    pick.supportsFolderAccess.mockReturnValue(false);
    const opfs = new MemoryStorage();
    pick.openFallbackStorage.mockResolvedValue(opfs);
    renderWs();
    expect(await screen.findByText(`year:${YEAR}`)).toBeInTheDocument();
    expect(pick.restoreStorage).not.toHaveBeenCalled();
    expect(pick.openFallbackStorage).toHaveBeenCalledWith("u1");
    expect(
      screen.getByText(
        "Tu navegador no permite elegir una carpeta. Tus datos se guardarán dentro del navegador: usa Chrome o Edge en tu computadora y haz respaldos.",
      ),
    ).toBeInTheDocument();
  });

  it("blocks when the browser cannot store anything", async () => {
    pick.supportsFolderAccess.mockReturnValue(false);
    pick.openFallbackStorage.mockResolvedValue(null);
    renderWs();
    expect(await screen.findByText(/Usa Chrome o Edge en tu computadora/)).toBeInTheDocument();
    expect(screen.queryByText(`year:${YEAR}`)).toBeNull();
  });

  it("shows the data error and writes nothing when a file is corrupt", async () => {
    const storage = new MemoryStorage();
    await storage.writeTextAtomic(yearDataPath(YEAR), "{no json");
    const write = vi.spyOn(storage, "writeTextAtomic");
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    renderWs();
    expect(
      await screen.findByText("No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada."),
    ).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });

  it("persists update() to storage", async () => {
    const storage = new MemoryStorage();
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: "two" }));
    await waitFor(() => expect(screen.getByText("classrooms:2")).toBeInTheDocument());
    const saved = JSON.parse((await storage.readText(yearDataPath(YEAR))) ?? "{}");
    expect(saved.classrooms.map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
  });

  it("serializes writes: they never overlap and land in order", async () => {
    const storage = new MemoryStorage();
    const real = storage.writeTextAtomic.bind(storage);
    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(storage, "writeTextAtomic").mockImplementation(async (p, t) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      await real(p, t);
      inFlight--;
    });
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: "two" }));
    await waitFor(() => expect(screen.getByText("classrooms:2")).toBeInTheDocument());
    expect(maxInFlight).toBe(1);
  });

  it("shows a save error and keeps state equal to what is on disk", async () => {
    const storage: Storage = new MemoryStorage();
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk gone"));
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: "two" }));
    expect(
      await screen.findByText("No se pudo guardar. Revisa que la carpeta siga disponible."),
    ).toBeInTheDocument();
    expect(screen.getByText("classrooms:0")).toBeInTheDocument();
  });

  it("changes year and lists the current year even without a file", async () => {
    const storage = new MemoryStorage();
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    function Years() {
      const ws = useWorkspace();
      return (
        <button onClick={() => void ws.setYear(YEAR - 1)}>
          prev {ws.year} [{ws.years.join(",")}]
        </button>
      );
    }
    render(
      <WorkspaceProvider userId="u1">
        <Years />
      </WorkspaceProvider>,
    );
    const btn = await screen.findByRole("button", { name: new RegExp(`prev ${YEAR} \\[${YEAR}`) });
    await act(async () => btn.click());
    expect(await screen.findByRole("button", { name: new RegExp(`prev ${YEAR - 1}`) })).toBeInTheDocument();
  });

  it("does not let a pending save leak into a newly chosen folder", async () => {
    const oldStorage = new MemoryStorage();
    const newStorage = new MemoryStorage();
    const realWrite = oldStorage.writeTextAtomic.bind(oldStorage);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    vi.spyOn(oldStorage, "writeTextAtomic").mockImplementation(async (p, t) => {
      calls++;
      if (calls === 1) await gate;
      await realWrite(p, t);
    });
    const newWrite = vi.spyOn(newStorage, "writeTextAtomic");
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage: oldStorage });
    pick.chooseFolder.mockResolvedValue(newStorage);
    function Both() {
      const ws = useWorkspace();
      return (
        <div>
          <p>rooms:{ws.yearData.classrooms.length}</p>
          <p>folder:{ws.storage.kind}:{ws.storage === newStorage ? "new" : "old"}</p>
          <button onClick={() => {
            void ws.update((d) => ({ ...d, classrooms: [mkRoom("slow")] }));
            void ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("queued")] }));
          }}>go</button>
          <button onClick={() => void ws.changeFolder()}>switch</button>
        </div>
      );
    }
    render(<WorkspaceProvider userId="u1"><Both /></WorkspaceProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "go" }));
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByText("folder:memory:new")).toBeInTheDocument();
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByText("rooms:0")).toBeInTheDocument();
    expect(newWrite).not.toHaveBeenCalled();
    expect(await newStorage.readText(yearDataPath(YEAR))).toBeNull();
    expect(calls).toBe(1);
  });

  it("opens the most recent year with data when the current year has none", async () => {
    const storage = new MemoryStorage();
    for (const y of [YEAR - 3, YEAR - 1]) {
      await storage.writeTextAtomic(
        yearDataPath(y),
        JSON.stringify({ version: 1, schoolYear: y, periods: [], classrooms: [mkRoom(`r${y}`)], students: [] }),
      );
    }
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    renderWs();
    expect(await screen.findByText(`year:${YEAR - 1}`)).toBeInTheDocument();
    expect(screen.getByText("classrooms:1")).toBeInTheDocument();
    expect(screen.getByText(`years:${YEAR},${YEAR - 1},${YEAR - 3}`)).toBeInTheDocument();
  });

  it("opens the current year when it has data, even if a later year exists", async () => {
    const storage = new MemoryStorage();
    for (const y of [YEAR, YEAR + 1]) {
      await storage.writeTextAtomic(
        yearDataPath(y),
        JSON.stringify({ version: 1, schoolYear: y, periods: [], classrooms: [], students: [] }),
      );
    }
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    renderWs();
    expect(await screen.findByText(`year:${YEAR}`)).toBeInTheDocument();
  });

  describe("update() result", () => {
    let result: Promise<boolean> | undefined;
    function Saver({ fn }: { fn: (d: YearData) => YearData }) {
      const ws = useWorkspace();
      return <button onClick={() => (result = ws.update(fn))}>save</button>;
    }
    const addRoom = (d: YearData) => ({ ...d, classrooms: [...d.classrooms, mkRoom("x")] });
    async function clickSave(fn: (d: YearData) => YearData, storage: Storage) {
      pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
      render(
        <WorkspaceProvider userId="u1">
          <Saver fn={fn} />
        </WorkspaceProvider>,
      );
      fireEvent.click(await screen.findByRole("button", { name: "save" }));
      return result;
    }

    it("resolves true when the save committed", async () => {
      expect(await clickSave(addRoom, new MemoryStorage())).toBe(true);
    });

    it("resolves false (and shows the banner) when the save fails", async () => {
      const storage = new MemoryStorage();
      vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk gone"));
      expect(await clickSave(addRoom, storage)).toBe(false);
      expect(await screen.findByText("No se pudo guardar. Revisa que la carpeta siga disponible.")).toBeInTheDocument();
    });

    it("resolves false when fn throws", async () => {
      const boom = () => {
        throw new Error("bad");
      };
      expect(await clickSave(boom, new MemoryStorage())).toBe(false);
    });
  });

  it("resolves update() false when it was skipped as stale after a folder change", async () => {
    const oldStorage = new MemoryStorage();
    const realWrite = oldStorage.writeTextAtomic.bind(oldStorage);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(oldStorage, "writeTextAtomic").mockImplementation(async (p, t) => {
      await gate;
      await realWrite(p, t);
    });
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage: oldStorage });
    pick.chooseFolder.mockResolvedValue(new MemoryStorage());
    const results: Promise<boolean>[] = [];
    function Both() {
      const ws = useWorkspace();
      return (
        <div>
          <button onClick={() => {
            results.push(ws.update((d) => ({ ...d, classrooms: [mkRoom("slow")] })));
            results.push(ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("queued")] })));
          }}>go</button>
          <button onClick={() => void ws.changeFolder()}>switch</button>
        </div>
      );
    }
    render(<WorkspaceProvider userId="u1"><Both /></WorkspaceProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "go" }));
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(pick.chooseFolder).toHaveBeenCalled());
    release();
    expect(await results[0]).toBe(false);
    expect(await results[1]).toBe(false);
  });
  describe("field notes", () => {
    const emptyNotes = (y: number): NotesFile => ({ version: 1, schoolYear: y, notes: [] });
    const mkNote = (id: string): FieldNote => ({
      id,
      date: `${YEAR}-03-01`,
      classroomId: "c1",
      studentIds: [],
      wholeGroup: true,
      moment: "",
      kind: "obs",
      performances: [],
      evidenceText: "",
      evidence: [],
      interpretation: "",
      reflection: "",
      createdAt: "",
      updatedAt: "",
    });
    const seedNotes = (y: number, ids: string[]) =>
      JSON.stringify({ ...emptyNotes(y), notes: ids.map(mkNote) });
    let results: Promise<boolean>[] = [];

    function NotesProbe() {
      const ws = useWorkspace();
      return (
        <div>
          <p>year:{ws.year}</p>
          <p>notes:{ws.notes.map((n) => n.id).join(",")}</p>
          <button onClick={() => results.push(ws.updateNotes((f) => ({ ...f, notes: [...f.notes, mkNote("n1")] })))}>
            add
          </button>
          <button
            onClick={() => {
              results.push(ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("a")] })));
              results.push(ws.updateNotes((f) => ({ ...f, notes: [...f.notes, mkNote("n2")] })));
            }}
          >
            both
          </button>
          <button
            onClick={() =>
              results.push(ws.updateNotes((f) => ({ ...f, notes: [...f.notes, mkNote("guarded")] }), { year: YEAR }))
            }
          >
            add-current
          </button>
          <button onClick={() => void ws.setYear(YEAR - 1)}>prev</button>
          <button onClick={() => void ws.reload()}>reload</button>
        </div>
      );
    }
    function renderNotes(storage: Storage) {
      results = [];
      pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
      render(
        <WorkspaceProvider userId="u1">
          <NotesProbe />
        </WorkspaceProvider>,
      );
    }

    it("updateNotes saves to cuaderno.json and resolves true", async () => {
      const storage = new MemoryStorage();
      renderNotes(storage);
      fireEvent.click(await screen.findByRole("button", { name: "add" }));
      expect(await screen.findByText("notes:n1")).toBeInTheDocument();
      expect(await results[0]).toBe(true);
      const saved = JSON.parse((await storage.readText(notesPath(YEAR))) ?? "{}");
      expect(saved.notes.map((n: { id: string }) => n.id)).toEqual(["n1"]);
    });

    it("serializes update and updateNotes fired together", async () => {
      const storage = new MemoryStorage();
      const real = storage.writeTextAtomic.bind(storage);
      let inFlight = 0;
      let maxInFlight = 0;
      vi.spyOn(storage, "writeTextAtomic").mockImplementation(async (p, t) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        await real(p, t);
        inFlight--;
      });
      renderNotes(storage);
      fireEvent.click(await screen.findByRole("button", { name: "both" }));
      expect(await Promise.all(results)).toEqual([true, true]);
      expect(maxInFlight).toBe(1);
      expect(await storage.readText(yearDataPath(YEAR))).not.toBeNull();
      expect(await storage.readText(notesPath(YEAR))).not.toBeNull();
    });

    it("returns false, shows the banner and reverts to disk when saveNotes fails", async () => {
      const storage = new MemoryStorage();
      vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk gone"));
      renderNotes(storage);
      fireEvent.click(await screen.findByRole("button", { name: "add" }));
      expect(await screen.findByText("No se pudo guardar. Revisa que la carpeta siga disponible.")).toBeInTheDocument();
      expect(await results[0]).toBe(false);
      expect(screen.getByText("notes:")).toBeInTheDocument();
    });

    it("updateNotes with a year writes nothing when another year is loaded", async () => {
      const storage = new MemoryStorage();
      await storage.writeTextAtomic(notesPath(YEAR - 1), seedNotes(YEAR - 1, ["old"]));
      renderNotes(storage);
      await screen.findByText(`year:${YEAR}`);
      fireEvent.click(screen.getByRole("button", { name: "add-current" }));
      expect(await results[0]).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "prev" }));
      expect(await screen.findByText("notes:old")).toBeInTheDocument();
      const before = await storage.readText(notesPath(YEAR - 1));
      const write = vi.spyOn(storage, "writeTextAtomic");
      fireEvent.click(screen.getByRole("button", { name: "add-current" }));
      expect(await results[1]).toBe(false);
      expect(write).not.toHaveBeenCalled();
      expect(await storage.readText(notesPath(YEAR - 1))).toBe(before);
      expect(screen.getByText("notes:old")).toBeInTheDocument();
    });

    it("loads the notes of the chosen year on setYear and on reload", async () => {
      const storage = new MemoryStorage();
      await storage.writeTextAtomic(notesPath(YEAR), seedNotes(YEAR, ["cur"]));
      await storage.writeTextAtomic(notesPath(YEAR - 1), seedNotes(YEAR - 1, ["old"]));
      renderNotes(storage);
      expect(await screen.findByText("notes:cur")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "prev" }));
      expect(await screen.findByText("notes:old")).toBeInTheDocument();
      await storage.writeTextAtomic(notesPath(YEAR - 1), seedNotes(YEAR - 1, ["old", "newer"]));
      fireEvent.click(screen.getByRole("button", { name: "reload" }));
      expect(await screen.findByText("notes:old,newer")).toBeInTheDocument();
    });

    it("keeps the previous year and shows a notice when the other year's notes are corrupt", async () => {
      const storage = new MemoryStorage();
      await storage.writeTextAtomic(notesPath(YEAR - 1), "{no json");
      renderNotes(storage);
      await screen.findByText(`year:${YEAR}`);
      fireEvent.click(screen.getByRole("button", { name: "prev" }));
      expect(await screen.findByText("No se pudo abrir ese año.")).toBeInTheDocument();
      expect(screen.getByText(`year:${YEAR}`)).toBeInTheDocument();
    });

    it("shows the data error and writes nothing when cuaderno.json is corrupt", async () => {
      const storage = new MemoryStorage();
      await storage.writeTextAtomic(notesPath(YEAR), "{no json");
      const write = vi.spyOn(storage, "writeTextAtomic");
      renderNotes(storage);
      expect(
        await screen.findByText("No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada."),
      ).toBeInTheDocument();
      expect(write).not.toHaveBeenCalled();
    });
  });
});

describe("grades and units", () => {
  const entry = { studentId: "s1", competencyId: "k1", periodId: "B1" as const, level: "A" as const, conclusion: "x", updatedAt: "" };
  const gradesJson = (y: number, ok = true) =>
    JSON.stringify({ version: 1, schoolYear: y, entries: ok ? [entry] : [], finals: [] });
  const mkUnit = (id: string) => ({
    id,
    classroomId: "c1",
    periodId: "B1" as const,
    kind: "unidad" as const,
    title: "",
    purpose: "",
    competencyIds: [],
    performances: [],
    description: "",
    attachments: [],
    createdAt: "",
    updatedAt: "",
  });
  const unitsJson = (y: number, ids: string[]) =>
    JSON.stringify({ version: 1, schoolYear: y, units: ids.map(mkUnit), sessions: [] });
  let results: Promise<boolean>[] = [];

  function GUProbe() {
    const ws = useWorkspace();
    return (
      <div>
        <p>year:{ws.year}</p>
        <p>entries:{ws.grades.entries.length}</p>
        <p>units:{ws.units.units.map((u) => u.id).join(",")}</p>
        <button
          onClick={() => results.push(ws.updateGrades((f) => ({ ...f, entries: [...f.entries, entry] })))}
        >
          add-grade
        </button>
        <button
          onClick={() =>
            results.push(ws.updateUnits((f) => ({ ...f, units: [...f.units, mkUnit("u1")] })))
          }
        >
          add-unit
        </button>
        <button
          onClick={() => {
            results.push(ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("a")] })));
            results.push(ws.updateGrades((f) => ({ ...f, entries: [...f.entries, entry] })));
            results.push(ws.updateUnits((f) => ({ ...f, units: [...f.units, mkUnit("u2")] })));
          }}
        >
          all
        </button>
        <button
          onClick={() => results.push(ws.updateGrades((f) => ({ ...f, entries: [...f.entries, entry] }), { year: YEAR }))}
        >
          grade-current
        </button>
        <button
          onClick={() =>
            results.push(ws.updateUnits((f) => ({ ...f, units: [...f.units, mkUnit("g")] }), { year: YEAR }))
          }
        >
          unit-current
        </button>
        <button onClick={() => void ws.setYear(YEAR - 1)}>prev</button>
      </div>
    );
  }
  function renderGU(storage: Storage) {
    results = [];
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    render(
      <WorkspaceProvider userId="u1">
        <GUProbe />
      </WorkspaceProvider>,
    );
  }

  it("updateGrades and updateUnits save to their own files", async () => {
    const storage = new MemoryStorage();
    renderGU(storage);
    fireEvent.click(await screen.findByRole("button", { name: "add-grade" }));
    fireEvent.click(screen.getByRole("button", { name: "add-unit" }));
    expect(await Promise.all(results)).toEqual([true, true]);
    expect(JSON.parse((await storage.readText(gradesPath(YEAR))) ?? "{}").entries).toHaveLength(1);
    expect(JSON.parse((await storage.readText(unitsPath(YEAR))) ?? "{}").units).toHaveLength(1);
    expect(await screen.findByText("entries:1")).toBeInTheDocument();
    expect(await screen.findByText("units:u1")).toBeInTheDocument();
  });

  it("serializes update, updateGrades and updateUnits", async () => {
    const storage = new MemoryStorage();
    const real = storage.writeTextAtomic.bind(storage);
    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(storage, "writeTextAtomic").mockImplementation(async (p, t) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      await real(p, t);
      inFlight--;
    });
    renderGU(storage);
    fireEvent.click(await screen.findByRole("button", { name: "all" }));
    expect(await Promise.all(results)).toEqual([true, true, true]);
    expect(maxInFlight).toBe(1);
  });

  it("returns false, shows the banner and reverts to disk when saving fails", async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk gone"));
    renderGU(storage);
    fireEvent.click(await screen.findByRole("button", { name: "add-grade" }));
    expect(await screen.findByText("No se pudo guardar. Revisa que la carpeta siga disponible.")).toBeInTheDocument();
    expect(await results[0]).toBe(false);
    expect(screen.getByText("entries:0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "add-unit" }));
    expect(await results[1]).toBe(false);
    expect(screen.getByText("units:")).toBeInTheDocument();
  });

  it("year-guarded updates write nothing when another year is loaded", async () => {
    const storage = new MemoryStorage();
    renderGU(storage);
    await screen.findByText(`year:${YEAR}`);
    fireEvent.click(screen.getByRole("button", { name: "prev" }));
    await screen.findByText(`year:${YEAR - 1}`);
    const write = vi.spyOn(storage, "writeTextAtomic");
    fireEvent.click(screen.getByRole("button", { name: "grade-current" }));
    fireEvent.click(screen.getByRole("button", { name: "unit-current" }));
    expect(await Promise.all(results)).toEqual([false, false]);
    expect(write).not.toHaveBeenCalled();
  });

  it("setYear loads the grades and units of that year", async () => {
    const storage = new MemoryStorage();
    await storage.writeTextAtomic(gradesPath(YEAR - 1), gradesJson(YEAR - 1));
    await storage.writeTextAtomic(unitsPath(YEAR - 1), unitsJson(YEAR - 1, ["old"]));
    renderGU(storage);
    await screen.findByText(`year:${YEAR}`);
    expect(screen.getByText("entries:0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "prev" }));
    expect(await screen.findByText("units:old")).toBeInTheDocument();
    expect(screen.getByText("entries:1")).toBeInTheDocument();
  });

  it.each([
    ["notas.json", gradesPath],
    ["unidades.json", unitsPath],
  ])("shows the data error and writes nothing when %s is corrupt", async (_n, path) => {
    const storage = new MemoryStorage();
    await storage.writeTextAtomic(path(YEAR), "{no json");
    const write = vi.spyOn(storage, "writeTextAtomic");
    renderGU(storage);
    expect(
      await screen.findByText("No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada."),
    ).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("attendance and agenda", () => {
  const mkEvent = (id: string) => ({
    id,
    date: "2026-05-20",
    title: "t",
    type: "Reunión" as const,
    note: "",
    createdAt: "",
    updatedAt: "",
  });
  const day = { date: "2026-05-18", classroomId: "c1", marks: { s1: "P" as const } };
  let results: Promise<boolean>[] = [];

  function AAProbe() {
    const ws = useWorkspace();
    return (
      <div>
        <p>year:{ws.year}</p>
        <p>days:{ws.attendance.days.length}</p>
        <p>events:{ws.agenda.events.map((e) => e.id).join(",")}</p>
        <button onClick={() => results.push(ws.updateAttendance((f) => ({ ...f, days: [...f.days, day] })))}>add-day</button>
        <button onClick={() => results.push(ws.updateAgenda((f) => ({ ...f, events: [...f.events, mkEvent("e1")] })))}>add-event</button>
        <button
          onClick={() => {
            results.push(ws.update((d) => ({ ...d, classrooms: [...d.classrooms, mkRoom("a")] })));
            results.push(ws.updateAttendance((f) => ({ ...f, days: [...f.days, day] })));
            results.push(ws.updateAgenda((f) => ({ ...f, events: [...f.events, mkEvent("e2")] })));
          }}
        >
          all
        </button>
        <button onClick={() => results.push(ws.updateAttendance((f) => ({ ...f, days: [...f.days, day] }), { year: YEAR }))}>
          day-current
        </button>
        <button onClick={() => results.push(ws.updateAgenda((f) => ({ ...f, events: [...f.events, mkEvent("g")] }), { year: YEAR }))}>
          event-current
        </button>
        <button onClick={() => void ws.setYear(YEAR - 1)}>prev</button>
      </div>
    );
  }
  function renderAA(storage: Storage) {
    results = [];
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    render(
      <WorkspaceProvider userId="u1">
        <AAProbe />
      </WorkspaceProvider>,
    );
  }

  it("saves to their own files", async () => {
    const storage = new MemoryStorage();
    renderAA(storage);
    fireEvent.click(await screen.findByRole("button", { name: "add-day" }));
    fireEvent.click(screen.getByRole("button", { name: "add-event" }));
    expect(await Promise.all(results)).toEqual([true, true]);
    expect(JSON.parse((await storage.readText(attendancePath(YEAR))) ?? "{}").days).toHaveLength(1);
    expect(JSON.parse((await storage.readText(agendaPath(YEAR))) ?? "{}").events).toHaveLength(1);
    expect(await screen.findByText("days:1")).toBeInTheDocument();
    expect(await screen.findByText("events:e1")).toBeInTheDocument();
  });

  it("serializes with update through the queue", async () => {
    const storage = new MemoryStorage();
    const real = storage.writeTextAtomic.bind(storage);
    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(storage, "writeTextAtomic").mockImplementation(async (p, t) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      await real(p, t);
      inFlight--;
    });
    renderAA(storage);
    fireEvent.click(await screen.findByRole("button", { name: "all" }));
    expect(await Promise.all(results)).toEqual([true, true, true]);
    expect(maxInFlight).toBe(1);
  });

  it("year-guarded updates write nothing when another year is loaded", async () => {
    const storage = new MemoryStorage();
    renderAA(storage);
    await screen.findByText(`year:${YEAR}`);
    fireEvent.click(screen.getByRole("button", { name: "prev" }));
    await screen.findByText(`year:${YEAR - 1}`);
    const write = vi.spyOn(storage, "writeTextAtomic");
    fireEvent.click(screen.getByRole("button", { name: "day-current" }));
    fireEvent.click(screen.getByRole("button", { name: "event-current" }));
    expect(await Promise.all(results)).toEqual([false, false]);
    expect(write).not.toHaveBeenCalled();
  });

  it("setYear loads the attendance and agenda of that year", async () => {
    const storage = new MemoryStorage();
    await storage.writeTextAtomic(attendancePath(YEAR - 1), JSON.stringify({ version: 1, schoolYear: YEAR - 1, days: [day] }));
    await storage.writeTextAtomic(agendaPath(YEAR - 1), JSON.stringify({ version: 1, schoolYear: YEAR - 1, events: [mkEvent("old")] }));
    renderAA(storage);
    await screen.findByText(`year:${YEAR}`);
    fireEvent.click(screen.getByRole("button", { name: "prev" }));
    expect(await screen.findByText("events:old")).toBeInTheDocument();
    expect(screen.getByText("days:1")).toBeInTheDocument();
  });

  it.each([
    ["asistencia.json", attendancePath],
    ["agenda.json", agendaPath],
  ])("shows the data error and writes nothing when %s is corrupt", async (_n, path) => {
    const storage = new MemoryStorage();
    await storage.writeTextAtomic(path(YEAR), "{no json");
    const write = vi.spyOn(storage, "writeTextAtomic");
    renderAA(storage);
    expect(
      await screen.findByText("No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada."),
    ).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("WorkspaceProvider backups", () => {
  const stamp = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n: number) => stamp(new Date(Date.now() - n * 86_400_000));
  const seedBackup = (s: MemoryStorage, daysOld: number) =>
    s.writeFile(`Respaldos/respaldo-${daysAgo(daysOld)}-1200.zip`, new Blob(["x"]));
  const profileJson = JSON.stringify({ version: 1, firstNames: "A", lastNames: "B", phone: "", region: "", address: "", email: "", level: "Inicial", ugel: "", institution: "" });
  const seedData = (s: MemoryStorage) => s.writeTextAtomic("datos/perfil.json", profileJson);
  const autos = async (s: MemoryStorage) => (await s.list("Respaldos")).filter((e) => e.name.endsWith("-auto.zip"));

  function BackupProbe() {
    const ws = useWorkspace();
    return (
      <div>
        <p>warning:{String(ws.backupWarning)}</p>
        <p>busy:{String(ws.backupBusy)}</p>
        <button onClick={() => void ws.restoreBackupFile(new Blob(["z"]), true).catch(() => undefined)}>restore</button>
        <button onClick={() => void ws.update((d) => ({ ...d, classrooms: [mkRoom("a")] }))}>write</button>
      </div>
    );
  }
  const renderBackup = (storage: MemoryStorage) => {
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    return render(
      <WorkspaceProvider userId="u1">
        <BackupProbe />
      </WorkspaceProvider>,
    );
  };

  beforeEach(() => {
    restoreMock.restoreBackup.mockReset();
  });

  it("runs one automatic backup on open when the last one is older than 7 days", async () => {
    const storage = new MemoryStorage();
    await seedData(storage);
    await seedBackup(storage, 8);
    renderBackup(storage);
    await waitFor(async () => expect(await autos(storage)).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("warning:false")).toBeInTheDocument());
  });

  it("runs an automatic backup when there is data and never was a backup", async () => {
    const storage = new MemoryStorage();
    await seedData(storage);
    renderBackup(storage);
    await waitFor(async () => expect(await autos(storage)).toHaveLength(1));
  });

  it("does not run an automatic backup when the last one is recent or there is no data", async () => {
    const recent = new MemoryStorage();
    await seedData(recent);
    await seedBackup(recent, 3);
    const empty = new MemoryStorage();
    for (const s of [recent, empty]) {
      const { unmount } = renderBackup(s);
      await screen.findByText(/warning:/);
      await new Promise((r) => setTimeout(r, 50));
      expect(await autos(s)).toHaveLength(0);
      unmount();
    }
  });

  it("does not warn when the last backup is 10 days old", async () => {
    const storage = new MemoryStorage();
    await seedBackup(storage, 10);
    renderBackup(storage);
    await screen.findByText(/warning:/);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("warning:false")).toBeInTheDocument();
  });

  it("records an automatic backup failure without throwing into the UI", async () => {
    const storage = new MemoryStorage();
    await seedData(storage);
    await storage.writeFile("datos/CON.json", new Blob(["x"])); // unrestorable name -> preflight fails
    renderBackup(storage);
    expect(await screen.findByText(/warning:/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("warning:true")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restore waits for pending writes, blocks the queue and reloads afterwards", async () => {
    const storage = new MemoryStorage();
    const log: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const original = storage.writeTextAtomic.bind(storage);
    vi.spyOn(storage, "writeTextAtomic").mockImplementation(async (p, t) => {
      if (p.endsWith("anio.json")) {
        log.push("write-start");
        await gate;
        log.push("write-end");
      }
      return original(p, t);
    });
    restoreMock.restoreBackup.mockImplementation(async () => {
      log.push("restore");
      await original("datos/perfil.json", profileJson);
    });
    renderBackup(storage);
    fireEvent.click(await screen.findByRole("button", { name: "write" }));
    fireEvent.click(screen.getByRole("button", { name: "restore" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(log).toEqual(["write-start"]);
    release();
    await waitFor(() => expect(log).toEqual(["write-start", "write-end", "restore"]));
    await waitFor(() => expect(screen.getByText("busy:null")).toBeInTheDocument());
    expect(restoreMock.restoreBackup).toHaveBeenCalledWith(storage, expect.any(Blob), { replace: true });
    expect(await screen.findByText("warning:true")).toBeInTheDocument(); // reloaded: probe still mounted, no backup yet
  });

  it("ignores a second restore while one is running", async () => {
    const storage = new MemoryStorage();
    let release: () => void = () => undefined;
    restoreMock.restoreBackup.mockImplementation(() => new Promise<void>((r) => (release = r)));
    renderBackup(storage);
    const btn = await screen.findByRole("button", { name: "restore" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(restoreMock.restoreBackup).toHaveBeenCalled());
    expect(screen.getByText("busy:restore")).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.getByText("busy:null")).toBeInTheDocument());
    expect(restoreMock.restoreBackup).toHaveBeenCalledTimes(1);
  });
});
