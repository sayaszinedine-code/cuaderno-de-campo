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
const ai = vi.hoisted(() => ({ generateWithSettings: vi.fn() }));
vi.mock("@/ai", () => ai);

import { useWorkspace, WorkspaceProvider } from "@/workspace/WorkspaceProvider";
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
  ai.generateWithSettings.mockReset();
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

  it("same-day notes sharing a photo folder never overwrite or delete each other's photos", async () => {
    const c = build().classrooms[0];
    const date = `${year}-06-10`;
    const a = existing({ id: "abcd1234-aaaa", date });
    const b = existing({ id: "abcd1234-bbbb", date, evidenceText: "Pintó" });
    const dir = noteDir(year, c, a);
    expect(noteDir(year, c, b)).toBe(dir);
    const aPhoto = `${dir}evidencia-1.jpg`;
    await seed({ notes: [{ ...a, evidence: [aPhoto] }, b] });
    await storage.writeFile(aPhoto, new Blob(["A"]));
    window.history.pushState({}, "", `/cuaderno/registro/?id=${b.id}`);
    const { unmount } = renderPage();
    fireEvent.change(await screen.findByLabelText("Agregar fotos"), {
      target: { files: [new File(["B"], "b.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Quitar foto/ })).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    const savedB = (await savedNotes()).find((n) => n.id === b.id) as FieldNote;
    expect(savedB.evidence).toHaveLength(1);
    expect(savedB.evidence[0]).not.toBe(aPhoto);
    expect(await (await storage.readFile(aPhoto))?.text()).toBe("A");
    unmount();
    push.mockReset();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar registro" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    expect(await storage.readFile(savedB.evidence[0])).toBeNull();
    expect(await (await storage.readFile(aPhoto))?.text()).toBe("A");
    expect((await savedNotes()).map((n) => n.id)).toEqual([a.id]);
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

  it("selects a transversal competency and saves areaId transversal", async () => {
    const d = build((x) => ({ ...x, classrooms: x.classrooms.map((c) => ({ ...c, bands: ["5y"] })) }));
    await seed({ data: d });
    renderPage();
    await fillBasics();
    fireEvent.change(screen.getByLabelText("Área"), { target: { value: "transversal" } });
    fireEvent.change(screen.getByLabelText("Competencia"), { target: { value: "tic" } });
    const perf = getPerformances("tic", "5y")[0];
    fireEvent.click(await screen.findByRole("checkbox", { name: new RegExp(perf.text.slice(0, 20)) }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await savedNotes())[0]).toMatchObject({ areaId: "transversal", competencyId: "tic" });
  });

  it("keeps an archived student as a removable chip and saves", async () => {
    const d = build((x) => ({ ...x, students: x.students.map((s) => (s.id === "s1" ? { ...s, active: false } : s)) }));
    await seed({ data: d, notes: [existing()] });
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    const chip = await screen.findByRole("button", { name: "Luz Paz (archivado)" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    expect((await savedNotes())[0].studentIds).toEqual(["s1"]);
  });

  it("blocks Guardar, Cancelar and Eliminar while a photo is being written", async () => {
    await seed({ notes: [] });
    renderPage();
    await fillBasics();
    let release: () => void = () => undefined;
    const real = storage.writeFile.bind(storage);
    vi.spyOn(storage, "writeFile").mockImplementationOnce(
      (p, b) => new Promise<void>((res) => { release = () => void real(p, b).then(res); }),
    );
    fireEvent.change(screen.getByLabelText("Agregar fotos"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Guardando fotos…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await savedNotes())[0].evidence).toHaveLength(1);
  });

  it("does not reuse a photo name until its removal has settled", async () => {
    await seed();
    renderPage();
    await fillBasics();
    const input = screen.getByLabelText("Agregar fotos");
    const pick1 = () => fireEvent.change(input, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] } });
    pick1();
    fireEvent.click(await screen.findByRole("button", { name: /Quitar foto/ }));
    let finish: () => void = () => undefined;
    const real = storage.remove.bind(storage);
    vi.spyOn(storage, "remove").mockImplementationOnce((p) => new Promise<void>((r) => { finish = () => void real(p).then(r); }));
    // removal above already fired before the spy; redo with a fresh photo
    pick1();
    const q = await screen.findByRole("button", { name: /Quitar foto/ });
    fireEvent.click(q);
    pick1();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Quitar foto/ })).toHaveLength(1));
    finish();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const [n] = await savedNotes();
    expect(n.evidence).toHaveLength(1);
    expect(await storage.readFile(n.evidence[0])).not.toBeNull();
  });

  it("the back link cleans up session photos like Cancelar", async () => {
    await seed();
    renderPage();
    fireEvent.change(await screen.findByLabelText("Agregar fotos"), {
      target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Quitar foto/ })).toHaveLength(1));
    const remove = vi.spyOn(storage, "remove");
    fireEvent.click(screen.getByRole("link", { name: "Volver al cuaderno" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/cuaderno/");
  });

  it("shows the AI actions only when the assistant is enabled with consent", async () => {
    await seed();
    const { unmount } = renderPage();
    await screen.findByLabelText("Área");
    expect(screen.queryByRole("button", { name: "Redactar de forma objetiva" })).toBeNull();
    unmount();
    window.localStorage.setItem(
      "ai-settings:u1",
      JSON.stringify({ enabled: true, provider: "deepseek", apiKey: "k", consentAt: "2026-01-01T00:00:00Z" }),
    );
    renderPage();
    expect(await screen.findByRole("button", { name: "Redactar de forma objetiva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sugerir competencia y desempeños" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redactar interpretación" })).toBeInTheDocument();
  });

  it("anonymizes every student of the year, including other classrooms and archived ones", async () => {
    const d = build((x) => {
      let y = createClassroom(x, { name: "Tulipanes", cycle: "II", bands: ["5y"] }, () => "c2");
      y = addStudent(y, { classroomId: "c2", firstNames: "Pedro", lastNames: "Mamani" }, () => "s3");
      y = addStudent(y, { classroomId: "c2", firstNames: "Rosa", lastNames: "Ccori" }, () => "s4");
      return { ...y, students: y.students.map((s) => (s.id === "s4" ? { ...s, active: false } : s)) };
    });
    await seed({ data: d });
    window.localStorage.setItem(
      "ai-settings:u1",
      JSON.stringify({ enabled: true, provider: "deepseek", apiKeys: { deepseek: "k" }, consentAt: "2026-01-01T00:00:00Z" }),
    );
    ai.generateWithSettings.mockResolvedValue("Texto");
    renderPage();
    fireEvent.change(await screen.findByLabelText("¿Qué hizo o dijo? Describe los hechos"), {
      target: { value: "Luz jugó con Pedro Mamani y con Rosa." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Redactar de forma objetiva" }));
    await waitFor(() => expect(ai.generateWithSettings).toHaveBeenCalled());
    const sent = JSON.stringify(ai.generateWithSettings.mock.calls[0][1]);
    expect(sent).not.toMatch(/Luz|Pedro|Mamani|Rosa/);
  });

  it("does not save into another year when the year changes while the form is open", async () => {
    await seed();
    const prev = { ...build(), schoolYear: year - 1 };
    await storage.writeTextAtomic(yearDataPath(year - 1), JSON.stringify(prev));
    const prevNotes = JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year - 1, notes: [] });
    await storage.writeTextAtomic(notesPath(year - 1), prevNotes);
    function YearSwitch() {
      const ws = useWorkspace();
      return (
        <button type="button" onClick={() => void ws.setYear(year - 1)}>
          {`año ${ws.year}`}
        </button>
      );
    }
    render(
      <WorkspaceProvider userId="u1">
        <YearSwitch />
        <RegistroPage />
      </WorkspaceProvider>,
    );
    await fillBasics();
    fireEvent.click(screen.getByRole("button", { name: `año ${year}` }));
    await screen.findByRole("button", { name: `año ${year - 1}` });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("El año escolar cambió mientras editabas. Vuelve al cuaderno y abre el registro de nuevo."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(await storage.readText(notesPath(year - 1))).toBe(prevNotes);
    expect(await savedNotes()).toHaveLength(0);
  });

  it("a deselected archived child stays as a chip and can be re-added", async () => {
    const d = build((x) => ({ ...x, students: x.students.map((s) => (s.id === "s1" ? { ...s, active: false } : s)) }));
    await seed({ data: d, notes: [existing({ studentIds: ["s1", "s2"] })] });
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    const chip = await screen.findByRole("button", { name: "Luz Paz (archivado)" });
    fireEvent.click(chip);
    expect(screen.getByRole("button", { name: "Luz Paz (archivado)" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Luz Paz (archivado)" }));
    expect(screen.getByRole("button", { name: "Luz Paz (archivado)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    expect((await savedNotes())[0].studentIds).toEqual(["s2", "s1"]);
  });

  it("«Sí, eliminar» runs once and is disabled while deleting", async () => {
    await seed({ notes: [existing()] });
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar registro" }));
    const real = storage.writeTextAtomic.bind(storage);
    let release: () => void = () => undefined;
    const write = vi.spyOn(storage, "writeTextAtomic").mockImplementation(
      (p, t) => new Promise<void>((res) => { release = () => void real(p, t).then(res); }),
    );
    const yes = screen.getByRole("button", { name: "Sí, eliminar" });
    fireEvent.click(yes);
    fireEvent.click(yes);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Sí, eliminar" })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuaderno/"));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("«Quitar foto» is disabled while a photo is being written", async () => {
    await seed();
    renderPage();
    await fillBasics();
    const input = screen.getByLabelText("Agregar fotos");
    fireEvent.change(input, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] } });
    const remove = await screen.findByRole("button", { name: /Quitar foto/ });
    expect(remove).toBeEnabled();
    let release: () => void = () => undefined;
    const real = storage.writeFile.bind(storage);
    vi.spyOn(storage, "writeFile").mockImplementationOnce(
      (p, b) => new Promise<void>((res) => { release = () => void real(p, b).then(res); }),
    );
    fireEvent.change(input, { target: { files: [new File(["b"], "b.jpg", { type: "image/jpeg" })] } });
    await screen.findByText("Guardando fotos…");
    expect(screen.getByRole("button", { name: "Quitar foto 1" })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "Quitar foto 1" })).toBeEnabled());
  });
});
