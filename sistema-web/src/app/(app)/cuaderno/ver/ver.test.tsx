import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { notesPath, yearDataPath } from "@/domain/paths";
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
import VerPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const data: YearData = {
  version: SCHEMA_VERSION,
  schoolYear: year,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${year}-01-01`, end: `${year}-06-30` },
    { id: "B2", name: "II Bimestre", start: `${year}-07-01`, end: `${year}-08-31` },
    { id: "B3", name: "III Bimestre", start: `${year}-09-01`, end: `${year}-10-31` },
    { id: "B4", name: "IV Bimestre", start: `${year}-11-01`, end: `${year}-12-31` },
  ],
  classrooms: [
    { id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" } as YearData["classrooms"][number],
  ],
  students: [
    { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", birthDate: "2021-05-01", active: true },
  ] as YearData["students"],
};

const note: FieldNote = {
  id: "a", date: `${year}-03-10`, classroomId: "c1", studentIds: ["s1"], wholeGroup: false, moment: "Taller",
  kind: "logro", performances: [{ competencyId: "resuelve-problemas-de-cantidad", band: "4y", text: "Cuenta objetos hasta 10" }], evidenceText: "Armó una torre de 8 bloques", evidence: ["a/1.jpg"],
  interpretation: "Cuenta hasta 8", reflection: "Usar más material", areaId: "matematica",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(async () => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data));
  await storage.writeTextAtomic(notesPath(year), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, notes: [note] }));
  await storage.writeFile("a/1.jpg", new Blob(["x"], { type: "image/jpeg" }));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:1"), revokeObjectURL: vi.fn() });
});
afterEach(() => cleanup());

const open = (id: string) => {
  window.history.pushState({}, "", `/cuaderno/ver/?id=${id}`);
  return render(<WorkspaceProvider userId="u1"><VerPage /></WorkspaceProvider>);
};

describe("Read view", () => {
  it("shows the whole note without editable fields", async () => {
    open("a");
    expect(await screen.findByText("Armó una torre de 8 bloques")).toBeInTheDocument();
    expect(screen.getByText("Cuenta hasta 8")).toBeInTheDocument();
    expect(screen.getByText("Usar más material")).toBeInTheDocument();
    expect(screen.getByText("Luz Rojas")).toBeInTheDocument();
    expect(screen.getByText("Matemática")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Editar goes to the form", async () => {
    open("a");
    await screen.findByText("Armó una torre de 8 bloques");
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", expect.stringMatching(/^\/cuaderno\/registro\/?\?id=a$/));
  });

  it("loads the photos", async () => {
    open("a");
    await waitFor(() => expect(screen.getByAltText("Foto 1 del registro")).toHaveAttribute("src", "blob:1"));
  });

  it("an unknown id shows a friendly message", async () => {
    open("nope");
    expect(await screen.findByText("No encontramos este registro.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al cuaderno" })).toBeInTheDocument();
  });

  it("lists the selected desempeños", async () => {
    open("a");
    await screen.findByText("Armó una torre de 8 bloques");
    expect(screen.getByRole("heading", { name: "Desempeños" })).toBeInTheDocument();
    expect(screen.getByText("Cuenta objetos hasta 10")).toBeInTheDocument();
  });

  it("the zoomed photo covers the whole app and closes with Escape", async () => {
    open("a");
    const img = await screen.findByAltText("Foto 1 del registro");
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:1"));
    fireEvent.click(img.closest("button")!);
    const overlay = screen.getByRole("dialog", { name: "Foto ampliada" });
    expect(overlay.parentElement).toBe(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Foto ampliada" })).toBeNull();
  });
});
