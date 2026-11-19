import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import type { Storage } from "@/storage/types";
import { yearDataPath } from "@/domain/paths";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

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
    <WorkspaceProvider>
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
    fireEvent.click(screen.getByRole("button", { name: "Elegir carpeta" }));
    expect(await screen.findByText(`year:${YEAR}`)).toBeInTheDocument();
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
      <WorkspaceProvider>
        <Years />
      </WorkspaceProvider>,
    );
    const btn = await screen.findByRole("button", { name: new RegExp(`prev ${YEAR} \\[${YEAR}`) });
    await act(async () => btn.click());
    expect(await screen.findByRole("button", { name: new RegExp(`prev ${YEAR - 1}`) })).toBeInTheDocument();
  });
});
