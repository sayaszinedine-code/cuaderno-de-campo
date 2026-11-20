import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { addStudent, createClassroom } from "@/domain/classrooms";
import { notesPath, sessionDir, unitsPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type FieldNote, type NotesFile, type Session, type Unit, type UnitsFile, type YearData } from "@/domain/schema";

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

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import RegistroPage from "../../cuaderno/registro/page";
import SesionPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;
let data: YearData;
const stamp = "2026-01-01T00:00:00.000Z";

function build(): YearData {
  let d: YearData = {
    version: SCHEMA_VERSION,
    schoolYear: year,
    periods: [
      { id: "B1", name: "I Bimestre", start: `${year}-01-01`, end: `${year}-03-31` },
      { id: "B2", name: "II Bimestre", start: `${year}-04-01`, end: `${year}-06-30` },
      { id: "B3", name: "III Bimestre", start: `${year}-07-01`, end: `${year}-09-30` },
      { id: "B4", name: "IV Bimestre", start: `${year}-10-01`, end: `${year}-12-31` },
    ],
    classrooms: [],
    students: [],
  };
  d = createClassroom(d, { name: "Girasoles", cycle: "II", bands: ["4y"] }, () => "c1");
  d = addStudent(d, { classroomId: "c1", firstNames: "Luz", lastNames: "Paz" }, () => "s1");
  return d;
}
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: "u-1234567890", classroomId: "c1", periodId: "B1", kind: "unidad", title: "Mi unidad", purpose: "",
  competencyIds: ["comunica-oralmente"], performances: [], description: "", attachments: [], createdAt: stamp, updatedAt: stamp, ...over,
});
const session = (over: Partial<Session> = {}): Session => ({
  id: "s-1234567890", unitId: "u-1234567890", date: `${year}-02-10`, title: "Sesión 1", purpose: "", competencyIds: [],
  performances: [], description: "", attachments: [], noteIds: [], createdAt: stamp, updatedAt: stamp, ...over,
});
const note = (id: string, date: string, text: string): FieldNote => ({
  id, date, classroomId: "c1", studentIds: ["s1"], wholeGroup: false, moment: "Taller", kind: "obs", performances: [],
  evidenceText: text, evidence: [], interpretation: "", reflection: "", createdAt: stamp, updatedAt: stamp,
});

async function seed(sessions: Session[] = [], notes: FieldNote[] = []) {
  data = build();
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  const f: UnitsFile = { version: SCHEMA_VERSION, schoolYear: year, units: [unit()], sessions };
  await storage.writeTextAtomic(unitsPath(year), JSON.stringify(f));
  const n: NotesFile = { version: SCHEMA_VERSION, schoolYear: year, notes };
  await storage.writeTextAtomic(notesPath(year), JSON.stringify(n));
}
const saved = async (): Promise<UnitsFile> => JSON.parse((await storage.readText(unitsPath(year))) ?? "{}");
const pdf = (name = "plan.pdf") => new File(["hola"], name, { type: "application/pdf" });
const today = () => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  push.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderForm = (search: string) => {
  window.history.pushState({}, "", `/unidades/sesion/${search}`);
  return render(<WorkspaceProvider userId="u1"><SesionPage /></WorkspaceProvider>);
};

describe("Sesión form", () => {
  it("validates title and date", async () => {
    await seed();
    renderForm("?unidad=u-1234567890");
    await screen.findByRole("heading", { name: "Nueva sesión" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe un título.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "S" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige la fecha de la sesión.");
    expect((await saved()).sessions).toHaveLength(0);
  });

  it("defaults competencies to the unit's and saves attachment and links", async () => {
    await seed([], [note("n1", today(), "Armó una torre")]);
    renderForm("?unidad=u-1234567890");
    await screen.findByRole("heading", { name: "Nueva sesión" });
    expect(screen.getByLabelText("Se comunica oralmente en su lengua materna")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Cuentos" } });
    fireEvent.change(screen.getByLabelText("Agregar archivos"), { target: { files: [pdf()] } });
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Armó una torre/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/unidades/unidad/?id=u-1234567890"));
    const [s] = (await saved()).sessions;
    expect(s).toMatchObject({ title: "Cuentos", unitId: "u-1234567890", competencyIds: ["comunica-oralmente"], noteIds: ["n1"] });
    expect(s.attachments).toHaveLength(1);
    expect(s.attachments[0].path).toBe(`${sessionDir(year, data.classrooms[0], unit(), s)}plan.pdf`);
    expect(await storage.readFile(s.attachments[0].path)).not.toBeNull();
  });

  it("lists only notes within ±7 days, plus selected ones outside it", async () => {
    const s = session({ noteIds: ["far"] });
    await seed([s], [
      note("in", `${year}-02-04`, "Dentro"),
      note("out", `${year}-02-20`, "Fuera"),
      note("far", `${year}-06-01`, "Vinculado lejano"),
    ]);
    renderForm(`?id=${s.id}`);
    await screen.findByRole("heading", { name: "Editar sesión" });
    expect(screen.getByRole("checkbox", { name: /Dentro/ })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Fuera/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Vinculado lejano/ })).toBeChecked();
  });

  it("ignores a deleted noteId and prunes it on save", async () => {
    const s = session({ noteIds: ["n1", "gone"] });
    await seed([s], [note("n1", `${year}-02-10`, "Vivo")]);
    renderForm(`?id=${s.id}`);
    expect(await screen.findByRole("checkbox", { name: /Vivo/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await saved()).sessions[0].noteIds).toEqual(["n1"]);
  });

  it("deletes the session and its files after confirming", async () => {
    const path = `${sessionDir(year, build().classrooms[0], unit(), session())}plan.pdf`;
    const s = session({ attachments: [{ name: "plan.pdf", path, size: 4, type: "", addedAt: stamp }] });
    await seed([s]);
    await storage.writeFile(path, new Blob(["hola"]));
    renderForm(`?id=${s.id}`);
    await screen.findByText("plan.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar sesión" }));
    expect(screen.getByText("Se eliminarán la sesión y 1 archivo. No se puede deshacer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await saved()).sessions).toEqual([]);
    expect(await storage.readFile(path)).toBeNull();
  });
});

describe("Registro con sesión vinculada", () => {
  it("shows each linking session with a link", async () => {
    await seed([session({ noteIds: ["n1"] }), session({ id: "s-2", title: "Sesión 2", noteIds: ["n1"] })], [note("n1", `${year}-02-10`, "Obs")]);
    window.history.pushState({}, "", "/cuaderno/registro/?id=n1");
    render(<WorkspaceProvider userId="u1"><RegistroPage /></WorkspaceProvider>);
    const link = await screen.findByRole("link", { name: `Sesión vinculada: Sesión 1 (${year}-02-10)` });
    expect(link).toHaveAttribute("href", expect.stringMatching(/\/unidades\/sesion\/?\?id=s-1234567890$/));
    expect(screen.getByRole("link", { name: `Sesión vinculada: Sesión 2 (${year}-02-10)` })).toBeInTheDocument();
  });
});
