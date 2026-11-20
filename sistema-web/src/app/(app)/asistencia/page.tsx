"use client";

import { useMemo, useState } from "react";
import { markAllPresent, markOf, setMark, summary } from "@/domain/attendance";
import { classroomLabel, todayISO } from "@/domain/classrooms";
import { periodOf } from "@/domain/notes";
import { ATTENDANCE_LABELS, ATTENDANCE_MARKS, type AttendanceMark, type Period, type Student } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];
const fullName = (s: Student) => `${s.firstNames} ${s.lastNames}`.trim();
const pctText = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

/** Last day of a `YYYY-MM` month as `YYYY-MM-DD`. */
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

type Tab = "dia" | "resumen";

export default function AsistenciaPage() {
  const { yearData, attendance, updateAttendance, year } = useWorkspace();
  const [tab, setTab] = useState<Tab>("dia");
  const [classroomPick, setClassroomPick] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [pinnedYear, setPinnedYear] = useState(year);
  /** Marks shown before the save finishes; `null` is an optimistic removal. */
  const [optimistic, setOptimistic] = useState<Record<string, AttendanceMark | null>>({});
  const [monthPick, setMonthPick] = useState("");
  const [periodPick, setPeriodPick] = useState<Period["id"] | null>(null);

  const classroom = yearData.classrooms.find((c) => c.id === classroomPick) ?? yearData.classrooms[0];
  const students = useMemo(
    () => (classroom ? yearData.students.filter((s) => s.classroomId === classroom.id && s.active) : []),
    [classroom, yearData.students],
  );

  if (!classroom) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Asistencia</h1>
        <p>Primero crea un aula en «Aulas».</p>
      </div>
    );
  }

  const markShown = (studentId: string): AttendanceMark | undefined => {
    if (studentId in optimistic) return optimistic[studentId] ?? undefined;
    return markOf(attendance, classroom.id, date, studentId);
  };

  const dayPeriod = periodOf(date, yearData.periods);
  const month = monthPick || date.slice(0, 7);
  const periodId = periodPick ?? dayPeriod ?? "B1";
  const period = yearData.periods.find((p) => p.id === periodId);

  const resetDay = () => {
    setOptimistic({});
    setPinnedYear(year);
  };

  const commit = async (
    shown: Record<string, AttendanceMark | null>,
    fn: (f: typeof attendance) => typeof attendance,
  ) => {
    setOptimistic((o) => ({ ...o, ...shown }));
    const ok = await updateAttendance(fn, { year: pinnedYear });
    // Success: the stored file now has the marks. Failure: drop the overlay to show the previous ones.
    setOptimistic((o) => {
      const next = { ...o };
      for (const id of Object.keys(shown)) if (next[id] === shown[id]) delete next[id];
      return next;
    });
    return ok;
  };

  const toggle = (studentId: string, mark: AttendanceMark) => {
    const next = markShown(studentId) === mark ? null : mark;
    void commit({ [studentId]: next }, (f) => setMark(f, classroom.id, date, studentId, next));
  };

  const allPresent = () => {
    const shown: Record<string, AttendanceMark | null> = {};
    for (const s of students) if (markShown(s.id) === undefined) shown[s.id] = "P";
    if (Object.keys(shown).length === 0) return;
    void commit(shown, (f) => markAllPresent(f, classroom.id, date, students.map((s) => s.id)));
  };

  const counts = { P: 0, T: 0, F: 0, J: 0, none: 0 };
  for (const s of students) {
    const m = markShown(s.id);
    if (m) counts[m]++;
    else counts.none++;
  }

  const monthSummary = (studentId: string) => summary(attendance, { classroomId: classroom.id, studentId, ...monthRange(month) });
  const periodSummary = (studentId: string) =>
    summary(attendance, { classroomId: classroom.id, studentId, from: period?.start ?? "", to: period?.end ?? "" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Asistencia</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <label>
          Aula
          <select
            className="field"
            value={classroom.id}
            onChange={(e) => {
              setClassroomPick(e.target.value);
              resetDay();
            }}
          >
            {yearData.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {classroomLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            type="date"
            className="field"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setMonthPick("");
              resetDay();
            }}
          />
        </label>
      </div>

      <div role="tablist" aria-label="Vista de asistencia" className="flex gap-2">
        {(["dia", "resumen"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`min-h-11 rounded-md border border-border px-4 font-medium ${tab === t ? "bg-accent-soft" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "dia" ? "Día" : "Resumen"}
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <p>Esta aula no tiene niños activos. Agrégalos en «Niños».</p>
      ) : tab === "dia" ? (
        <section className="space-y-3" aria-label="Asistencia del día">
          {dayPeriod === null && <p role="note">Esta fecha está fuera de los bimestres del año.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn min-h-11 rounded-md border border-border px-4 font-medium" onClick={allPresent}>
              Todos presentes
            </button>
            <p aria-label="Contadores del día" className="text-sm">
              {`Presentes: ${counts.P} · Tardanzas: ${counts.T} · Faltas: ${counts.F} · Justificadas: ${counts.J} · Sin marcar: ${counts.none}`}
            </p>
          </div>
          <ul className="space-y-2">
            {students.map((s) => {
              const current = markShown(s.id);
              return (
                <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="font-medium">{fullName(s)}</span>
                  <span className="flex gap-2">
                    {ATTENDANCE_MARKS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={current === m}
                        aria-label={`${fullName(s)}: ${ATTENDANCE_LABELS[m]}`}
                        title={ATTENDANCE_LABELS[m]}
                        className={`min-h-11 min-w-11 rounded-md border border-border font-semibold ${current === m ? "bg-accent-soft ring-2 ring-current" : ""}`}
                        onClick={() => toggle(s.id, m)}
                      >
                        {m}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="space-y-3" aria-label="Resumen de asistencia">
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <label>
              Mes
              <input type="month" className="field" value={month} onChange={(e) => e.target.value && setMonthPick(e.target.value)} />
            </label>
            <label>
              Bimestre
              <select className="field" value={periodId} onChange={(e) => setPeriodPick(e.target.value as Period["id"])}>
                {PERIOD_IDS.map((id) => (
                  <option key={id} value={id}>
                    {yearData.periods.find((p) => p.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} scope="col" className="px-2 text-left">Niño o niña</th>
                  <th colSpan={5} scope="colgroup" className="px-2">Mes</th>
                  <th colSpan={5} scope="colgroup" className="px-2">Bimestre</th>
                </tr>
                <tr>
                  {["P", "T", "F", "J", "%", "P", "T", "F", "J", "%"].map((h, i) => (
                    <th key={i} scope="col" className="px-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const m = monthSummary(s.id);
                  const p = periodSummary(s.id);
                  return (
                    <tr key={s.id}>
                      <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium">{fullName(s)}</th>
                      {[m, p].flatMap((r, k) => [
                        <td key={`${k}P`} className="px-2 text-center">{r.P}</td>,
                        <td key={`${k}T`} className="px-2 text-center">{r.T}</td>,
                        <td key={`${k}F`} className="px-2 text-center">{r.F}</td>,
                        <td key={`${k}J`} className="px-2 text-center">{r.J}</td>,
                        <td key={`${k}%`} className="px-2 text-center font-medium">{pctText(r.pct)}</td>,
                      ])}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
