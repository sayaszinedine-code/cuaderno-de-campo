"use client";

import { BackupPanel } from "@/backup/BackupPanel";
import { useWorkspace } from "@/workspace/WorkspaceProvider";
import { ImportLegacy } from "./ImportLegacy";

export default function CarpetaPage() {
  const { storage, canChooseFolder, changeFolder, backupBusy } = useWorkspace();
  const inBrowser = storage.kind !== "fs-access";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Mi carpeta</h1>
      <section className="card space-y-2 p-5">
        <p className="text-sm text-muted">{inBrowser ? "Guardado dentro del navegador" : "Carpeta en tu computadora"}</p>
        <p className="text-lg font-medium">{storage.label}</p>
        {canChooseFolder && (
          <button className="btn-secondary" disabled={backupBusy !== null} onClick={() => void changeFolder()}>
            Cambiar carpeta
          </button>
        )}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Cómo se guardan tus datos</h2>
        <p>Todo queda en archivos que puedes ver, copiar y respaldar. La carpeta se organiza así:</p>
        <pre className="overflow-x-auto rounded-xl bg-accent-soft p-3 text-sm">{`Cuaderno de Campo/
  datos/perfil.json
  <año>/
    datos/anio.json
    Aula <nombre> (<edad>)/
      Niños/<Apellidos, Nombres>/`}</pre>
        <p>Haz copias de esta carpeta con frecuencia (por ejemplo, en una memoria USB).</p>
      </section>
      <BackupPanel />
      <ImportLegacy />
    </div>
  );
}
