import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { saveBackup } from "./backup";
import { makeZip, seed } from "./helpers.test-util";

const ws = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/workspace/WorkspaceProvider", () => ({ useWorkspace: () => ws.value }));

import { BackupPanel } from "./BackupPanel";

const CONFIRM = "Esto reemplazará los datos de esta carpeta. Se hará antes un respaldo de seguridad.";
let storage: MemoryStorage;
let runBackup: ReturnType<typeof vi.fn>;
let restoreBackupFile: ReturnType<typeof vi.fn>;

function setup(extra: Record<string, unknown> = {}) {
  runBackup = vi.fn(() => saveBackup(storage, "manual"));
  restoreBackupFile = vi.fn(async () => undefined);
  ws.value = { storage, backupDate: null, backupError: "", backupBusy: null, runBackup, restoreBackupFile, ...extra };
  return render(<BackupPanel />);
}

async function pick(blob: Blob) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([blob], "mi-respaldo.zip");
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  storage = new MemoryStorage();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

describe("BackupPanel", () => {
  it("shows the last backup date or that there is none", () => {
    setup();
    expect(screen.getByText("Todavía no hiciste un respaldo.")).toBeInTheDocument();
  });

  it("shows the last backup date", () => {
    setup({ backupDate: "2026-11-02" });
    expect(screen.getByText(/Último respaldo: /)).toBeInTheDocument();
  });

  it("makes a manual backup and offers to download it", async () => {
    await seed(storage);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Hacer respaldo ahora" }));
    expect(await screen.findByText(/Respaldo guardado en Respaldos\/respaldo-/)).toBeInTheDocument();
    expect((await storage.list("Respaldos")).length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Descargar respaldo" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it("shows the backup error as is, with a hint for name errors", async () => {
    setup();
    runBackup.mockRejectedValue(new Error("El archivo «CON.json» tiene un nombre que no se puede respaldar. Cámbiale el nombre."));
    fireEvent.click(screen.getByRole("button", { name: "Hacer respaldo ahora" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("tiene un nombre que no se puede respaldar");
    expect(alert).toHaveTextContent("Cambia el nombre de esos archivos en tu carpeta y vuelve a intentarlo.");
  });

  it("shows the error for an invalid file and restores nothing", async () => {
    setup();
    await pick(new Blob(["not a zip"]));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este archivo no es un respaldo válido del Cuaderno de Campo.");
    expect(restoreBackupFile).not.toHaveBeenCalled();
    expect(await storage.list("")).toEqual([]);
  });

  it("previews a valid backup and restores into an empty folder", async () => {
    setup();
    await pick(await makeZip({ files: { "datos/perfil.json": "{}", "2026/a.txt": "x" } }));
    expect(await screen.findByText(/Respaldo del .*, 2 archivos/)).toBeInTheDocument();
    expect(screen.queryByText(CONFIRM)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(await screen.findByText("Respaldo restaurado.")).toBeInTheDocument();
    expect(restoreBackupFile).toHaveBeenCalledWith(expect.any(Blob), false);
  });

  it("requires confirmation to replace existing data", async () => {
    await seed(storage);
    setup();
    await pick(await makeZip({}));
    expect(await screen.findByText(CONFIRM)).toBeInTheDocument();
    expect(restoreBackupFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(restoreBackupFile).not.toHaveBeenCalled();

    await pick(await makeZip({}));
    fireEvent.click(await screen.findByRole("button", { name: "Sí, reemplazar" }));
    expect(await screen.findByText("Respaldo restaurado.")).toBeInTheDocument();
    expect(restoreBackupFile).toHaveBeenCalledTimes(1);
    expect(restoreBackupFile).toHaveBeenCalledWith(expect.any(Blob), true);
  });

  it("shows the restore error", async () => {
    setup();
    await pick(await makeZip({}));
    restoreBackupFile.mockRejectedValue(new Error("La restauración no terminó. Tus datos anteriores están en el respaldo de seguridad: x.zip."));
    fireEvent.click(await screen.findByRole("button", { name: "Restaurar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La restauración no terminó");
    expect(screen.queryByText("Respaldo restaurado.")).toBeNull();
  });

  it("disables the buttons and shows progress while busy", () => {
    setup({ backupBusy: "restore" });
    expect(screen.getByText("Restaurando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer respaldo ahora" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restaurar desde un respaldo…" })).toBeDisabled();
  });

  it("shows «Haciendo respaldo…» while a backup runs", () => {
    setup({ backupBusy: "backup" });
    expect(screen.getByText("Haciendo respaldo…")).toBeInTheDocument();
  });

  it("shows the last automatic backup error", () => {
    setup({ backupError: "Tus datos pesan más de 3,5 GB. Pide ayuda para hacer un respaldo por partes." });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo hacer el respaldo automático");
    expect(screen.getByRole("alert")).toHaveTextContent("3,5 GB");
  });

  it("explains how to move to another computer in 3 steps", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Mover a otra computadora" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
