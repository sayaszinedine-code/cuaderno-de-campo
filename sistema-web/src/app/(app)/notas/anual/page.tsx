"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_AI_SETTINGS, loadAiSettings, type AiSettings } from "@/ai/settings";
import { useAccount } from "@/components/AccountGate";
import { activeCompetencies, classroomLabel } from "@/domain/classrooms";
import { clearFinalOverride, finalOf, gradeOf, isAutomaticFinal, setFinalOverride, usesScale } from "@/domain/grades";
import { filterNotes } from "@/domain/notes";
import { type Level, type Period, type Student } from "@/domain/schema";
import { AiConclusion } from "@/grades/AiConclusion";
import { EvidenceList } from "@/grades/EvidenceList";
import { GradeCellEditor, type GradeFormValues } from "@/grades/GradeCellEditor";
import { useIsMobile } from "@/grades/useIsMobile";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];

const BADGE: Record<Level, string> = {
  AD: "bg-success text-primary-foreground",
  A: "bg-success-soft text-success-foreground",
  B: "bg-warning-soft text-warning-foreground",
  C: "bg-attention-soft text-attention-foreground",
};

const fullName = (s: Student) => `${s.firstNames} ${s.lastNames}`.trim();

function Badge({ level }: { level: Level }) {
  return <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${BADGE[level]}`}>{level}</span>;
}

/** Level badge (scale) or clamped conclusion (descriptive), or a dash when empty. */
function Value({ level, conclusion, scale }: { level?: Level; conclusion: string; scale: boolean }) {
  if (scale) return level ? <Badge level={level} /> : <span aria-hidden="true">—</span>;
  return conclusion.trim() !== "" ? (
    <span className="line-clamp-2 max-w-40 text-left text-sm">{conclusion}</span>
  ) : (
    <span aria-hidden="true">—</span>
  );
}

export default function AnualPage() {
  const { storage, yearData, notes, grades, updateGrades, year } = useWorkspace();
  const mobile = useIsMobile();
  const { profile } = useAccount();
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  useEffect(() => {
    setAiSettings(loadAiSettings(profile.id));
  }, [profile.id]);

  /** `null` until the query string has been read. */
  const [params, setParams] = useState<{ aula: string | null; nino: string | null } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ aula: q.get("aula"), nino: q.get("nino") });
  }, []);
  const [open, setOpen] = useState<{ competencyId: string; opener: HTMLElement | null; year: number } | null>(null);
  const [message, setMessage] = useState("");

  const classroom = params
    ? params.aula
      ? yearData.classrooms.find((c) => c.id === params.aula)
      : yearData.classrooms[0]
    : undefined;
  const classStudents = useMemo(
    () => (classroom ? yearData.students.filter((s) => s.classroomId === classroom.id && s.active) : []),
    [classroom, yearData.students],
  );
  const student = classroom
    ? params?.nino
      ? yearData.students.find((s) => s.id === params.nino && s.classroomId === classroom.id)
      : classStudents[0]
    : undefined;
  /** Navigable children: the active ones, plus an archived child opened by link. */
  const navStudents = student && !classStudents.some((s) => s.id === student.id) ? [...classStudents, student] : classStudents;
  const competencies = useMemo(() => (classroom ? activeCompetencies(classroom) : []), [classroom]);

  if (!params) return null;
  if (yearData.classrooms.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Notas del año</h1>
        <p>Primero crea un aula en «Aulas».</p>
      </div>
    );
  }
  if (!classroom || (!student && params.nino)) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Notas del año</h1>
        <p>No encontramos a ese niño o niña.</p>
        <Link className="underline" href="/notas/">
          Volver a Notas
        </Link>
      </div>
    );
  }
  if (!student) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Notas del año</h1>
        <p>Esta aula no tiene niños activos. Agrégalos en «Niños».</p>
        <Link className="underline" href="/notas/">
          Volver a Notas
        </Link>
      </div>
    );
  }

  const scale = usesScale(classroom);
  const index = navStudents.findIndex((s) => s.id === student.id);

  const go = (aula: string, nino: string | null) => {
    window.history.replaceState(null, "", `/notas/anual/?aula=${encodeURIComponent(aula)}${nino ? `&nino=${encodeURIComponent(nino)}` : ""}`);
    setParams({ aula, nino });
    setOpen(null);
    setMessage("");
  };
  const goStudent = (i: number) => {
    const s = navStudents[i];
    if (s) go(classroom.id, s.id);
  };
  const changeClassroom = (id: string) => {
    const first = yearData.students.find((s) => s.classroomId === id && s.active);
    go(id, first?.id ?? null);
  };

  const openComp = open ? competencies.find((c) => c.id === open.competencyId) : undefined;
  const openFinal = openComp ? finalOf(grades, student.id, openComp.id, classroom) : undefined;
  const openNotes = openComp
    ? filterNotes(notes, {
        studentId: student.id,
        competencyId: openComp.id,
        periods: yearData.periods,
        students: yearData.students,
      })
    : [];

  const saveFinal = async (values: GradeFormValues): Promise<boolean> => {
    if (!openComp) return false;
    if (!open) return false;
    const input = { studentId: student.id, competencyId: openComp.id, ...values };
    if (openFinal?.source === "auto" && isAutomaticFinal(grades, input, classroom)) {
      // Same as the automatic value: nothing to override, nothing to write.
      setOpen(null);
      return true;
    }
    const ok = await updateGrades((f) => setFinalOverride(f, input, classroom), { year: open.year });
    if (ok) {
      setOpen(null);
      setMessage("Nota final guardada.");
    }
    return ok;
  };
  const resetFinal = async (): Promise<boolean> => {
    if (!openComp || !open) return false;
    const ok = await updateGrades((f) => clearFinalOverride(f, student.id, openComp.id), { year: open.year });
    if (ok) {
      setOpen(null);
      setMessage("Volvió al automático.");
    }
    return ok;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{`Notas del año — ${fullName(student)}`}</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <label>
          Aula
          <select className="field" value={classroom.id} onChange={(e) => changeClassroom(e.target.value)}>
            {yearData.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {classroomLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Niño o niña
          <select className="field" value={student.id} onChange={(e) => go(classroom.id, e.target.value)}>
            {navStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={index <= 0} onClick={() => goStudent(index - 1)}>
          Anterior
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={index < 0 || index >= navStudents.length - 1}
          onClick={() => goStudent(index + 1)}
        >
          Siguiente
        </button>
        <Link className="underline" href="/notas/">
          Volver a Notas
        </Link>
      </div>
      <p role="status" className="min-h-6 text-sm">
        {message}
      </p>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Competencia
              </th>
              {PERIOD_IDS.map((id) => (
                <th key={id} scope="col" className="px-2 py-1 font-medium" title={yearData.periods.find((p) => p.id === id)?.name}>
                  {id}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 font-medium">
                Final
              </th>
            </tr>
          </thead>
          <tbody>
            {competencies.map((c) => {
              const fin = finalOf(grades, student.id, c.id, classroom);
              const origin = fin.source === "override" ? "ajustado" : fin.fromPeriodId ? `auto (de ${fin.fromPeriodId})` : "";
              const empty = !fin.level && fin.conclusion.trim() === "";
              return (
                <tr key={c.id}>
                  <th scope="row" title={c.name} className="px-2 py-1 text-left font-medium">
                    {c.name}
                  </th>
                  {PERIOD_IDS.map((pid) => {
                    const e = gradeOf(grades, student.id, c.id, pid);
                    return (
                      <td key={pid} className="border-b border-border px-2 py-1 text-center">
                        <Value level={e?.level} conclusion={e?.conclusion ?? ""} scale={scale} />
                      </td>
                    );
                  })}
                  <td className="border-b border-border p-0 text-center">
                    <button
                      type="button"
                      aria-label={`${c.name} — Final: ${empty ? "sin nota" : origin}`}
                      className="min-h-11 w-full min-w-28 px-2 hover:bg-accent-soft"
                      onClick={(e) => {
                        setMessage("");
                        setOpen({ competencyId: c.id, opener: e.currentTarget, year });
                      }}
                    >
                      <span className="flex flex-col items-center gap-0.5">
                        <Value level={fin.level} conclusion={fin.conclusion} scale={scale} />
                        {origin && <span className="text-xs text-muted">{origin}</span>}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && openComp && openFinal && (
        <GradeCellEditor
          key={`${classroom.id}-${student.id}-${openComp.id}-final`}
          studentName={fullName(student)}
          competencyName={`${openComp.name} — Final`}
          scale={scale}
          mobile={mobile}
          initial={{ level: openFinal.level, conclusion: openFinal.conclusion }}
          evidence={
            <EvidenceList
              title="Evidencias del año"
              emptyHint="Aún no hay registros del cuaderno para esta competencia este año."
              notes={openNotes}
              students={yearData.students}
              storage={storage}
            />
          }
          opener={open.opener}
          onSave={saveFinal}
          onReset={openFinal.source === "override" ? resetFinal : undefined}
          onClose={() => setOpen(null)}
        >
          {({ values, setConclusion }) => (
            <AiConclusion
              settings={aiSettings}
              competencyId={openComp.id}
              competencyName={openComp.name}
              level={values.level}
              notes={openNotes}
              yearStudents={yearData.students}
              current={values.conclusion}
              onUse={setConclusion}
            />
          )}
        </GradeCellEditor>
      )}
    </div>
  );
}
