"use client";

import Link from "next/link";
import { useAccount } from "@/components/AccountGate";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

export default function InicioPage() {
  const { profile } = useAccount();
  const { storage, year, yearData } = useWorkspace();
  const firstName = profile.firstNames.trim().split(/\s+/)[0] ?? "";
  const kids = yearData.students.filter((s) => s.active).length;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">¡Hola, {firstName}!</h1>
      <p>Año escolar {year}</p>
      <section className="card space-y-1 p-5">
        <p>
          Tu carpeta: <strong>{storage.label}</strong>
        </p>
        <p className="text-muted">
          {yearData.classrooms.length} aulas · {kids} niños en {year}
        </p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/perfil/" className="btn-secondary">
          Perfil
        </Link>
        <Link href="/carpeta/" className="btn-secondary">
          Carpeta
        </Link>
        <Link href="/ninos/" className="btn-primary">
          Niños
        </Link>
      </div>
    </div>
  );
}
