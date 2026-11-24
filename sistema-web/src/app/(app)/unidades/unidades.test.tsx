import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { addStudent, createClassroom } from "@/domain/classrooms";
import { unitDir, unitsPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type Session, type Unit, type UnitsFile, type YearData } from "@/domain/schema";

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
import UnidadesPage from "./page";
import UnidadPage from "./unidad/page";

const year = new Date().getFullYear();
let storage: MemoryStorage;
let data: YearData;

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

const stamp = "2026-01-01T00:00:00.000Z";
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: "u-1234567890", classroomId: "c1", periodId: "B1", kind: "unidad", title: "Mi unidad", purpose: "", competencyIds: [],
  performances: [], description: "", attachments: [], createdAt: stamp, updatedAt: stamp, ...over,
});
const session = (over: Partial<Session> = {}): Session => ({
  id: "s-1", unitId: "u-1234567890", date: `${year}-02-01`, title: "Sesión 1", purpose: "", competencyIds: [],
  performances: [], description: "", attachments: [], noteIds: [], createdAt: stamp, updatedAt: stamp, ...over,
});

async function seed(units: Unit[] = [], sessions: Session[] = []) {
  data = build();
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  const f: UnitsFile = { version: SCHEMA_VERSION, schoolYear: year, units, sessions };
  await storage.writeTextAtomic(unitsPath(year), JSON.stringify(f));
}
const saved = async (): Promise<UnitsFile> => JSON.parse((await storage.readText(unitsPath(year))) ?? "{}");
const dirOf = (u: Unit) => unitDir(year, data.classrooms[0], u);
const pdf = (name = "plan.pdf") => new File(["hola"], name, { type: "application/pdf" });

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderList = (search = "") => {
  window.history.pushState({}, "", `/unidades/${search}`);
  return render(<WorkspaceProvider userId="u1"><UnidadesPage /></WorkspaceProvider>);
};
const renderForm = (search = "") => {
  window.history.pushState({}, "", `/unidades/unidad/${search}`);
  return render(<WorkspaceProvider userId="u1"><UnidadPage /></WorkspaceProvider>);
};
const addFiles = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Agregar archivos"), { target: { files } });

