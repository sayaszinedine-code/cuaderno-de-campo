import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { createWorkspaceRepo, defaultPeriods } from "@/domain/workspace-repo";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import { ImportLegacy } from "./ImportLegacy";
import CarpetaPage from "./page";

const Y = new Date().getFullYear();
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const legacy = {
  perfil: {},
  ninos: [
    { id: "n1", nombre: "Valentina Quispe Huamán", nac: `${Y - 5}-04-12`, apo: "", tel: "", notas: "" },
    { id: "n2", nombre: "Mateo Flores Ccori", nac: "", apo: "", tel: "", notas: "" },
  ],
  registros: {
    r1: {
      id: "r1", fecha: `${Y}-03-18`, momento: "Taller", tipo: "obs", area: "Matemática", comp: "Resuelve problemas de cantidad",
      ninos: ["n1"], hecho: "Contó hasta 7.", interpretacion: "", acciones: "", fotos: [{ src: PNG }, { src: PNG }],
    },
    r2: {
      id: "r2", fecha: `${Y}-03-19`, momento: "Taller", tipo: "obs", area: "Arte", comp: "Pinta muy bonito",
      ninos: ["n2"], hecho: "Pintó.", interpretacion: "", acciones: "", fotos: [],
    },
  },
  asis: { [`${Y}-03`]: { [`${Y}-03-18`]: { n1: "P", n2: "F" } } },
  agenda: [{ id: "a1", fecha: `${Y}-04-02`, hora: "", titulo: "Reunión", tipo: "Reunión", nota: "" }],
};

let storage: MemoryStorage;

function renderImport() {
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  return render(
    <WorkspaceProvider userId="u1" autoBackupDelayMs={100_000}>
      <ImportLegacy />
    </WorkspaceProvider>,
  );
}

async function choose(content: string) {
  const input = (await screen.findByLabelText("Archivo de respaldo (.json)")) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([content], "cuaderno-respaldo.json", { type: "application/json" })] } });
}

beforeEach(() => {
  Object.values(pick).forEach((f) => f.mockReset());
  pick.supportsFolderAccess.mockReturnValue(true);
  storage = new MemoryStorage();
});

