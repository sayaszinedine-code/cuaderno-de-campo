"use client";

import { useEffect, useMemo, useState } from "react";
import { areaIdFor } from "@/curriculum";
import { areaName } from "@/domain/areas";
import { classroomLabel, todayISO } from "@/domain/classrooms";
import { evidenceFor, gradeTable, progress, setGrade, usesScale } from "@/domain/grades";
import { periodOf } from "@/domain/notes";
import { LEVELS, type GradeEntry, type Period, type Student } from "@/domain/schema";
import { EvidenceList } from "@/grades/EvidenceList";
import { GradeCellEditor, type GradeFormValues } from "@/grades/GradeCellEditor";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];

const BADGE: Record<(typeof LEVELS)[number], string> = {
  AD: "bg-success text-primary-foreground",
  A: "bg-success-soft text-success-foreground",
  B: "bg-warning-soft text-warning-foreground",
  C: "bg-attention-soft text-attention-foreground",
};

const fullName = (s: Student) => `${s.firstNames} ${s.lastNames}`.trim();

/** Header-friendly competency name: up to the first comma, trimmed to 40 characters. */
function shortName(name: string): string {
  const head = name.split(",")[0].trim();
  return head.length > 40 ? `${head.slice(0, 39).trimEnd()}…` : head;
}

const QUERY = "(max-width: 767px)";

