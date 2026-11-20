"use client";

import { NoteCard } from "@/components/NoteCard";
import type { FieldNote, Student } from "@/domain/schema";
import type { Storage } from "@/storage/types";

/** Compact cards of the field notes that back a grade, or a hint when there are none. */
export function EvidenceList({
  notes,
  students,
  storage,
}: {
  notes: FieldNote[];
  students: Student[];
  storage: Storage;
}) {
  return (
    <section aria-labelledby="evidence-title" className="space-y-2">
      <h3 id="evidence-title" className="font-semibold">
        {`Evidencias del bimestre (${notes.length})`}
      </h3>
      {notes.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay registros del cuaderno para esta competencia en este bimestre.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id}>
              <NoteCard note={n} students={students} storage={storage} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