describe("ImportLegacy", () => {
  it("shows an error for a file that is not a legacy backup", async () => {
    renderImport();
    await choose(JSON.stringify({ hola: 1 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este archivo no es un respaldo de la app anterior.");
    await choose("{ esto no es json");
    expect(await screen.findByRole("alert")).toHaveTextContent("Este archivo no es un respaldo de la app anterior.");
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
  });

  it("previews, creates a new classroom, imports, and a second import adds nothing", async () => {
    renderImport();
    expect(await screen.findByRole("heading", { name: "Importar desde la app anterior" })).toBeInTheDocument();
    await choose(JSON.stringify(legacy));

    // No classroom yet: «Crear aula nueva» is the destination.
    expect(await screen.findByLabelText("Aula de destino")).toHaveValue("new");
    fireEvent.change(screen.getByLabelText("Nombre del aula"), { target: { value: "Girasoles" } });
    fireEvent.change(screen.getByLabelText("Ciclo"), { target: { value: "II" } });
    fireEvent.change(screen.getByLabelText("Edad"), { target: { value: "5y" } });

    expect(screen.getByText("Niños: 2")).toBeInTheDocument();
    expect(screen.getByText("Registros: 2")).toBeInTheDocument();
    expect(screen.getByText("Fotos: 2")).toBeInTheDocument();
    expect(screen.getByText("Días de asistencia: 1")).toBeInTheDocument();
    expect(screen.getByText("Eventos de agenda: 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/Importación terminada/)).toBeInTheDocument();
    expect(screen.getByText("No se reconoció la competencia en 1 registros.")).toBeInTheDocument();

    const repo = createWorkspaceRepo(storage);
    const year = await repo.loadYear(Y);
    expect(year.classrooms).toEqual([expect.objectContaining({ name: "Girasoles", cycle: "II", bands: ["5y"] })]);
    expect(year.students.map((s) => s.importedFrom)).toEqual(["n1", "n2"]);
    const notes = await repo.loadNotes(Y);
    expect(notes.notes).toHaveLength(2);
    expect(notes.notes.find((n) => n.importedFrom === "r1")?.evidence).toHaveLength(2);
    expect((await repo.loadAttendance(Y)).days).toHaveLength(1);
    expect((await repo.loadAgenda(Y)).events).toHaveLength(1);

    // Same file again, into the classroom just created.
    await choose(JSON.stringify(legacy));
    await waitFor(() => expect(screen.getByLabelText("Aula de destino")).not.toHaveValue("new"));
    expect(await screen.findByText("Este respaldo ya se importó. Solo se agregará lo nuevo.")).toBeInTheDocument();
    expect(screen.getByText("Niños: 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/Importación terminada/)).toBeInTheDocument();
    expect((await repo.loadYear(Y)).students).toHaveLength(2);
    expect((await repo.loadNotes(Y)).notes).toHaveLength(2);
  });

  it("imports into an existing classroom and shows the error when a photo cannot be written", async () => {
    const repo = createWorkspaceRepo(storage);
    await repo.saveYear({
      version: 1,
      schoolYear: Y,
      periods: defaultPeriods(Y),
      classrooms: [{ id: "c1", name: "Pollitos", cycle: "II", bands: ["3y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" }],
      students: [],
    });
    const write = storage.writeFile.bind(storage);
    storage.writeFile = async (path, data) => {
      if (path.includes("evidencia-")) throw new Error("disk full");
      return write(path, data);
    };
    renderImport();
    await choose(JSON.stringify(legacy));
    expect(await screen.findByLabelText("Aula de destino")).toHaveValue("c1");
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la importación.");
    // The children were saved before the notes; nothing else was.
    expect((await repo.loadYear(Y)).students).toHaveLength(2);
    expect((await repo.loadNotes(Y)).notes).toHaveLength(0);
    expect((await repo.loadAttendance(Y)).days).toHaveLength(0);
  });

  it("preselects the classroom that already has this backup and warns before duplicating into another one", async () => {
    const repo = createWorkspaceRepo(storage);
    const room = (id: string, name: string) => ({
      id, name, cycle: "II" as const, bands: ["4y" as const], disabledCompetencyIds: [], cycleIGrading: "descriptive" as const,
    });
    await repo.saveYear({
      version: 1,
      schoolYear: Y,
      periods: defaultPeriods(Y),
      classrooms: [room("c1", "Pollitos"), room("c2", "Rosas")],
      students: [{ id: "s1", classroomId: "c2", firstNames: "Valentina", lastNames: "Quispe Huamán", active: true, importedFrom: "n1" }],
    });
    renderImport();
    await choose(JSON.stringify(legacy));
    expect(await screen.findByLabelText("Aula de destino")).toHaveValue("c2");
    expect(screen.getByText("Este respaldo ya se importó. Solo se agregará lo nuevo.")).toBeInTheDocument();
    expect(screen.getByText("Niños: 1")).toBeInTheDocument();
    const warning = "Este respaldo ya se importó en el aula Rosas. Si lo importas en otra aula, se duplicarán los niños y registros.";
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Aula de destino"), { target: { value: "c1" } });
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.getByText("Niños: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Aula de destino"), { target: { value: "new" } });
    expect(screen.getByText(warning)).toBeInTheDocument();

    // Not blocked: importing into Pollitos goes ahead.
    fireEvent.change(screen.getByLabelText("Aula de destino"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(await screen.findByText(/Importación terminada/)).toBeInTheDocument();
    expect((await repo.loadYear(Y)).students.filter((s) => s.classroomId === "c1")).toHaveLength(2);
  });
  it("blocks backups, restores and folder changes while the import runs", async () => {
    const repo = createWorkspaceRepo(storage);
    await repo.saveYear({
      version: 1,
      schoolYear: Y,
      periods: defaultPeriods(Y),
      classrooms: [{ id: "c1", name: "Pollitos", cycle: "II", bands: ["3y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" }],
      students: [],
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let photoStarted = false;
    const write = storage.writeFile.bind(storage);
    storage.writeFile = async (path, data) => {
      if (path.includes("evidencia-")) {
        photoStarted = true;
        await gate;
      }
      return write(path, data);
    };
    pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
    render(
      <WorkspaceProvider userId="u1" autoBackupDelayMs={100_000}>
        <CarpetaPage />
      </WorkspaceProvider>,
    );
    await choose(JSON.stringify(legacy));
    expect(await screen.findByLabelText("Aula de destino")).toHaveValue("c1");
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    await waitFor(() => expect(photoStarted).toBe(true));
    const locked = ["Hacer respaldo ahora", "Restaurar desde un respaldo…", "Cambiar carpeta"];
    for (const name of locked) expect(screen.getByRole("button", { name })).toBeDisabled();
    release();
    expect(await screen.findByText(/Importación terminada/)).toBeInTheDocument();
    for (const name of locked) expect(screen.getByRole("button", { name })).toBeEnabled();
  });
});
