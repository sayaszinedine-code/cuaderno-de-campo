import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { notesPath, noteDir, yearDataPath } from "@/domain/paths";
import { addStudent, createClassroom, updateClassroom } from "@/domain/classrooms";
import { newNote } from "@/domain/notes";
import { getPerformances } from "@/curriculum";
import { SCHEMA_VERSION, type FieldNote, type NotesFile, type YearData } from "@/domain/schema";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ refresh: vi.fn(), profile: { id: "u1" } }),
}));
const compress = vi.hoisted(() => ({ compressPhoto: vi.fn() }));
vi.mock("@/domain/photo", async (orig) => ({ ...(await orig<typeof import("@/domain/photo")>()), ...compress }));

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import RegistroPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;
let data: YearData;

function build(fn?: (d: YearData) => YearData): YearData {
  let d: YearData = {
    version: SCHEMA_VERSION,
    schoolYear: year,
    periods: [
      { id: "B1", name: "I Bimestre", start: `${year}-03-09`, end: `${year}-05-08` },
      { id: "B2", name: "II Bimestre", start: `${year}-05-18`, end: `${year}-07-24` },
      { id: "B3", name: "III Bimestre", start: `${year}-08-10`, end: `${year}-10-09` },
      { id: "B4", name: "IV Bimestre", start: `${year}-10-19`, end: `${year}-12-19` },
    ],
    classrooms: [],
    students: [],
  };
  d = createClassroom(d, { name: "Girasoles", cycle: "II", bands: ["4y"] }, () => "c1");
  d = addStudent(d, { classroomId: "c1", firstNames: "Luz", lastNames: "Paz" }, () => "s1");
  d = addStudent(d, { classroomId: "c1", firstNames: "Ana", lastNames: "Rojas" }, () => "s2");
  return fn ? fn(d) : d;
}

async function seed(opts: { notes?: FieldNote[]; data?: YearData } = {}) {
  data = opts.data ?? build();
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  const file: NotesFile = { version: SCHEMA_VERSION, schoolYear: year, notes: opts.notes ?? [] };
  await storage.writeTextAtomic(notesPath(year), JSON.stringify(file));
}
const savedNotes = async (): Promise<FieldNote[]> =>
  (JSON.parse((await storage.readText(notesPath(year))) ?? "{}") as NotesFile).notes;

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  push.mockReset();
  compress.compressPhoto.mockReset();
  compress.compressPhoto.mockImplementation(async (f: Blob) => f);
  window.history.pushState({}, "", "/cuaderno/registro/");
  window.localStorage.clear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});

const renderPage = () =>
  render(
    <WorkspaceProvider userId="u1">
      <RegistroPage />
    </WorkspaceProvider>,
  );

const existing = (over: Partial<FieldNote> = {}): FieldNote => ({
  ...newNote({ classroomId: "c1", date: `${year}-06-10` }, () => "n1"),
  studentIds: ["s1"],
  evidenceText: "Armó una torre",
  ...over,
});

async function fillBasics() {
  fireEvent.click(await screen.findByRole("button", { name: "Luz Paz" }));
  fireEvent.change(screen.getByLabelText("¿Qué hizo o dijo? Describe los hechos"), { target: { value: "Dijo «yo solita»" } });
}