/** True on phone-width screens; updates when the viewport crosses the breakpoint. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    setMobile(mq.matches);
    const on = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

function cellText(e: GradeEntry | undefined, scale: boolean): string {
  if (scale) return e?.level ?? "sin nota";
  return e && e.conclusion.trim() !== "" ? "con conclusión" : "sin nota";
}

function CellContent({ entry, scale }: { entry: GradeEntry | undefined; scale: boolean }) {
  const hasText = !!entry && entry.conclusion.trim() !== "";
  return (
    <span className="flex items-center justify-center gap-1">
      {scale ? (
        entry?.level ? (
          <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${BADGE[entry.level]}`}>{entry.level}</span>
        ) : (
          <span aria-hidden="true">—</span>
        )
      ) : hasText ? (
        <span className="line-clamp-2 max-w-40 text-left text-sm">{entry?.conclusion}</span>
      ) : (
        <span aria-hidden="true">—</span>
      )}
      {scale && hasText && <span aria-hidden="true" title="Tiene conclusión">✎</span>}
    </span>
  );
}

export default function NotasPage() {
  const { storage, yearData, notes, grades, updateGrades, year } = useWorkspace();
  const mobile = useIsMobile();
  const [classroomPick, setClassroomPick] = useState("");
  const [periodPick, setPeriodPick] = useState<Period["id"] | null>(null);
  const [open, setOpen] = useState<{ studentId: string; competencyId: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const classroom = yearData.classrooms.find((c) => c.id === classroomPick) ?? yearData.classrooms[0];
  const periodId = periodPick ?? periodOf(todayISO(), yearData.periods) ?? "B1";

  const table = useMemo(
    () => (classroom ? gradeTable({ file: grades, classroom, students: yearData.students, periodId }) : null),
    [grades, classroom, yearData.students, periodId],
  );
  const groups = useMemo(() => {
    if (!table || !classroom) return [];
    const out: { area: string; count: number }[] = [];
    for (const c of table.competencies) {
      const area = areaName(areaIdFor(c, classroom.cycle)) ?? "";
      const last = out[out.length - 1];
      if (last && last.area === area) last.count++;
      else out.push({ area, count: 1 });
    }
    return out;
  }, [table, classroom]);

  if (!classroom || !table) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Notas</h1>
        <p>Primero crea un aula en «Aulas».</p>
      </div>
    );
  }

  const scale = usesScale(classroom);
  const prog = progress(grades, { classroom, students: yearData.students, periodId });
  const openStudent = open ? table.students.find((s) => s.id === open.studentId) : undefined;
  const openComp = open ? table.competencies.find((c) => c.id === open.competencyId) : undefined;
  const openEntry = open ? table.cell(open.studentId, open.competencyId) : undefined;

  const label = (s: Student, compName: string, e: GradeEntry | undefined) =>
    `${fullName(s)} — ${compName}: ${cellText(e, scale)}`;

  const save = async (values: GradeFormValues): Promise<boolean> => {
    if (!open) return false;
    const input = { studentId: open.studentId, competencyId: open.competencyId, periodId, ...values };
    const ok = await updateGrades((f) => setGrade(f, input, classroom), { year });
    if (ok) {
      setOpen(null);
      setMessage("Nota guardada.");
    }
    return ok;
  };

  const choose = (studentId: string, competencyId: string) => {
    setMessage("");
    setOpen({ studentId, competencyId });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notas</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <label>
          Aula
          <select className="field" value={classroom.id} onChange={(e) => { setClassroomPick(e.target.value); setOpen(null); setExpanded(null); }}>
            {yearData.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {classroomLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bimestre
          <select className="field" value={periodId} onChange={(e) => { setPeriodPick(e.target.value as Period["id"]); setOpen(null); }}>
            {PERIOD_IDS.map((id) => (
              <option key={id} value={id}>
                {yearData.periods.find((p) => p.id === id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="font-medium">{`Calificado: ${prog.graded} de ${prog.total}`}</p>
      <p role="status" className="min-h-6 text-sm">
        {message}
      </p>

      {table.students.length === 0 ? (
        <p>Esta aula no tiene niños activos. Agrégalos en «Niños».</p>
      ) : mobile ? (
        <ul className="space-y-2">
          {table.students.map((s) => (
            <li key={s.id} className="card p-3">
              <button
                type="button"
                className="w-full text-left font-medium"
                aria-expanded={expanded === s.id}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                {fullName(s)}
              </button>
              {expanded === s.id && (
                <ul className="mt-2 space-y-2">
                  {table.competencies.map((c) => {
                    const e = table.cell(s.id, c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-label={label(s, c.name, e)}
                          className="card flex w-full items-center justify-between gap-2 p-3 text-left"
                          onClick={() => choose(s.id, c.id)}
                        >
                          <span className="text-sm">{shortName(c.name)}</span>
                          <CellContent entry={e} scale={scale} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background" rowSpan={2} scope="col">
                  Niño o niña
                </th>
                {groups.map((g) => (
                  <th key={g.area} colSpan={g.count} scope="colgroup" className="border-b border-border px-2 py-1">
                    {g.area}
                  </th>
                ))}
              </tr>
              <tr>
                {table.competencies.map((c) => (
                  <th key={c.id} scope="col" title={c.name} className="min-w-28 px-2 py-1 align-bottom font-medium">
                    {shortName(c.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.students.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-background px-2 py-1 text-left font-medium">
                    {fullName(s)}
                  </th>
                  {table.competencies.map((c) => {
                    const e = table.cell(s.id, c.id);
                    return (
                      <td key={c.id} className="border-b border-border p-0 text-center">
                        <button
                          type="button"
                          aria-label={label(s, c.name, e)}
                          className="min-h-11 w-full min-w-11 px-2 hover:bg-accent-soft"
                          onClick={() => choose(s.id, c.id)}
                        >
                          <CellContent entry={e} scale={scale} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && openStudent && openComp && (
        <GradeCellEditor
          key={`${classroom.id}-${open.studentId}-${open.competencyId}-${periodId}`}
          studentName={fullName(openStudent)}
          competencyName={openComp.name}
          scale={scale}
          mobile={mobile}
          initial={{ level: openEntry?.level, conclusion: openEntry?.conclusion ?? "" }}
          evidence={
            <EvidenceList
              notes={evidenceFor(notes, {
                studentId: open.studentId,
                competencyId: open.competencyId,
                periodId,
                periods: yearData.periods,
                students: yearData.students,
              })}
              students={yearData.students}
              storage={storage}
            />
          }
          onSave={save}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
