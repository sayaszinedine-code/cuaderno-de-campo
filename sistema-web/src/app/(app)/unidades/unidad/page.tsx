"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { areaIdFor, getCompetencies } from "@/curriculum";
import { areasForCycles } from "@/domain/areas";
import { activeCompetencies, classroomLabel, todayISO } from "@/domain/classrooms";
import { periodOf } from "@/domain/notes";
import { UNIT_KINDS, UNIT_KIND_LABELS, type Period, type SelectedPerformance, type Unit } from "@/domain/schema";
import { newUnit, removeUnit, unitFilePaths, upsertUnit, validateUnit } from "@/domain/units";
import { unitDir } from "@/domain/paths";
import { PerformancePicker } from "@/notes/PerformancePicker";
import { AttachmentList } from "@/units/AttachmentList";
import { useAttachments } from "@/units/useAttachments";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];
const YEAR_CHANGED = "El año escolar cambió mientras editabas. Vuelve a Unidades y abre la unidad de nuevo.";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function UnidadPage() {
  const [query, setQuery] = useState<{ id: string | null; aula: string | null; bim: string | null } | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setQuery({ id: q.get("id"), aula: q.get("aula"), bim: q.get("bim") });
  }, []);
  const { units, yearData } = useWorkspace();

  if (!query) return null;
  const found = query.id === null ? undefined : units.units.find((u) => u.id === query.id);
  if (query.id !== null && !found) {
    return (
      <div className="space-y-3">
        <p>No encontramos esa unidad.</p>
        <Link href="/unidades/" className="underline">
          Volver a Unidades
        </Link>
      </div>
    );
  }
  if (yearData.classrooms.length === 0) {
    return (
      <div className="space-y-3">
        <p>Crea un aula antes de crear unidades.</p>
        <Link href="/aulas/" className="underline">
          Ir a Aulas
        </Link>
      </div>
    );
  }
  return <Form key={query.id ?? "new"} existing={found} aula={query.aula} bim={query.bim} />;
}

