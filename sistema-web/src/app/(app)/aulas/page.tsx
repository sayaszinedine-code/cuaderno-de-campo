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

type Update = (fn: (d: YearData) => YearData) => Promise<void>;

/** Runs a pure change against the latest data; reports the Spanish error instead of saving on failure. */
async function applyChange(update: Update, change: (d: YearData) => YearData): Promise<string> {
  let error = "";
  await update((d) => {
    try {
      return change(d);
    } catch (e) {
      error = errorText(e);
      return d;
    }
  });
  return error;
}

function CreateClassroom({ update }: { update: Update }) {
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState<Cycle>("II");
  const [bands, setBands] = useState<AgeBand[]>([]);
  const [error, setError] = useState("");

  const toggle = (b: AgeBand) => setBands((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const msg = await applyChange(update, (d) => createClassroom(d, { name, cycle, bands }));
    setError(msg);
    if (!msg) {
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
  const optional = getCompetencies(classroom.cycle).filter((c) => c.optional);

  async function run(change: (d: YearData) => YearData): Promise<boolean> {
    const msg = await applyChange(update, change);
    setError(msg);
    setSaved(!msg);
    return !msg;
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
                onChange={() => void run((d) => updateClassroom(d, classroom.id, { cycleIGrading: value }))}
              />
              {label}
            </label>
          ))}
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
        disabled={hasStudents}
        onClick={async () => {
          if (await run((d) => deleteClassroom(d, classroom.id))) onDeleted();
        }}
      >
        Eliminar aula
      </button>
      {hasStudents && <p className="text-sm text-muted">Un aula con niños registrados no se puede eliminar.</p>}
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
    const msg = await applyChange(update, (d) => updatePeriods(d, draft));
    setError(msg);
    setSaved(!msg);
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