describe("Registro page", () => {
  it("creates a complete note with copied desempeño text", async () => {
    await seed();
    renderPage();
    await fillBasics();
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "comunicacion" } });
    fireEvent.change(screen.getByLabelText("Competencia"), { target: { value: "comunica-oralmente" } });
    const perf = getPerformances("comunica-oralmente", "4y")[0];
    fireEvent.click(await screen.findByRole("checkbox", { name: new RegExp(perf.text.slice(0, 20)) }));
    fireEvent.change(screen.getByLabelText("Interpretación en relación al desempeño"), { target: { value: "Logra" } });
    fireEvent.change(screen.getByLabelText("Reflexión docente en relación a la actividad"), { target: { value: "Repetir" } });
    fireEvent.change(screen.getByLabelText("Nivel de logro (opcional)"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Registro guardado.")).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    const [n] = await savedNotes();
    expect(n).toMatchObject({
      classroomId: "c1", studentIds: ["s1"], areaId: "comunicacion", competencyId: "comunica-oralmente",
      evidenceText: "Dijo «yo solita»", interpretation: "Logra", reflection: "Repetir", level: "A",
      performances: [{ competencyId: "comunica-oralmente", band: "4y", text: perf.text }],
    });
    expect(window.localStorage.getItem("notes-last:u1")).toContain("c1");
  });

  it("focuses the evidence textarea first", async () => {
    await seed();
    renderPage();
    const area = await screen.findByLabelText("¿Qué hizo o dijo? Describe los hechos");
    await waitFor(() => expect(area).toHaveFocus());
  });

  it("prefills moment from the last note", async () => {
    await seed();
    window.localStorage.setItem("notes-last:u1", JSON.stringify({ classroomId: "c1", moment: "Taller" }));
    renderPage();
    expect(await screen.findByLabelText("Momento de la jornada")).toHaveValue("Taller");
  });

  it("edits an existing note", async () => {
    await seed({ notes: [existing()] });
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    const area = await screen.findByLabelText("¿Qué hizo o dijo? Describe los hechos");
    expect(area).toHaveValue("Armó una torre");
    fireEvent.change(area, { target: { value: "Armó dos torres" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    const notes = await savedNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].evidenceText).toBe("Armó dos torres");
  });

  it("shows a validation error and does not save", async () => {
    await seed();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige al menos un niño o niña, o marca «Todo el grupo».");
    expect(await savedNotes()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("stays on the page with its data when saving fails", async () => {
    await seed();
    renderPage();
    await fillBasics();
    const real = storage.writeTextAtomic.bind(storage);
    vi.spyOn(storage, "writeTextAtomic").mockImplementation((p, t) =>
      p === notesPath(year) ? Promise.reject(new Error("disk")) : real(p, t),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(storage.writeTextAtomic).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText("Registro guardado.")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("¿Qué hizo o dijo? Describe los hechos")).toHaveValue("Dijo «yo solita»");
  });

  it("a photo that fails to write leaves no path; the next one reuses the free number", async () => {
    await seed();
    renderPage();
    await fillBasics();
    const real = storage.writeFile.bind(storage);
    vi.spyOn(storage, "writeFile").mockImplementationOnce(() => Promise.reject(new Error("disk"))).mockImplementation(real);
    const input = screen.getByLabelText("Agregar fotos");
    fireEvent.change(input, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText("No se pudo guardar una de las fotos.")).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["b"], "b.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Quitar foto/ })).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const [n] = await savedNotes();
    expect(n.evidence).toHaveLength(1);
    expect(n.evidence[0]).toMatch(/evidencia-1\.jpg$/);
    expect(await storage.readFile(n.evidence[0])).not.toBeNull();
  });

  it("deletes the files of cancelled new notes", async () => {
    await seed();
    renderPage();
    fireEvent.change(await screen.findByLabelText("Agregar fotos"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Quitar foto/ })).toHaveLength(1));
    const remove = vi.spyOn(storage, "remove");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/cuaderno/");
  });

  it("removed photos are deleted from disk only after a successful save", async () => {
    const dir = noteDir(year, data?.classrooms?.[0] ?? build().classrooms[0], { id: "n1", date: `${year}-06-10` });
    await seed({ notes: [existing({ evidence: [`${dir}evidencia-1.jpg`] })] });
    await storage.writeFile(`${dir}evidencia-1.jpg`, new Blob(["x"]));
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Quitar foto/ }));
    expect(await storage.readFile(`${dir}evidencia-1.jpg`)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(await storage.readFile(`${dir}evidencia-1.jpg`)).toBeNull();
    expect((await savedNotes())[0].evidence).toEqual([]);
  });

  it("deletes the note and removes each photo", async () => {
    const dir = noteDir(year, build().classrooms[0], { id: "n1", date: `${year}-06-10` });
    const paths = [`${dir}evidencia-1.jpg`, `${dir}evidencia-2.jpg`];
    await seed({ notes: [existing({ evidence: paths })] });
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    const remove = vi.spyOn(storage, "remove").mockRejectedValue(new Error("gone"));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar registro" }));
    expect(screen.getByText("¿Eliminar este registro y sus fotos? No se puede deshacer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(await savedNotes()).toHaveLength(0);
  });

  it("hides the level for descriptive cycle I", async () => {
    const d = build((x) => {
      let y = createClassroom({ ...x, classrooms: [] }, { name: "Gateadores", cycle: "I", bands: ["18m"] }, () => "c1");
      y = addStudent(y, { classroomId: "c1", firstNames: "Luz", lastNames: "Paz" }, () => "s1");
      return y;
    });
    await seed({ data: d });
    renderPage();
    await screen.findByLabelText("Interpretación en relación al desempeño");
    expect(screen.queryByLabelText("Nivel de logro (opcional)")).toBeNull();
  });

  it("shows the level for scale cycle I", async () => {
    const d = build((x) => {
      let y = createClassroom({ ...x, classrooms: [] }, { name: "Gateadores", cycle: "I", bands: ["18m"] }, () => "c1");
      y = updateClassroom(y, "c1", { cycleIGrading: "scale" });
      return y;
    });
    await seed({ data: d });
    renderPage();
    expect(await screen.findByLabelText("Nivel de logro (opcional)")).toBeInTheDocument();
  });

  it("the reference-age select changes the desempeño list", async () => {
    const d = build((x) => ({ ...x, classrooms: x.classrooms.map((c) => ({ ...c, bands: ["4y", "5y"] })) }));
    await seed({ data: d });
    renderPage();
    await fillBasics();
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "comunicacion" } });
    fireEvent.change(screen.getByLabelText("Competencia"), { target: { value: "comunica-oralmente" } });
    const four = getPerformances("comunica-oralmente", "4y")[0];
    const five = getPerformances("comunica-oralmente", "5y")[0];
    expect(await screen.findByRole("checkbox", { name: new RegExp(four.text.slice(0, 20)) })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Edad de referencia"), { target: { value: "5y" } });
    expect(await screen.findByRole("checkbox", { name: new RegExp(five.text.slice(0, 20)) })).toBeInTheDocument();
  });

  it("shows a message for an unknown id", async () => {
    await seed();
    window.history.pushState({}, "", "/cuaderno/registro/?id=zzz");
    renderPage();
    expect(await screen.findByText("No encontramos ese registro.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver al cuaderno/ })).toHaveAttribute("href", "/cuaderno");
  });
});