function Form({ existing, aula, bim }: { existing: Unit | undefined; aula: string | null; bim: string | null }) {
  const router = useRouter();
  const { storage, year: currentYear, yearData, units, updateUnits } = useWorkspace();
  /** The year this form was opened with: every write targets it, never a year chosen later. */
  const [year] = useState(currentYear);

  const [unit, setUnit] = useState<Unit>(() => {
    if (existing) return existing;
    const classroomId = yearData.classrooms.some((c) => c.id === aula) ? (aula as string) : yearData.classrooms[0].id;
    const periodId = (PERIOD_IDS as string[]).includes(bim ?? "")
      ? (bim as Period["id"])
      : (periodOf(todayISO(), yearData.periods) ?? "B1");
    return newUnit({ classroomId, periodId });
  });
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
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const classroomRef = useRef(classroom);
  classroomRef.current = classroom;
  const files = useAttachments(storage, existing?.attachments ?? [], () =>
    classroomRef.current ? unitDir(year, classroomRef.current, unitRef.current) : "",
  );
  const busy = saving || files.busy;
  /** Unsaved form edits or new/removed attachments: sessions must not be opened (they would lose them). */
  const dirty =
    !!existing &&
    (files.busy ||
      JSON.stringify({ ...unit, attachments: [] }) !== JSON.stringify({ ...existing, attachments: [] }) ||
      files.attachments.map((a) => a.path).join("|") !== existing.attachments.map((a) => a.path).join("|"));
  const listUrl = `/unidades/?aula=${unit.classroomId}&bim=${unit.periodId}`;

  if (!classroom) return <p>El aula de esta unidad ya no existe.</p>;

  const patch = (p: Partial<Unit>) => {
    setError("");
    files.clearError();
    setUnit((u) => ({ ...u, ...p }));
  };

  const competencies = activeCompetencies(classroom);
  const areas = areasForCycles([classroom.cycle]).filter((a) => competencies.some((c) => areaIdFor(c, classroom.cycle) === a.id));
  const students = yearData.students.filter((s) => s.active && s.classroomId === classroom.id);
  const sessions = units.sessions.filter((s) => s.unitId === unit.id).sort((a, b) => a.date.localeCompare(b.date));

  const toggleCompetency = (id: string) =>
    patch(
      unit.competencyIds.includes(id)
        ? { competencyIds: unit.competencyIds.filter((c) => c !== id), performances: unit.performances.filter((p) => p.competencyId !== id) }
        : { competencyIds: [...unit.competencyIds, id] },
    );
  const setPerformances = (competencyId: string, next: SelectedPerformance[]) =>
    patch({ performances: [...unit.performances.filter((p) => p.competencyId !== competencyId), ...next] });

  async function onCancel() {
    await files.discard();
    router.push(listUrl);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    await files.settle();
    const clean: Unit = {
      ...unitRef.current,
      title: unitRef.current.title.trim(),
      purpose: unitRef.current.purpose.trim(),
      description: unitRef.current.description.trim(),
      attachments: files.attachments,
    };
    const invalid = validateUnit(clean);
    setError(invalid ?? "");
    if (invalid) return;
    setSaving(true);
    try {
      const ok = await updateUnits((f) => upsertUnit(f, clean), { year });
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        return;
      }
      await files.commit(clean.attachments);
      router.push(`/unidades/?aula=${clean.classroomId}&bim=${clean.periodId}`);
    } finally {
      setSaving(false);
    }
  }

  const sessionCount = sessions.length;
  const deleteFiles = existing ? [...new Set([...unitFilePaths(units, existing.id), ...files.addedPaths()])] : [];

  async function onDelete() {
    if (deletingRef.current || busy || !existing) return;
    deletingRef.current = true;
    setSaving(true);
    try {
      const paths = [...new Set([...unitFilePaths(units, existing.id), ...files.addedPaths()])];
      const ok = await updateUnits((f) => removeUnit(f, existing.id), { year });
      if (!ok) {
        if (currentYearRef.current !== year) setError(YEAR_CHANGED);
        return;
      }
      await files.removeFiles(paths);
      router.push(listUrl);
    } finally {
      deletingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="max-w-2xl space-y-5">
      <Link
        href={listUrl}
        className="underline"
        aria-disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          if (!busy) void onCancel();
        }}
      >
        Volver a Unidades
      </Link>
      <h1 className="text-2xl font-semibold">{existing ? "Editar unidad" : "Nueva unidad"}</h1>

      {existing ? (
        <p className="text-muted">
          {classroomLabel(classroom)} · {yearData.periods.find((p) => p.id === unit.periodId)?.name ?? unit.periodId}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <label className="block space-y-1">
            <span>Aula</span>
            <select
              className="field"
              value={unit.classroomId}
              onChange={(e) => patch({ classroomId: e.target.value, competencyIds: [], performances: [] })}
            >
              {yearData.classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {classroomLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>Bimestre</span>
            <select className="field" value={unit.periodId} onChange={(e) => patch({ periodId: e.target.value as Period["id"] })}>
              {PERIOD_IDS.map((id) => (
                <option key={id} value={id}>
                  {yearData.periods.find((p) => p.id === id)?.name ?? id}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label className="block space-y-1">
        <span>Tipo</span>
        <select className="field" value={unit.kind} onChange={(e) => patch({ kind: e.target.value as Unit["kind"] })}>
          {UNIT_KINDS.map((k) => (
            <option key={k} value={k}>
              {UNIT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span>Título</span>
        <input ref={titleRef} className="field" value={unit.title} onChange={(e) => patch({ title: e.target.value })} />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="block space-y-1">
          <span>Inicio</span>
          <input className="field" type="date" value={unit.start ?? ""} onChange={(e) => patch({ start: e.target.value || undefined })} />
        </label>
        <label className="block space-y-1">
          <span>Fin</span>
          <input className="field" type="date" value={unit.end ?? ""} onChange={(e) => patch({ end: e.target.value || undefined })} />
        </label>
      </div>

      <label className="block space-y-1">
        <span>Propósito</span>
        <textarea className="field" rows={3} value={unit.purpose} onChange={(e) => patch({ purpose: e.target.value })} />
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
                  <input
                    type="checkbox"
                    checked={unit.competencyIds.includes(c.id)}
                    onChange={() => toggleCompetency(c.id)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
          </div>
        ))}
      </fieldset>

      {unit.competencyIds.length > 0 && (
        <fieldset className="space-y-4">
          <legend>Desempeños (opcional)</legend>
          {unit.competencyIds.map((id) => (
            <div key={id} className="space-y-2">
              <p className="font-medium">{getCompetencies(classroom.cycle).find((c) => c.id === id)?.shortName ?? id}</p>
              <PerformancePicker
                classroom={classroom}
                students={students}
                competencyId={id}
                date={unit.start ?? todayISO()}
                schoolYear={year}
                selected={unit.performances.filter((p) => p.competencyId === id)}
                onChange={(next) => setPerformances(id, next)}
              />
            </div>
          ))}
        </fieldset>
      )}

      <label className="block space-y-1">
        <span>Descripción</span>
        <textarea className="field" rows={4} value={unit.description} onChange={(e) => patch({ description: e.target.value })} />
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

      {existing && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sesiones</h2>
          {sessions.length === 0 ? (
            <p className="text-muted">Aún no hay sesiones en esta unidad.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  {dirty ? (
                    <span aria-disabled="true" className="card block p-3 opacity-60">
                      {s.date} · {s.title || "Sin título"}
                    </span>
                  ) : (
                    <Link href={`/unidades/sesion/?id=${s.id}`} className="card block p-3">
                      {s.date} · {s.title || "Sin título"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {dirty ? (
            <>
              <button type="button" className="btn-secondary" disabled>
                Nueva sesión
              </button>
              <p className="text-sm text-muted">Guarda la unidad antes de abrir sesiones.</p>
            </>
          ) : (
            <Link href={`/unidades/sesion/?unidad=${existing.id}`} className="btn-secondary">
              Nueva sesión
            </Link>
          )}
        </section>
      )}

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
            Eliminar unidad
          </button>
        )}
      </div>

      {existing && confirmDelete && (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="card space-y-3 p-4">
          <p>
            Se eliminarán la unidad, {plural(sessionCount, "sesión", "sesiones")} y {plural(deleteFiles.length, "archivo", "archivos")}. No se
            puede deshacer.
          </p>
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
