"use client";

import Link from "next/link";
import { NoteCard } from "@/components/NoteCard";
import { useAccount } from "@/components/AccountGate";
import { upcoming } from "@/domain/agenda";
import { todayISO } from "@/domain/classrooms";
import { studentsWithoutRecentNotes } from "@/domain/notes";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

export default function InicioPage() {
  const { profile } = useAccount();
  const { storage, year, yearData, profile: local, notes, agenda } = useWorkspace();
  // The offline cached account has no names: fall back to the profile saved in the folder.
  const names = profile.firstNames.trim() || local?.firstNames.trim() || "";
  const firstName = names.split(/\s+/)[0] ?? "";
  const kids = yearData.students.filter((s) => s.active).length;

  const lastNotes = [...notes]
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  // "Last 2 weeks" only means something for the school year in progress.
  const today = todayISO();
  const neglected =
    year === Number(today.slice(0, 4)) ? studentsWithoutRecentNotes(notes, yearData.students, today) : [];

  const soon = upcoming(agenda, today).slice(0, 5);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{firstName ? `¡Hola, ${firstName}!` : "¡Hola!"}</h1>
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
        <Link href="/cuaderno/registro/" className="btn-primary">
          Nuevo registro
        </Link>
        <Link href="/perfil/" className="btn-secondary">
          Perfil
        </Link>
        <Link href="/carpeta/" className="btn-secondary">
          Carpeta
        </Link>
        <Link href="/ninos/" className="btn-secondary">
          Niños
        </Link>
      </div>
      {neglected.length > 0 && (
        <section className="card space-y-1 p-5">
          <p className="font-medium">
            {neglected.length === 1 ? "1 niño o niña" : `${neglected.length} niños`} sin observaciones en las últimas 2
            semanas
          </p>
          <p className="text-muted">{neglected.map((s) => `${s.firstNames} ${s.lastNames}`.trim()).join(", ")}</p>
        </section>
      )}
      {soon.length > 0 && (
        <section className="space-y-2" aria-label="Próximos eventos">
          <h2 className="text-lg font-semibold">Próximos 14 días</h2>
          <ul className="space-y-1">
            {soon.map((e) => (
              <li key={e.id}>
                <Link href={`/agenda/?dia=${e.date}`} className="underline">
                  {`${e.date.slice(8)}/${e.date.slice(5, 7)}${e.time ? ` ${e.time}` : ""} — ${e.title}`}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {lastNotes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Últimos registros</h2>
          {lastNotes.map((n) => (
            <NoteCard key={n.id} note={n} students={yearData.students} storage={storage} compact />
          ))}
        </section>
      )}
    </div>
  );
}