describe("Unidades list", () => {
  it("shows the empty state", async () => {
    await seed();
    renderList("?bim=B1");
    expect(await screen.findByText("Aún no hay unidades en este bimestre.")).toBeInTheDocument();
    await waitFor(() => {
      const links = screen.getAllByRole("link", { name: "Nueva unidad" });
      expect(links).toHaveLength(2);
      for (const l of links) expect(l).toHaveAttribute("href", expect.stringMatching(/\/unidades\/unidad\/?\?aula=c1&bim=B1/));
    });
  });

  it("renders cards with kind, dates, competencies, counts and link", async () => {
    await seed(
      [
        unit({
          start: `${year}-02-01`, end: `${year}-02-20`, competencyIds: ["comunica-oralmente"],
          attachments: [{ name: "a.pdf", path: "x/a.pdf", size: 1, type: "", addedAt: stamp }],
        }),
        unit({ id: "other", title: "Otro bimestre", periodId: "B2" }),
      ],
      [session({ attachments: [{ name: "b.pdf", path: "x/b.pdf", size: 1, type: "", addedAt: stamp }] })],
    );
    renderList("?bim=B1");
    expect(await screen.findByText("Mi unidad")).toBeInTheDocument();
    expect(screen.queryByText("Otro bimestre")).toBeNull();
    expect(screen.getByText("Unidad de aprendizaje")).toBeInTheDocument();
    expect(screen.getByText("1 sesión · 2 archivos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mi unidad/ })).toHaveAttribute("href", expect.stringMatching(/\/unidades\/unidad\/?\?id=u-1234567890$/));
  });
});

describe("Unidad form", () => {
  it("validates the title and the dates", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe un título.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mi unidad" } });
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: `${year}-03-10` } });
    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: `${year}-03-01` } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La fecha de inicio es posterior a la de fin.");
    expect((await saved()).units).toHaveLength(0);
  });

  it("creates a unit with an attachment and copies the file into unitDir", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mi unidad" } });
    fireEvent.click(screen.getByLabelText("Se comunica oralmente en su lengua materna"));
    addFiles(pdf());
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const [u] = (await saved()).units;
    expect(u.title).toBe("Mi unidad");
    expect(u.competencyIds).toEqual(["comunica-oralmente"]);
    expect(u.attachments).toHaveLength(1);
    expect(u.attachments[0].path).toBe(`${dirOf(u)}plan.pdf`);
    expect(await storage.readFile(u.attachments[0].path)).not.toBeNull();
  });

  it("rejects disallowed files without writing", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    addFiles(new File(["x"], "virus.exe"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese tipo de archivo no está permitido.");
    expect(screen.queryByText("virus.exe")).toBeNull();
  });

  it("removes an existing attachment only after saving", async () => {
    const u = unit();
    const path = `${dirOf(u)}plan.pdf`;
    u.attachments = [{ name: "plan.pdf", path, size: 4, type: "application/pdf", addedAt: stamp }];
    await seed([u]);
    await storage.writeFile(path, new Blob(["hola"]));
    renderForm(`?id=${u.id}`);
    await screen.findByText("plan.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Quitar plan.pdf" }));
    expect(screen.queryByText("plan.pdf")).toBeNull();
    expect(await storage.readFile(path)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(await storage.readFile(path)).toBeNull();
    expect((await saved()).units[0].attachments).toEqual([]);
  });

  it("keeps the removed file when the save fails", async () => {
    const u = unit();
    const path = `${dirOf(u)}plan.pdf`;
    u.attachments = [{ name: "plan.pdf", path, size: 4, type: "", addedAt: stamp }];
    await seed([u]);
    await storage.writeFile(path, new Blob(["hola"]));
    renderForm(`?id=${u.id}`);
    await screen.findByText("plan.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Quitar plan.pdf" }));
    const real = storage.writeTextAtomic.bind(storage);
    storage.writeTextAtomic = async (p, t) => {
      if (p === unitsPath(year)) throw new Error("disk");
      return real(p, t);
    };
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    expect(await storage.readFile(path)).not.toBeNull();
  });

  it("deletes session-added files on cancel", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    addFiles(pdf());
    await screen.findByText("plan.pdf");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled());
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await storage.list(d).catch(() => [])) {
        out.push(...(e.kind === "dir" ? await walk(`${d}${e.name}/`) : [`${d}${e.name}`]));
      }
      return out;
    };
    const leftovers = async () => (await walk(`${year}/`)).filter((f) => f.endsWith("plan.pdf"));
    expect(await leftovers()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(await leftovers()).toEqual([]);
  });

  it("blocks the buttons while a file is being written", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const real = storage.writeFile.bind(storage);
    storage.writeFile = async (p, b) => {
      await gate;
      return real(p, b);
    };
    addFiles(pdf());
    expect(await screen.findByText("Guardando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.queryByText("plan.pdf")).toBeNull();
    await act(async () => release());
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("numbers a duplicate attachment name", async () => {
    await seed();
    renderForm("?aula=c1&bim=B1");
    await screen.findByRole("heading", { name: "Nueva unidad" });
    addFiles(pdf("Plan.pdf"), pdf("plan.PDF"));
    expect(await screen.findByText("Plan.pdf")).toBeInTheDocument();
    expect(await screen.findByText("plan (2).PDF")).toBeInTheDocument();
  });

  it("deletes the unit, its sessions and files after confirming with counts", async () => {
    const u = unit();
    const p1 = `${dirOf(u)}a.pdf`;
    const p2 = "sesiones/b.pdf";
    u.attachments = [{ name: "a.pdf", path: p1, size: 1, type: "", addedAt: stamp }];
    await seed([u], [session({ attachments: [{ name: "b.pdf", path: p2, size: 1, type: "", addedAt: stamp }] }), session({ id: "s-2" })]);
    await storage.writeFile(p1, new Blob(["a"]));
    await storage.writeFile(p2, new Blob(["b"]));
    renderForm(`?id=${u.id}`);
    await screen.findByText("a.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar unidad" }));
    expect(screen.getByText("Se eliminarán la unidad, 2 sesiones y 2 archivos. No se puede deshacer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const f = await saved();
    expect(f.units).toEqual([]);
    expect(f.sessions).toEqual([]);
    expect(await storage.readFile(p1)).toBeNull();
    expect(await storage.readFile(p2)).toBeNull();
  });

  it("uses singular forms in the confirmation", async () => {
    await seed([unit()], [session()]);
    renderForm("?id=u-1234567890");
    await screen.findByDisplayValue("Mi unidad");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar unidad" }));
    expect(screen.getByText("Se eliminarán la unidad, 1 sesión y 0 archivos. No se puede deshacer.")).toBeInTheDocument();
  });

  it("does not confirm when the delete save fails and keeps the files", async () => {
    const u = unit();
    const p1 = `${dirOf(u)}a.pdf`;
    u.attachments = [{ name: "a.pdf", path: p1, size: 1, type: "", addedAt: stamp }];
    await seed([u]);
    await storage.writeFile(p1, new Blob(["a"]));
    renderForm(`?id=${u.id}`);
    await screen.findByText("a.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar unidad" }));
    storage.writeTextAtomic = async () => {
      throw new Error("disk");
    };
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sí, eliminar" })).toBeEnabled());
    expect(push).not.toHaveBeenCalled();
    expect(await storage.readFile(p1)).not.toBeNull();
    expect((await saved()).units).toHaveLength(1);
  });

  it("lists sessions and links a new one", async () => {
    await seed([unit()], [session()]);
    renderForm("?id=u-1234567890");
    await screen.findByDisplayValue("Mi unidad");
    expect(screen.getByRole("link", { name: /Sesión 1/ })).toHaveAttribute("href", expect.stringMatching(/\/unidades\/sesion\/?\?id=s-1$/));
    expect(screen.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute("href", expect.stringMatching(/\/unidades\/sesion\/?\?unidad=u-1234567890$/));
  });

  it("disables the session links while the unit has unsaved changes", async () => {
    await seed([unit()], [session()]);
    renderForm("?id=u-1234567890");
    await screen.findByDisplayValue("Mi unidad");
    expect(screen.queryByText("Guarda la unidad antes de abrir sesiones.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Otro título" } });
    expect(screen.getByText("Guarda la unidad antes de abrir sesiones.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sesión 1/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Nueva sesión" })).toBeNull();
    expect(screen.getByRole("button", { name: "Nueva sesión" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Mi unidad" } });
    expect(screen.getByRole("link", { name: /Sesión 1/ })).toBeInTheDocument();
  });

  it("disables the session links while a new attachment is pending", async () => {
    await seed([unit()], [session()]);
    renderForm("?id=u-1234567890");
    await screen.findByDisplayValue("Mi unidad");
    addFiles(pdf());
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(screen.getByText("Guarda la unidad antes de abrir sesiones.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nueva sesión" })).toBeNull();
  });

  it("«Abrir» creates and revokes an object URL", async () => {
    const u = unit();
    const path = `${dirOf(u)}plan.pdf`;
    u.attachments = [{ name: "plan.pdf", path, size: 4, type: "", addedAt: stamp }];
    await seed([u]);
    await storage.writeFile(path, new Blob(["hola"]));
    renderForm(`?id=${u.id}`);
    await screen.findByText("plan.pdf");
    const create = vi.fn(() => "blob:open");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Abrir plan.pdf" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:open"), { timeout: 3000 });
    vi.unstubAllGlobals();
  });
});
