"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from "@/ai/settings";
import { useAccount } from "@/components/AccountGate";
import { areaIdFor } from "@/curriculum";
import { areasForCycles } from "@/domain/areas";
import { activeCompetencies, byStudentName, classroomLabel } from "@/domain/classrooms";
import { newNote, removeNote, upsertNote, validateNote, validStudents } from "@/domain/notes";
import { noteDir } from "@/domain/paths";
import { linkedSessionsOfNote } from "@/domain/units";
import { compressPhoto, EVIDENCE_MAX_SIZE } from "@/domain/photo";
import { LEVELS, MOMENTS, NOTE_KIND_LABELS, type FieldNote, type Level, type NoteKind } from "@/domain/schema";
import { AiNoteAction } from "@/notes/AiActions";
import { EvidencePhotos } from "@/notes/EvidencePhotos";
import { PerformancePicker } from "@/notes/PerformancePicker";
import { useWorkspace } from "@/workspace/WorkspaceProvider";
import { useToast } from "@/components/Toast";

const LIST = "/cuaderno/";
const PHOTO_FAILED = "No se pudo guardar una de las fotos.";
const YEAR_CHANGED = "El año escolar cambió mientras editabas. Vuelve al cuaderno y abre el registro de nuevo.";
const lastKey = (userId: string) => `notes-last:${userId}`;

function readLast(userId: string): { classroomId?: string; moment?: string } {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(lastKey(userId)) ?? "null");
    if (typeof raw !== "object" || raw === null) return {};
    const r = raw as Record<string, unknown>;
    return {
      classroomId: typeof r.classroomId === "string" ? r.classroomId : undefined,
      moment: typeof r.moment === "string" ? r.moment : undefined,
    };
  } catch {
    return {};
  }
}

function writeLast(userId: string, note: FieldNote): void {
  try {
    window.localStorage.setItem(lastKey(userId), JSON.stringify({ classroomId: note.classroomId, moment: note.moment }));
  } catch {
    /* remembering is a convenience */
  }
}

