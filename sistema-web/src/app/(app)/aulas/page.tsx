"use client";

import { useState, type FormEvent } from "react";
import {
  bandLabel,
  classroomLabel,
  createClassroom,
  deleteClassroom,
  updateClassroom,
  updatePeriods,
} from "@/domain/classrooms";
import type { Classroom, Period, YearData } from "@/domain/schema";
import { CYCLE_BANDS, getCompetencies, type AgeBand, type Cycle } from "@/curriculum";
import { countStoredLevels, stripLevelsForDescriptive } from "@/domain/grades";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "No se pudo completar la acción.";
}

export default function AulasPage() {
  const { yearData, update } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Aulas</h1>
      {yearData.classrooms.length === 0 ? (
        <p>Todavía no tienes aulas. Crea la primera aquí abajo.</p>
      ) : (
        <ul className="space-y-3">
          {yearData.classrooms.map((c) => (
            <li key={c.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{classroomLabel(c)}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-expanded={editing === c.id}
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                >
                  {editing === c.id ? "Cerrar" : "Editar"}
                </button>
              </div>
              {editing === c.id && (
                <EditClassroom
                  classroom={c}
                  hasStudents={yearData.students.some((s) => s.classroomId === c.id)}
                  update={update}
                  onDeleted={() => setEditing(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateClassroom update={update} />
      <PeriodsSection key={yearData.schoolYear} periods={yearData.periods} update={update} />
    </div>
  );
}

type Update = (fn: (d: YearData) => YearData) => Promise<boolean>;

/**
 * Runs a pure change against the latest data. `error` is the Spanish validation message (nothing is saved);
 * `saved` is true only when the change was written to disk (a save failure shows the provider's banner).
 */
async function applyChange(
  update: Update,
  change: (d: YearData) => YearData,
): Promise<{ error: string; saved: boolean }> {
  let error = "";
  const saved = await update((d) => {
    try {
      return change(d);
    } catch (e) {
      error = errorText(e);
      throw e;
    }
  });
  return { error, saved };
}

function CreateClassroom({ update }: { update: Update }) {
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState<Cycle>("II");
  const [bands, setBands] = useState<AgeBand[]>([]);
  const [error, setError] = useState("");

  const toggle = (b: AgeBand) => setBands((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error: msg, saved } = await applyChange(update, (d) => createClassroom(d, { name, cycle, bands }));
    setError(msg);
    if (saved) {
      setName("");
      setBands([]);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <h2 className="text-lg font-semibold">Crear aula</h2>
      <label className="block space-y-1">
        <span>Nombre del aula</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span>Ciclo</span>
        <select
          className="field"
          value={cycle}
          onChange={(e) => {
            setCycle(e.target.value as Cycle);
            setBands([]);
          }}
        >
          <option value="I">Ciclo I</option>
          <option value="II">Ciclo II</option>
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend>Edades (si eliges varias, el aula es multiedad)</legend>
        <div className="flex flex-wrap gap-4">
          {CYCLE_BANDS[cycle].map((b) => (
            <label key={b} className="flex items-center gap-2">
              <input type="checkbox" checked={bands.includes(b)} onChange={() => toggle(b)} />
              {bandLabel(b)}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary">
        Crear aula
      </button>
    </form>
  );
}

function EditClassroom({
  classroom,
  hasStudents,
  update,
  onDeleted,
}: {
  classroom: Classroom;
  hasStudents: boolean;
  update: Update;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(classroom.name);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const { updateGrades, year, grades, notes, units, yearData } = useWorkspace();
  /** Number of stored levels waiting for the teacher's confirmation before going descriptive. */
  const [pendingStrip, setPendingStrip] = useState<number | null>(null);
  const hasRecords = units.units.some((u) => u.classroomId === classroom.id) || notes.some((n) => n.classroomId === classroom.id);
  const optional = getCompetencies(classroom.cycle).filter((c) => c.optional);

  async function run(change: (d: YearData) => YearData): Promise<boolean> {
    const { error: msg, saved: ok } = await applyChange(update, change);
    setError(msg);
    setSaved(ok);
    return ok;
  }

  /** Saves the grading mode; going descriptive also drops this classroom's stored levels (kept conclusions). */
  async function setGrading(value: Classroom["cycleIGrading"]) {
    let changed: YearData | null = null;
    const ok = await run((d) => (changed = updateClassroom(d, classroom.id, { cycleIGrading: value })));
    const next = changed as YearData | null;
    if (!ok || value !== "descriptive" || !next) return;
    const room = next.classrooms.find((c) => c.id === classroom.id);
    if (!room) return;
    const stripped = await updateGrades((f) => stripLevelsForDescriptive(f, room, next.students), { year });
    if (!stripped) {
      setSaved(false);
      setError("No se pudieron quitar los niveles. Intenta de nuevo.");
    }
  }

  /** Radio change: going descriptive with stored levels asks first; everything else applies right away. */
  function chooseGrading(value: Classroom["cycleIGrading"]) {
    if (value === "descriptive" && classroom.cycleIGrading !== "descriptive") {
      const count = countStoredLevels(grades, classroom.id, yearData.students);
      if (count > 0) {
        setPendingStrip(count);
        return;
      }
    }
    void setGrading(value);
  }

  const toggleCompetency = (id: string, enabled: boolean) =>
    run((d) => {
      const current = d.classrooms.find((c) => c.id === classroom.id)?.disabledCompetencyIds ?? [];
      const disabled = enabled ? current.filter((x) => x !== id) : [...current, id];
      return updateClassroom(d, classroom.id, { disabledCompetencyIds: disabled });
    });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run((d) => updateClassroom(d, classroom.id, { name }));
        }}
      >
        <label className="block flex-1 space-y-1">
          <span>Nombre del aula</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary">
          Guardar nombre
        </button>
      </form>

      {optional.length > 0 && (
        <fieldset className="space-y-2">
          <legend>Competencias opcionales de esta aula</legend>
          {optional.map((c) => (
            <label key={c.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={!classroom.disabledCompetencyIds.includes(c.id)}
                onChange={(e) => void toggleCompetency(c.id, e.target.checked)}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {classroom.cycle === "I" && (
        <fieldset className="space-y-2">
          <legend>Calificación del ciclo I</legend>
          {(
            [
              ["descriptive", "Solo conclusión descriptiva"],
              ["scale", "AD, A, B, C y conclusión"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name={`grading-${classroom.id}`}
                checked={classroom.cycleIGrading === value}
                onChange={() => chooseGrading(value)}
              />
              {label}
            </label>
          ))}
          {pendingStrip !== null && (
            <div role="alertdialog" aria-label="Confirmar cambio" className="space-y-2 rounded-xl bg-danger-soft p-3">
              <p>{`Se quitarán ${pendingStrip} niveles AD/A/B/C guardados de esta aula. Las conclusiones se conservan. No se puede deshacer.`}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setPendingStrip(null);
                    void setGrading("descriptive");
                  }}
                >
                  Sí, cambiar
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPendingStrip(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3">
          {error}
        </p>
      )}
      {saved && !error && <p role="status">Cambios guardados.</p>}

      <button
        type="button"
        className="btn-secondary"
        disabled={hasStudents || hasRecords}
        onClick={async () => {
          if (await run((d) => deleteClassroom(d, classroom.id, { units: units.units, notes }))) onDeleted();
        }}
      >
        Eliminar aula
      </button>
      {hasStudents && <p className="text-sm text-muted">Un aula con niños registrados no se puede eliminar.</p>}
      {!hasStudents && hasRecords && (
        <p className="text-sm text-muted">No puedes eliminar un aula con unidades o registros del cuaderno.</p>
      )}
    </div>
  );
}

function PeriodsSection({ periods, update }: { periods: Period[]; update: Update }) {
  const [draft, setDraft] = useState<Period[]>(periods);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (i: number, key: "start" | "end", value: string) => {
    setSaved(false);
    setDraft((cur) => cur.map((p, j) => (j === i ? { ...p, [key]: value } : p)));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error: msg, saved: ok } = await applyChange(update, (d) => updatePeriods(d, draft));
    setError(msg);
    setSaved(ok);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <h2 className="text-lg font-semibold">Bimestres</h2>
      {draft.map((p, i) => (
        <div key={p.id} className="flex flex-wrap items-end gap-3">
          <span className="w-28 font-medium">{p.name}</span>
          <label className="space-y-1">
            <span className="block text-sm">Inicio del bimestre {i + 1}</span>
            <input className="field" type="date" value={p.start} onChange={(e) => set(i, "start", e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="block text-sm">Fin del bimestre {i + 1}</span>
            <input className="field" type="date" value={p.end} onChange={(e) => set(i, "end", e.target.value)} />
          </label>
        </div>
      ))}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3">
          {error}
        </p>
      )}
      {saved && <p role="status">Bimestres guardados.</p>}
      <button type="submit" className="btn-primary">
        Guardar bimestres
      </button>
    </form>
  );
}
