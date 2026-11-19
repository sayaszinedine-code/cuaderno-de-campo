import { fireEvent, render, screen } from "@testing-library/react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import CarpetaPage from "./page";

beforeEach(() => {
  Object.values(pick).forEach((f) => f.mockReset());
  pick.supportsFolderAccess.mockReturnValue(true);
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage: new MemoryStorage() });
});

describe("Carpeta page", () => {
  it("shows the folder and explains the structure", async () => {
    render(
      <WorkspaceProvider>
        <CarpetaPage />
      </WorkspaceProvider>,
    );
    expect(await screen.findByText("Memoria (temporal)")).toBeInTheDocument();
    expect(screen.getByText(/Cuaderno de Campo/)).toBeInTheDocument();
    expect(screen.getByText(/Aula/)).toBeInTheDocument();
  });

  it("switches to another folder", async () => {
    const other = new MemoryStorage();
    Object.defineProperty(other, "label", { value: "Otra carpeta" });
    pick.chooseFolder.mockResolvedValue(other);
    render(
      <WorkspaceProvider>
        <CarpetaPage />
      </WorkspaceProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar carpeta" }));
    expect(await screen.findByText("Otra carpeta")).toBeInTheDocument();
  });
});
