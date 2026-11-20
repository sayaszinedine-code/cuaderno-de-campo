"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { areaIdFor, getCompetencies } from "@/curriculum";
import { areasForCycles } from "@/domain/areas";
import { activeCompetencies, classroomLabel, todayISO } from "@/domain/classrooms";
import { sessionDir } from "@/domain/paths";
import type { FieldNote, SelectedPerformance, Session, Student, Unit } from "@/domain/schema";
import { newSession, notesNear, pruneNoteIds, removeSession, upsertSession, validateSession } from "@/domain/units";
import { PerformancePicker } from "@/notes/PerformancePicker";
import { AttachmentList } from "@/units/AttachmentList";
import { useAttachments } from "@/units/useAttachments";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const YEAR_CHANGED = "El año escolar cambió mientras editabas. Vuelve a Unidades y abre la sesión de nuevo.";
const UNIT_GONE = "La unidad de esta sesión ya no existe.";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const unitUrl = (unitId: string) => `/unidades/unidad/?id=${encodeURIComponent(unitId)}`;

export default function SesionPage() {
  const [query, setQuery] = useState<{ id: string | null; unidad: string | null } | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setQuery({ id: q.get("id"), unidad: q.get("unidad") });
  }, []);
  const { units, yearData } = useWorkspace();

  if (!query) return null;
  const existing = query.id === null ? undefined : units.sessions.find((s) => s.id === query.id);
  const unit = units.units.find((u) => u.id === (existing ? existing.unitId : query.unidad));
  if ((query.id !== null && !existing) || !unit) {
    return (
      <div className="space-y-3">
        <p>{query.id !== null && !existing ? "No encontramos esa sesión." : "No encontramos esa unidad."}</p>
        <Link href="/unidades/" className="underline">
          Volver a Unidades
        </Link>
      </div>
    );
  }
  if (!yearData.classrooms.some((c) => c.id === unit.classroomId)) return <p>El aula de esta unidad ya no existe.</p>;
  return <Form key={query.id ?? `new-${unit.id}`} existing={existing} unit={unit} />;
}

function noteLabel(n: FieldNote, students: Student[]): string {
  const first = n.evidenceText.trim().split("\n")[0] || "Sin texto";
  const who = n.wholeGroup
    ? ["Todo el grupo"]
    : n.studentIds.flatMap((id) => {
        const s = students.find((x) => x.id === id);
        return s ? [`${s.firstNames} ${s.lastNames}`.trim()] : [];
      });
  return [n.date, first, ...(who.length ? [who.join(", ")] : [])].join(" · ");
}

