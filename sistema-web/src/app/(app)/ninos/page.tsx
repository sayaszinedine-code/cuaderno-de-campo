"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { addStudent, classroomLabel, todayISO } from "@/domain/classrooms";
import { formatAge } from "@/domain/age";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

export default function NinosPage() {
  const { yearData, update } = useWorkspace();
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [firstNames, setFirstNames] = useState("");
  const [lastNames, setLastNames] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [error, setError] = useState("");

  const today = todayISO();
  const rooms = yearData.classrooms;
  const roomName = (id: string) => rooms.find((c) => c.id === id)?.name ?? "";
  const students = yearData.students
    .filter((s) => s.active !== showArchived)
    .filter((s) => !filter || s.classroomId === filter)
    .sort((a, b) => `${a.lastNames} ${a.firstNames}`.localeCompare(`${b.lastNames} ${b.firstNames}`, "es"));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const target = classroomId || rooms[0]?.id || "";
    let msg = "";
    const saved = await update((d) => {
      try {
        return addStudent(d, { classroomId: target, firstNames, lastNames, birthDate: birthDate || undefined });
      } catch (err) {
        msg = err instanceof Error ? err.message : "No se pudo agregar al niño.";
        throw err;
      }
    });
    setError(msg);
    // Keep what was typed unless it really reached the disk (a failed save shows the provider's banner).
    if (saved) {
      setFirstNames("");
      setLastNames("");
      setBirthDate("");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Niños</h1>

      {rooms.length === 0 ? (
        <p>
          Primero crea un aula en{" "}
          <Link href="/aulas/" className="underline">
            Aulas
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1">
              <span className="block">Aula</span>
              <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">Todas las aulas</option>
                {rooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classroomLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Archivados
            </label>
          </div>

          {students.length === 0 ? (
            <p>{showArchived ? "No hay niños archivados." : "Todavía no hay niños en esta lista."}</p>
          ) : (
            <ul className="space-y-2">
              {students.map((s) => {
                const age = s.birthDate ? formatAge(s.birthDate, today) : "";
                return (
                  <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                    <Link href={`/ninos/ficha/?id=${encodeURIComponent(s.id)}`} className="font-medium underline">
                      {s.lastNames}, {s.firstNames}
                    </Link>
                    <span className="text-sm text-muted">
                      {[age, roomName(s.classroomId)].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={onSubmit} className="card space-y-4 p-4">
            <h2 className="text-lg font-semibold">Agregar niño</h2>
            <label className="block space-y-1">
              <span>Nombres</span>
              <input className="field" value={firstNames} onChange={(e) => setFirstNames(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span>Apellidos</span>
              <input className="field" value={lastNames} onChange={(e) => setLastNames(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span>Fecha de nacimiento</span>
              <input className="field" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span>Aula del niño</span>
              <select className="field" value={classroomId || rooms[0].id} onChange={(e) => setClassroomId(e.target.value)}>
                {rooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classroomLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-danger-soft p-3">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary">
              Agregar niño
            </button>
          </form>
        </>
      )}
    </div>
  );
}
