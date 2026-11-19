import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { yearDataPath } from "@/domain/paths";
import { createClassroom, addStudent } from "@/domain/classrooms";
import { SCHEMA_VERSION, type YearData } from "@/domain/schema";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

const compress = vi.hoisted(() => ({ compressPhoto: vi.fn() }));
vi.mock("@/domain/photo", async (orig) => ({ ...(await orig<typeof import("@/domain/photo")>()), ...compress }));

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import AulasPage from "./page";
import NinosPage from "../ninos/page";
import FichaPage from "../ninos/ficha/page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

async function seed(fn: (d: YearData) => YearData) {
  const base: YearData = {
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
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(fn(base)));
}
const saved = async (): Promise<YearData> => JSON.parse((await storage.readText(yearDataPath(year))) ?? "{}");

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  compress.compressPhoto.mockReset();
  window.history.pushState({}, "", "/");
});

const renderIn = (ui: React.ReactElement) => render(<WorkspaceProvider>{ui}</WorkspaceProvider>);

describe("Aulas page", () => {
  it("creates Girasoles, ciclo II, 4 años", async () => {
    renderIn(<AulasPage />);
    fireEvent.change(await screen.findByLabelText("Nombre del aula"), { target: { value: "Girasoles" } });
    fireEvent.click(screen.getByLabelText("4 años"));
    fireEvent.click(screen.getByRole("button", { name: "Crear aula" }));
    expect(await screen.findByText("Aula Girasoles · Ciclo II · 4 años")).toBeInTheDocument();
    await waitFor(async () => expect((await saved()).classrooms[0]).toMatchObject({ name: "Girasoles", bands: ["4y"] }));
  });

  it("shows multiedad and a Spanish error when no age is chosen", async () => {
    renderIn(<AulasPage />);
    fireEvent.change(await screen.findByLabelText("Nombre del aula"), { target: { value: "Mixta" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear aula" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige al menos una edad.");
    fireEvent.click(screen.getByLabelText("3 años"));
    fireEvent.click(screen.getByLabelText("5 años"));
    fireEvent.click(screen.getByRole("button", { name: "Crear aula" }));
    expect(await screen.findByText("Aula Mixta · Ciclo II · multiedad")).toBeInTheDocument();
  });

  it("filters age checkboxes by cycle", async () => {
    renderIn(<AulasPage />);
    fireEvent.change(await screen.findByLabelText("Ciclo"), { target: { value: "I" } });
    expect(screen.getByLabelText("9 meses")).toBeInTheDocument();
    expect(screen.queryByLabelText("4 años")).toBeNull();
  });

  it("shows the period validation error in Spanish", async () => {
    renderIn(<AulasPage />);
    fireEvent.change(await screen.findByLabelText("Inicio del bimestre 2"), { target: { value: `${year}-05-01` } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar bimestres" }));
    expect(await screen.findByText("El bimestre 2 empieza antes de que termine el bimestre 1")).toBeInTheDocument();
  });

  it("applies back-to-back competency toggles to the latest data", async () => {
    await seed((d) => createClassroom(d, { name: "Sol", cycle: "II", bands: ["3y"] }, () => "c1"));
    renderIn(<AulasPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByLabelText(/Construye su identidad, como persona humana/));
    fireEvent.click(screen.getByLabelText(/Se comunica oralmente en castellano como segunda lengua/));
    await waitFor(async () =>
      expect((await saved()).classrooms[0].disabledCompetencyIds.sort()).toEqual(
        ["comunica-oralmente-castellano-l2", "construye-identidad-religion"],
      ),
    );
  });

  it("toggles an optional competency and cycle I grading", async () => {
    await seed((d) => createClassroom(d, { name: "Nido", cycle: "I", bands: ["18m"] }, () => "c1"));
    renderIn(<AulasPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByLabelText("AD, A, B, C y conclusión"));
    await waitFor(async () => expect((await saved()).classrooms[0].cycleIGrading).toBe("scale"));
  });

  it("disables and re-enables an optional competency", async () => {
    await seed((d) => createClassroom(d, { name: "Sol", cycle: "II", bands: ["3y"] }, () => "c1"));
    renderIn(<AulasPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    const religion = screen.getByLabelText(/Construye su identidad, como persona humana/);
    fireEvent.click(religion);
    await waitFor(async () =>
      expect((await saved()).classrooms[0].disabledCompetencyIds).toEqual(["construye-identidad-religion"]),
    );
    fireEvent.click(religion);
    await waitFor(async () => expect((await saved()).classrooms[0].disabledCompetencyIds).toEqual([]));
  });
});

describe("Niños pages", () => {
  const withKids = () =>
    seed((d) => {
      let x = createClassroom(d, { name: "Sol", cycle: "II", bands: ["3y"] }, () => "c1");
      x = addStudent(x, { classroomId: "c1", firstNames: "Ana", lastNames: "Paz", birthDate: "2020-01-01" }, () => "s1");
      return x;
    });

  it("lists children with age and adds a new one", async () => {
    await withKids();
    renderIn(<NinosPage />);
    expect(await screen.findByText("Paz, Ana")).toBeInTheDocument();
    expect(screen.getByText(/años/, { selector: "span.text-muted" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Luis" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Quispe" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar niño" }));
    expect(await screen.findByText("Quispe, Luis")).toBeInTheDocument();
  });

  it("hides archived children until the toggle", async () => {
    await withKids();
    renderIn(<NinosPage />);
    await screen.findByText("Paz, Ana");
    fireEvent.click(screen.getByLabelText("Archivados"));
    expect(screen.queryByText("Paz, Ana")).toBeNull();
  });

  it("ficha reads the id from location.search and saves details", async () => {
    await withKids();
    window.history.pushState({}, "", "/ninos/ficha/?id=s1");
    renderIn(<FichaPage />);
    expect(await screen.findByRole("heading", { name: "Paz, Ana" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await saved()).students[0].dni).toBe("12345678"));
    fireEvent.click(screen.getByRole("button", { name: "Archivar niño" }));
    await waitFor(async () => expect((await saved()).students[0].active).toBe(false));
    expect(await screen.findByRole("button", { name: "Restaurar niño" })).toBeInTheDocument();
  });

  it("ficha shows not found for an unknown id", async () => {
    await withKids();
    window.history.pushState({}, "", "/ninos/ficha/?id=zzz");
    renderIn(<FichaPage />);
    expect(await screen.findByText("No se encontró al niño.")).toBeInTheDocument();
  });

  it("saves the photo to the student folder", async () => {
    await withKids();
    window.history.pushState({}, "", "/ninos/ficha/?id=s1");
    compress.compressPhoto.mockResolvedValue(new Blob(["jpg"], { type: "image/jpeg" }));
    renderIn(<FichaPage />);
    const input = await screen.findByLabelText("Subir foto (opcional)");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    const path = "Aula Sol (3 años)/Niños/Paz, Ana/foto.jpg";
    await waitFor(async () => expect((await saved()).students[0].photo).toBe(`${year}/${path}`));
    expect(await storage.readFile(`${year}/${path}`)).not.toBeNull();
  });

  it("refreshes the preview when the photo is replaced", async () => {
    await withKids();
    window.history.pushState({}, "", "/ninos/ficha/?id=s1");
    let n = 0;
    const create = vi.fn(() => `blob:${++n}`);
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    compress.compressPhoto.mockImplementation(async () => new Blob(["jpg"], { type: "image/jpeg" }));
    renderIn(<FichaPage />);
    const input = await screen.findByLabelText("Subir foto (opcional)");
    const file = () => new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file()] } });
    const img = await screen.findByAltText("Foto del niño");
    const first = img.getAttribute("src");
    fireEvent.change(await screen.findByLabelText("Cambiar foto"), { target: { files: [file()] } });
    await waitFor(() => expect(screen.getByAltText("Foto del niño").getAttribute("src")).not.toBe(first));
    expect(revoke).toHaveBeenCalledWith(first);
  });

  it("shows an error when the photo cannot be processed", async () => {
    await withKids();
    window.history.pushState({}, "", "/ninos/ficha/?id=s1");
    compress.compressPhoto.mockRejectedValue(new Error("x"));
    renderIn(<FichaPage />);
    const input = await screen.findByLabelText("Subir foto (opcional)");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    expect(await screen.findByText("No se pudo procesar la foto.")).toBeInTheDocument();
    expect((await saved()).students[0].photo).toBeUndefined();
  });
});
