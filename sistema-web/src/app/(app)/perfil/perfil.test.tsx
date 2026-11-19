import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { profilePath } from "@/domain/paths";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);

const updateOwnProfile = vi.hoisted(() => vi.fn());
vi.mock("@/auth/client", () => ({ updateOwnProfile }));
const accountEmail = vi.hoisted(() => ({ value: "ana@x.pe" }));
vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({
    refresh: vi.fn(),
    profile: {
      id: "u1", firstNames: "Ana", lastNames: "Paz", email: accountEmail.value, institution: "IEI 1",
      ugel: "UGEL 01", region: "Cusco", status: "active", role: "teacher",
    },
  }),
}));

import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import PerfilPage from "./page";

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  updateOwnProfile.mockReset();
  accountEmail.value = "ana@x.pe";
});

function renderPage() {
  return render(
    <WorkspaceProvider userId="u1">
      <PerfilPage />
    </WorkspaceProvider>,
  );
}

describe("Perfil page", () => {
  it("saves locally then updates the account", async () => {
    updateOwnProfile.mockResolvedValue({});
    renderPage();
    fireEvent.change(await screen.findByLabelText("Teléfono"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Perfil guardado.")).toBeInTheDocument();
    expect(JSON.parse((await storage.readText(profilePath())) ?? "{}").phone).toBe("999");
    expect(updateOwnProfile).toHaveBeenCalledWith(
      expect.objectContaining({ firstNames: "Ana", region: "Cusco", ugel: "UGEL 01" }),
    );
    expect(screen.getByLabelText("Correo")).toHaveAttribute("readonly");
  });

  it("keeps the local save when the cloud update fails", async () => {
    updateOwnProfile.mockRejectedValue(new Error("offline"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("Guardado en tu computadora. Se actualizará en tu cuenta cuando tengas conexión."),
    ).toBeInTheDocument();
    await waitFor(async () => expect(await storage.readText(profilePath())).not.toBeNull());
  });

  it("keeps the saved email when the account email is unknown (offline cached profile)", async () => {
    accountEmail.value = "";
    updateOwnProfile.mockRejectedValue(new Error("offline"));
    await storage.writeTextAtomic(
      profilePath(),
      JSON.stringify({
        version: 1, firstNames: "Ana", lastNames: "Paz", phone: "1", region: "Cusco", address: "",
        email: "ana@x.pe", level: "Inicial", ugel: "UGEL 01", institution: "IEI 1",
      }),
    );
    renderPage();
    expect(await screen.findByLabelText("Correo")).toHaveValue("ana@x.pe");
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado en tu computadora. Se actualizará en tu cuenta cuando tengas conexión.");
    const file = JSON.parse((await storage.readText(profilePath())) ?? "{}");
    expect(file.phone).toBe("999");
    expect(file.email).toBe("ana@x.pe");
  });
});