export default function RegistroPage() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  const { notes, yearData } = useWorkspace();

  if (id === undefined) return null;
  const found = id === null ? undefined : notes.find((n) => n.id === id);
  if (id !== null && !found) {
    return (
      <div className="space-y-3">
        <p>No encontramos ese registro.</p>
        <Link href={LIST} className="underline">
          Volver al cuaderno
        </Link>
      </div>
    );
  }
  if (yearData.classrooms.length === 0) {
    return (
      <div className="space-y-3">
        <p>Crea un aula antes de registrar observaciones.</p>
        <Link href="/aulas/" className="underline">
          Ir a Aulas
        </Link>
      </div>
    );
  }
  return <Form key={id ?? "new"} existing={found} />;
}

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function Form({ existing }: { existing: FieldNote | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAccount();
  const { storage, year: currentYear, yearData, units, updateNotes } = useWorkspace();
  /** The year this form was opened with: every write targets it, never a year chosen later. */
  const [year] = useState(currentYear);

  const [note, setNote] = useState<FieldNote>(() => {
    if (existing) return existing;
    const last = readLast(profile.id);
    const classroomId = yearData.classrooms.some((c) => c.id === last.classroomId)
      ? (last.classroomId as string)
      : yearData.classrooms[0].id;
    const n = newNote({ classroomId });
    return last.moment && (MOMENTS as readonly string[]).includes(last.moment) ? { ...n, moment: last.moment } : n;
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(0);
  const pendingRef = useRef<Promise<void>[]>([]);
  const busy = saving || pending > 0;

  const noteRef = useRef(note);
  noteRef.current = note;
  /** Guards «Sí, eliminar» against a double tap before the disabled state renders. */
  const deletingRef = useRef(false);
  const currentYearRef = useRef(currentYear);
  currentYearRef.current = currentYear;
  /** Files written during this session (deleted on cancel). */
  const addedRef = useRef<string[]>([]);
  /** Photos taken out of the form that already existed; deleted after a successful save. */
  const removedRef = useRef<string[]>([]);
  /** Basenames in use: the note's photos, pending removals and in-flight writes. */
  const usedRef = useRef(new Set((existing?.evidence ?? []).map(basename)));
  /** Names already on disk per photo folder (listed once per folder): other same-day notes may share it. */
  const diskRef = useRef(new Map<string, Promise<Set<string>>>());
  const evidenceRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    evidenceRef.current?.focus();
  }, []);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  useEffect(() => {
    setAiSettings(loadAiSettings(profile.id));
  }, [profile.id]);

  /** Unsaved edits or in-flight photos: the linked session must not be opened (they would be lost). */
  const dirty = !!existing && (pending > 0 || JSON.stringify(note) !== JSON.stringify(existing));

  const classroom = yearData.classrooms.find((c) => c.id === note.classroomId);
  if (!classroom) return <p>El aula de este registro ya no existe.</p>;

  const patch = (p: Partial<FieldNote>) => {
    setMessage("");
    setError("");
    setNote((n) => ({ ...n, ...p }));
  };

  const students = yearData.students
    .filter((s) => s.active && s.classroomId === classroom.id)
    .sort(byStudentName);
  const competencies = activeCompetencies(classroom);
  const areas = areasForCycles([classroom.cycle]).filter((a) => competencies.some((c) => areaIdFor(c, classroom.cycle) === a.id));
  const areaCompetencies = competencies.filter((c) => areaIdFor(c, classroom.cycle) === note.areaId);
  const noteStudents = validStudents(note, yearData, existing?.studentIds);
  // Archived children of the saved note stay listed even when deselected, so they can be re-added.
  const archivedIds = new Set([...(existing?.studentIds ?? []), ...note.studentIds]);
  const archivedChips = yearData.students.filter(
    (s) => !s.active && s.classroomId === classroom.id && archivedIds.has(s.id),
  );
  const hideLevel = classroom.cycle === "I" && classroom.cycleIGrading === "descriptive";

  const namesOnDisk = (dir: string): Promise<Set<string>> => {
    let names = diskRef.current.get(dir);
    if (!names) {
      names = storage
        .list(dir)
        .then((entries) => new Set(entries.map((e) => e.name)))
        .catch(() => new Set<string>());
      diskRef.current.set(dir, names);
    }
    return names;
  };

  const nameFor = (onDisk: Set<string>): string => {
    let n = 1;
    while (usedRef.current.has(`evidencia-${n}.jpg`) || onDisk.has(`evidencia-${n}.jpg`)) n++;
    const name = `evidencia-${n}.jpg`;
    usedRef.current.add(name);
    return name;
  };

  function addPhotos(files: File[]) {
    if (files.length === 0) return;
    setPending((c) => c + 1);
    const job = uploadPhotos(files).finally(() => {
      pendingRef.current = pendingRef.current.filter((p) => p !== job);
      setPending((c) => c - 1);
    });
    pendingRef.current.push(job);
  }

  async function uploadPhotos(files: File[]) {
    if (!classroom) return;
    for (const file of files) {
      const dir = noteDir(year, classroom, noteRef.current);
      const name = nameFor(await namesOnDisk(dir));
      const path = `${dir}${name}`;
      try {
        const blob = await compressPhoto(file, EVIDENCE_MAX_SIZE);
        await storage.writeFile(path, blob);
      } catch {
        usedRef.current.delete(name);
        setError(PHOTO_FAILED);
        continue;
      }
      addedRef.current.push(path);
      setNote((n) => ({ ...n, evidence: [...n.evidence, path] }));
    }
  }

  function removePhoto(path: string) {
    if (busy) return;
    setMessage("");
    setNote((n) => ({ ...n, evidence: n.evidence.filter((p) => p !== path) }));
    if (addedRef.current.includes(path)) {
      addedRef.current = addedRef.current.filter((p) => p !== path);
      void storage
        .remove(path)
        .catch(() => undefined)
        .finally(() => usedRef.current.delete(basename(path)));
    } else {
      removedRef.current.push(path);
    }
  }

  async function removeFiles(paths: string[]) {
    await Promise.all(paths.map((p) => storage.remove(p).catch(() => undefined)));
  }

  async function onCancel() {
    await removeFiles(addedRef.current);
    addedRef.current = [];
    router.push(LIST);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    await Promise.all(pendingRef.current);
    const clean: FieldNote = {
      ...note,
      evidenceText: note.evidenceText.trim(),
      interpretation: note.interpretation.trim(),
      reflection: note.reflection.trim(),
      level: hideLevel ? undefined : note.level,
    };
    const invalid = validateNote(clean, yearData, { keepStudentIds: existing?.studentIds });
    setMessage("");
    setError(invalid ?? "");
    if (invalid) return;
    setSaving(true);
    try {
      const ok = await updateNotes((f) => upsertNote(f, clean), { year });
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        return;
      }
      await removeFiles(removedRef.current.filter((p) => !clean.evidence.includes(p)));
      removedRef.current = [];
      addedRef.current = [];
      writeLast(profile.id, clean);
      setMessage("Registro guardado.");
      toast("Registro guardado.");
      router.push(LIST);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (deletingRef.current || busy) return;
    deletingRef.current = true;
    setSaving(true);
    try {
      const ok = await updateNotes((f) => removeNote(f, note.id), { year });
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        return;
      }
      await removeFiles([...new Set([...(existing?.evidence ?? []), ...addedRef.current])]);
      router.push(LIST);
    } finally {
      deletingRef.current = false;
      setSaving(false);
    }
  }

  const toggleStudent = (id: string) =>
    patch({
      wholeGroup: false,
      studentIds: note.studentIds.includes(id) ? note.studentIds.filter((s) => s !== id) : [...note.studentIds, id],
    });
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 ${on ? "bg-primary text-white" : "bg-white"}`;

  return (
    <form onSubmit={onSave} className="max-w-2xl space-y-5">
      <Link
        href={LIST}
        className="underline"
        aria-disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          if (!busy) void onCancel();
        }}
      >
        Volver al cuaderno
      </Link>
      <h1 className="text-2xl font-semibold">{existing ? "Editar registro" : "Nuevo registro"}</h1>
      {existing &&
        linkedSessionsOfNote(units, existing.id).map((s) => (
          <p key={s.id}>
            {dirty ? (
              <span aria-disabled="true" className="opacity-60">
                {`Sesión vinculada: ${s.title || "Sin título"} (${s.date})`}
              </span>
            ) : (
              <Link href={`/unidades/sesion/?id=${encodeURIComponent(s.id)}`} className="underline">
                {`Sesión vinculada: ${s.title || "Sin título"} (${s.date})`}
              </Link>
            )}
          </p>
        ))}
      {dirty && linkedSessionsOfNote(units, existing.id).length > 0 && (
        <p className="text-sm text-muted">Guarda el registro antes de abrir la sesión.</p>
      )}

      <label className="block space-y-1">
        <span>Fecha</span>
        <input className="field" type="date" value={note.date} onChange={(e) => e.target.value && patch({ date: e.target.value })} />
      </label>

      <label className="block space-y-1">
        <span>Aula</span>
        <select
          className="field"
          value={note.classroomId}
          onChange={(e) =>
            patch({
              classroomId: e.target.value,
              studentIds: [],
              wholeGroup: false,
              areaId: undefined,
              competencyId: undefined,
              performances: [],
            })
          }
        >
          {yearData.classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {classroomLabel(c)}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend>Niños y niñas</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={note.wholeGroup}
            className={chip(note.wholeGroup)}
            onClick={() => patch({ wholeGroup: !note.wholeGroup, studentIds: [] })}
          >
            Todo el grupo
          </button>
          {[...students, ...archivedChips].map((s) => {
            const on = note.studentIds.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => toggleStudent(s.id)}>
                {`${s.firstNames} ${s.lastNames}`.trim()}
                {s.active ? "" : " (archivado)"}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span>Momento de la jornada</span>
        <select className="field" value={note.moment} onChange={(e) => patch({ moment: e.target.value })}>
          {(MOMENTS as readonly string[]).includes(note.moment) ? null : <option value={note.moment}>{note.moment}</option>}
          {MOMENTS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span>Tipo</span>
        <select className="field" value={note.kind} onChange={(e) => patch({ kind: e.target.value as NoteKind })}>
          {(Object.keys(NOTE_KIND_LABELS) as NoteKind[]).map((k) => (
            <option key={k} value={k}>
              {NOTE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Evidencias</h2>
        <label className="block space-y-1">
          <span>¿Qué hizo o dijo? Describe los hechos</span>
          <textarea
            ref={evidenceRef}
            className="field"
            rows={4}
            value={note.evidenceText}
            onChange={(e) => patch({ evidenceText: e.target.value })}
          />
        </label>
        <AiNoteAction
          kind="objective"
          settings={aiSettings}
          note={note}
          classroom={classroom}
          yearStudents={yearData.students}
          noteStudents={noteStudents}
          schoolYear={year}
          storage={storage}
          onPatch={patch}
        />
        <EvidencePhotos storage={storage} paths={note.evidence} onRemove={removePhoto} disabled={busy} />
        <AiNoteAction
          kind="photo"
          settings={aiSettings}
          note={note}
          classroom={classroom}
          yearStudents={yearData.students}
          noteStudents={noteStudents}
          schoolYear={year}
          storage={storage}
          onPatch={patch}
        />
        <label className="block space-y-1">
          <span>Agregar fotos</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="field"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addPhotos(files);
            }}
          />
        </label>
      </section>

      <AiNoteAction
        kind="suggest"
        settings={aiSettings}
        note={note}
        classroom={classroom}
        yearStudents={yearData.students}
        noteStudents={noteStudents}
        schoolYear={year}
        storage={storage}
        onPatch={patch}
      />

      <label className="block space-y-1">
        <span>Área</span>
        <select
          className="field"
          value={note.areaId ?? ""}
          onChange={(e) => patch({ areaId: e.target.value || undefined, competencyId: undefined, performances: [] })}
        >
          <option value="">Sin área</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span>Competencia</span>
        <select
          className="field"
          value={note.competencyId ?? ""}
          disabled={!note.areaId}
          onChange={(e) => patch({ competencyId: e.target.value || undefined, performances: [] })}
        >
          <option value="">Sin competencia</option>
          {areaCompetencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {note.competencyId && (
        <fieldset className="space-y-2">
          <legend>Desempeños</legend>
          <PerformancePicker
            key={note.competencyId}
            classroom={classroom}
            students={noteStudents}
            competencyId={note.competencyId}
            date={note.date}
            schoolYear={year}
            selected={note.performances}
            onChange={(performances) => patch({ performances })}
          />
        </fieldset>
      )}

      <label className="block space-y-1">
        <span>Interpretación en relación al desempeño</span>
        <textarea className="field" rows={3} value={note.interpretation} onChange={(e) => patch({ interpretation: e.target.value })} />
      </label>
      <AiNoteAction
        kind="interpretation"
        settings={aiSettings}
        note={note}
        classroom={classroom}
        yearStudents={yearData.students}
        noteStudents={noteStudents}
        schoolYear={year}
        storage={storage}
        onPatch={patch}
      />

      <label className="block space-y-1">
        <span>Reflexión docente en relación a la actividad</span>
        <textarea className="field" rows={3} value={note.reflection} onChange={(e) => patch({ reflection: e.target.value })} />
      </label>

      {!hideLevel && (
        <label className="block space-y-1">
          <span>Nivel de logro (opcional)</span>
          <select className="field" value={note.level ?? ""} onChange={(e) => patch({ level: (e.target.value || undefined) as Level | undefined })}>
            <option value="">Sin nivel</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3">
            {error}
          </p>
        )}
        {pending > 0 && <p role="status">Guardando fotos…</p>}
        {message && <p role="status">{message}</p>}
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
            Eliminar registro
          </button>
        )}
      </div>

      {existing && confirmDelete && (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="card space-y-3 p-4">
          <p>¿Eliminar este registro y sus fotos? No se puede deshacer.</p>
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
