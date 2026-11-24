"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { NoteCard } from "@/components/NoteCard";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="space-y-6">
      <PageHeader title={firstName ? `¡Hola, ${firstName}!` : "¡Hola!"} subtitle={`Año escolar ${year}`} />
      <section className="card space-y-1 p-5">
        <p>
          Tu carpeta: <strong>{storage.label}</strong>
        </p>
        <p className="text-muted">
          {yearData.classrooms.length} aulas · {kids} niños en {year}
        </p>
      </section>
      <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {QUICK.map((q, i) => (
          <Link
            key={q.href}
            href={q.href}
            className={`card card-interactive flex flex-col items-start gap-2 p-4 font-semibold ${i === 0 ? "nav-active" : ""}`}
          >
            <Icon name={q.icon} className="size-7" />
            {q.label}
          </Link>
        ))}
      </nav>
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
          <div className="grid gap-3 lg:grid-cols-3">
            {lastNotes.map((n) => (
              <NoteCard key={n.id} note={n} students={yearData.students} storage={storage} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const QUICK: { href: string; label: string; icon: IconName }[] = [
  { href: "/cuaderno/registro/", label: "Nuevo registro", icon: "mas-simple" },
  { href: "/asistencia/", label: "Asistencia", icon: "asistencia" },
  { href: "/notas/", label: "Notas", icon: "notas" },
  { href: "/ninos/", label: "Niños", icon: "ninos" },
  { href: "/perfil/", label: "Perfil", icon: "perfil" },
  { href: "/carpeta/", label: "Carpeta", icon: "carpeta" },
];