function Form({ existing, unit }: { existing: Session | undefined; unit: Unit }) {
  const router = useRouter();
  const { storage, year: currentYear, yearData, notes, updateUnits } = useWorkspace();
  /** The year this form was opened with: every write targets it, never a year chosen later. */
  const [year] = useState(currentYear);
  const [session, setSession] = useState<Session>(() => existing ?? newSession(unit));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletingRef = useRef(false);
  const currentYearRef = useRef(currentYear);
  currentYearRef.current = currentYear;
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const classroom = yearData.classrooms.find((c) => c.id === unit.classroomId);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const classroomRef = useRef(classroom);
  classroomRef.current = classroom;
  const files = useAttachments(storage, existing?.attachments ?? [], () =>
    classroomRef.current ? sessionDir(year, classroomRef.current, unit, sessionRef.current) : "",
  );
  const busy = saving || files.busy;
  const backUrl = unitUrl(unit.id);

  if (!classroom) return <p>El aula de esta unidad ya no existe.</p>;

  const patch = (p: Partial<Session>) => {
    setError("");
    files.clearError();
    setSession((s) => ({ ...s, ...p }));
  };

  const competencies = activeCompetencies(classroom);
  const areas = areasForCycles([classroom.cycle]).filter((a) => competencies.some((c) => areaIdFor(c, classroom.cycle) === a.id));
  const students = yearData.students.filter((s) => s.active && s.classroomId === classroom.id);

  const toggleCompetency = (id: string) =>
    patch(
      session.competencyIds.includes(id)
        ? { competencyIds: session.competencyIds.filter((c) => c !== id), performances: session.performances.filter((p) => p.competencyId !== id) }
        : { competencyIds: [...session.competencyIds, id] },
    );
  const setPerformances = (competencyId: string, next: SelectedPerformance[]) =>
    patch({ performances: [...session.performances.filter((p) => p.competencyId !== competencyId), ...next] });

  // Notes close to the session date, plus the already linked ones that fell outside the window.
  // Deleted notes are ignored here and dropped from `noteIds` on the next save.
  const near = notesNear(notes, unit.classroomId, session.date);
  const candidates = [...near, ...notes.filter((n) => session.noteIds.includes(n.id) && !near.some((x) => x.id === n.id))].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const toggleNote = (id: string) =>
    patch({ noteIds: session.noteIds.includes(id) ? session.noteIds.filter((x) => x !== id) : [...session.noteIds, id] });

  async function onCancel() {
    await files.discard();
    router.push(backUrl);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    await files.settle();
    const cur = sessionRef.current;
    const clean: Session = {
      ...cur,
      title: cur.title.trim(),
      purpose: cur.purpose.trim(),
      description: cur.description.trim(),
      attachments: files.attachments,
      noteIds: pruneNoteIds(cur, notes),
    };
    const invalid = validateSession(clean);
    setError(invalid ?? "");
    if (invalid) return;
    setSaving(true);
    try {
      const state = { unitMissing: false };
      const ok = await updateUnits(
        (f) => {
          if (!f.units.some((u) => u.id === clean.unitId)) {
            state.unitMissing = true;
            throw new Error(UNIT_GONE);
          }
          return upsertSession(f, clean);
        },
        { year },
      );
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        else if (state.unitMissing) setError(UNIT_GONE);
        return;
      }
      await files.commit(clean.attachments);
      router.push(backUrl);
    } finally {
      setSaving(false);
    }
  }

  const deletePaths = () => [...new Set([...(existing?.attachments ?? []).map((a) => a.path), ...files.addedPaths()])];

  async function onDelete() {
    if (deletingRef.current || busy || !existing) return;
    deletingRef.current = true;
    setSaving(true);
    try {
      const paths = deletePaths();
      const ok = await updateUnits((f) => removeSession(f, existing.id), { year });
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        return;
      }
      await files.removeFiles(paths);
      router.push(backUrl);
    } finally {
      deletingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="max-w-2xl space-y-5">
      <Link
        href={backUrl}
        className="underline"
        aria-disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          if (!busy) void onCancel();
        }}
      >
        Volver a la unidad
      </Link>
      <h1 className="text-2xl font-semibold">{existing ? "Editar sesión" : "Nueva sesión"}</h1>
      <p className="text-muted">
        {unit.title || "Sin título"} · {classroomLabel(classroom)}
      </p>

      <label className="block space-y-1">
        <span>Fecha</span>
        <input className="field" type="date" value={session.date} onChange={(e) => patch({ date: e.target.value })} />
      </label>

      <label className="block space-y-1">
        <span>Título</span>
        <input ref={titleRef} className="field" value={session.title} onChange={(e) => patch({ title: e.target.value })} />
      </label>

      <label className="block space-y-1">
        <span>Propósito</span>
        <textarea className="field" rows={3} value={session.purpose} onChange={(e) => patch({ purpose: e.target.value })} />
      </label>

      <fieldset className="space-y-3">
        <legend>Competencias</legend>
        {areas.map((a) => (
          <div key={a.id} className="space-y-1">
            <p className="font-medium">{a.name}</p>
            {competencies
              .filter((c) => areaIdFor(c, classroom.cycle) === a.id)
              .map((c) => (
                <label key={c.id} className="flex items-start gap-2">
                  <input type="checkbox" checked={session.competencyIds.includes(c.id)} onChange={() => toggleCompetency(c.id)} />
                  <span>{c.name}</span>
                </label>
              ))}
          </div>
        ))}
      </fieldset>

      {session.competencyIds.length > 0 && (
        <fieldset className="space-y-4">
          <legend>Desempeños (opcional)</legend>
          {session.competencyIds.map((id) => (
            <div key={id} className="space-y-2">
              <p className="font-medium">{getCompetencies(classroom.cycle).find((c) => c.id === id)?.shortName ?? id}</p>
              <PerformancePicker
                classroom={classroom}
                students={students}
                competencyId={id}
                date={session.date || todayISO()}
                schoolYear={year}
                selected={session.performances.filter((p) => p.competencyId === id)}
                onChange={(next) => setPerformances(id, next)}
              />
            </div>
          ))}
        </fieldset>
      )}

      <label className="block space-y-1">
        <span>Descripción</span>
        <textarea className="field" rows={4} value={session.description} onChange={(e) => patch({ description: e.target.value })} />
      </label>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Archivos adjuntos</h2>
        <AttachmentList storage={storage} items={files.attachments} onRemove={files.remove} disabled={busy} />
        <label className="block space-y-1">
          <span>Agregar archivos</span>
          <input
            type="file"
            multiple
            className="field"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              files.add(picked);
            }}
          />
        </label>
      </section>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">Registros del cuaderno vinculados</legend>
        {candidates.length === 0 ? (
          <p className="text-muted">No hay registros del aula cerca de esta fecha.</p>
        ) : (
          candidates.map((n) => (
            <label key={n.id} className="flex items-start gap-2">
              <input type="checkbox" checked={session.noteIds.includes(n.id)} onChange={() => toggleNote(n.id)} />
              <span className="line-clamp-2">{noteLabel(n, yearData.students)}</span>
            </label>
          ))
        )}
      </fieldset>

      <div aria-live="polite">
        {(error || files.error) && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3">
            {error || files.error}
          </p>
        )}
        {busy && <p role="status">Guardando…</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          Guardar
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onCancel()}>
          Cancelar
        </button>
        {existing && !confirmDelete && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Eliminar sesión
          </button>
        )}
      </div>

      {existing && confirmDelete && (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="card space-y-3 p-4">
          <p>Se eliminarán la sesión y {plural(deletePaths().length, "archivo", "archivos")}. No se puede deshacer.</p>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void onDelete()}>
              Sí, eliminar
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
