"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

export const REPLACE_CONFIRMATION = "Esto reemplazará los datos de esta carpeta. Se hará antes un respaldo de seguridad.";
const NAME_HINT = "Cambia el nombre de esos archivos en tu carpeta y vuelve a intentarlo.";
const DOWNLOAD_REVOKE_DELAY_MS = 1000;

type Picked = { file: File; createdAt: string; count: number; hasData: boolean };

const formatDate = (iso: string): string => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
};

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }
}

export function BackupPanel() {
  const { storage, backupDate, backupError, backupBusy, runBackup, restoreBackupFile } = useWorkspace();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = backupBusy !== null || checking;
  const reset = () => {
    setError("");
    setDone("");
    setSaved(null);
  };

  async function makeBackup() {
    reset();
    setPicked(null);
    try {
      const name = await runBackup();
      if (mounted.current) setSaved(name);
    } catch (e) {
      if (!mounted.current) return;
      const msg = e instanceof Error ? e.message : "No se pudo hacer el respaldo.";
      setError(/nombre que no se puede respaldar/.test(msg) ? `${msg} ${NAME_HINT}` : msg);
    }
  }

  async function download() {
    if (!saved) return;
    const blob = await storage.readFile(`Respaldos/${saved}`);
    if (blob) downloadBlob(blob, saved);
    else setError("No se encontró el respaldo en la carpeta.");
  }

  async function choose(file: File) {
    reset();
    setPicked(null);
    setChecking(true);
    try {
      const { inspectBackup, hasData } = await import("@/backup/backup");
      const result = await inspectBackup(file);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const data = await hasData(storage);
      if (mounted.current) setPicked({ file, createdAt: result.manifest.createdAt, count: result.manifest.files.length, hasData: data });
    } catch {
      if (mounted.current) setError("No se pudo leer ese archivo.");
    } finally {
      if (mounted.current) setChecking(false);
    }
  }

  async function restore(p: Picked) {
    setError("");
    setPicked(null);
    try {
      await restoreBackupFile(p.file, p.hasData);
      if (mounted.current) setDone("Respaldo restaurado.");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "No se pudo restaurar el respaldo.");
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Respaldos</h2>
      <p>{backupDate ? `Último respaldo: ${formatDate(backupDate)}` : backupDate === null ? "Todavía no hiciste un respaldo." : ""}</p>
      {backupError && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          No se pudo hacer el respaldo automático: {backupError}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void makeBackup()}>
          Hacer respaldo ahora
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
          Restaurar desde un respaldo…
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip"
          hidden
          aria-label="Archivo de respaldo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void choose(file);
          }}
        />
      </div>
      {backupBusy === "backup" && <p role="status">Haciendo respaldo…</p>}
      {backupBusy === "restore" && <p role="status">Restaurando…</p>}
      {checking && <p role="status">Revisando el respaldo…</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          {error}
        </p>
      )}
      {saved && (
        <div className="space-y-2" role="status">
          <p>Respaldo guardado en Respaldos/{saved}.</p>
          <button type="button" className="btn-secondary" onClick={() => void download()}>
            Descargar respaldo
          </button>
        </div>
      )}
      {done && <p role="status">{done}</p>}
      {picked && (
        <div className="space-y-3 rounded-xl bg-accent-soft p-3">
          <p>
            Respaldo del {formatDate(picked.createdAt)}, {picked.count} archivos
          </p>
          {picked.hasData && <p>{REPLACE_CONFIRMATION}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void restore(picked)}>
              {picked.hasData ? "Sí, reemplazar" : "Restaurar"}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPicked(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-semibold">Mover a otra computadora</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Aquí, toca «Hacer respaldo ahora».</li>
          <li>Copia el archivo .zip a una memoria USB o a tu Drive.</li>
          <li>En la otra computadora, elige una carpeta vacía y toca «Restaurar desde un respaldo…».</li>
        </ol>
      </div>
    </section>
  );
}
