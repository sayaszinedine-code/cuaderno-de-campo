import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { notesPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type YearData } from "@/domain/schema";

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
import NinosPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const data = (): YearData => ({
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
});

beforeEach(async () => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  await storage.writeTextAtomic(yearDataPath(year), JSON.stringify(data()));
  await storage.writeTextAtomic(notesPath(year), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: year, notes: [] }));
});
afterEach(() => cleanup());

const renderPage = () => render(<WorkspaceProvider userId="u1"><NinosPage /></WorkspaceProvider>);

describe("Niños", () => {
  it("each child shows an avatar and links to the ficha", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /Rojas, Luz/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/\/ninos\/ficha\/?\?id=s1$/));
    expect(link).toHaveTextContent("LR");
  });

  it("floating Agregar niño jumps to the form", async () => {
    renderPage();
    await screen.findByRole("link", { name: /Rojas, Luz/ });
    expect(screen.getByRole("link", { name: "Agregar niño" })).toHaveAttribute("href", "#agregar-nino");
    expect(document.getElementById("agregar-nino")?.tagName).toBe("FORM");
  });
});
