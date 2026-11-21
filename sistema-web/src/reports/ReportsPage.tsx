"use client";

import { useEffect, useRef, useState } from "react";
import { byStudentName, classroomLabel, todayISO } from "@/domain/classrooms";
import { periodOf } from "@/domain/notes";
import { classroomDir } from "@/domain/paths";
import type { Period, Student } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";
import { attendanceWorkbook, gradesWorkbook, saveReport } from "./excel";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];
const OPEN_REVOKE_DELAY_MS = 60_000;
const DOWNLOAD_REVOKE_DELAY_MS = 1000;

const RANGE_ERROR = "La fecha «Desde» no puede ser posterior a «Hasta».";
const PROFILE_NOTICE = "Completa tu perfil para que aparezca en los reportes.";

type Saved = { name: string; blob: Blob; skippedPhotos: number };
type CardState = { busy: boolean; error: string; saved: Saved | null };
type Built = { base: string; suffix?: string; blob: Blob; skippedPhotos?: number };
const IDLE: CardState = { busy: false, error: "", saved: null };

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), OPEN_REVOKE_DELAY_MS);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }
}

const fullName = (s: Pick<Student, "firstNames" | "lastNames">) => `${s.firstNames} ${s.lastNames}`.trim();

function ReportCard(props: { title: string; hint?: string; blocked?: string; state: CardState; onGenerate: () => void }) {
  const { title, hint, blocked, state, onGenerate } = props;
  return (
    <section className="card space-y-3 p-4" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {blocked && <p className="text-sm">{blocked}</p>}
      <button type="button" className="btn-primary" disabled={state.busy || Boolean(blocked)} onClick={onGenerate}>
        {state.busy ? "Generando…" : "Generar"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      )}
      {state.saved && (
        <div className="space-y-2">
          <p role="status" className="text-sm">{`Guardado en Reportes: ${state.saved.name}`}</p>
          {state.saved.skippedPhotos > 0 && (
            <p className="text-sm text-muted">
              {`${state.saved.skippedPhotos} foto(s) no se incluyeron (formato no compatible o archivo no encontrado).`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => state.saved && openBlob(state.saved.blob)}>
              Abrir
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => state.saved && downloadBlob(state.saved.blob, state.saved.name)}
            >
              Descargar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ReportsPage() {
  const { storage, year, yearData, profile, grades, attendance, notes } = useWorkspace();
  const [classroomPick, setClassroomPick] = useState("");
  const [periodPick, setPeriodPick] = useState<Period["id"] | null>(null);
  const [monthPick, setMonthPick] = useState("");
  const [gradesState, setGradesState] = useState<CardState>(IDLE);
  const [attendanceState, setAttendanceState] = useState<CardState>(IDLE);
  const [studentPick, setStudentPick] = useState("");
  const [fromPick, setFromPick] = useState("");
  const [toPick, setToPick] = useState("");
  const [portfolioState, setPortfolioState] = useState<CardState>(IDLE);
  const [progressState, setProgressState] = useState<CardState>(IDLE);
  const [notebookState, setNotebookState] = useState<CardState>(IDLE);
  const [seenYear, setSeenYear] = useState(year);
  const resetPdfCards = () => {
    setPortfolioState(IDLE);
    setProgressState(IDLE);
    setNotebookState(IDLE);
  };
  if (seenYear !== year) {
    // The open year changed: picks from the previous year no longer apply.
    setSeenYear(year);
    setMonthPick("");
    setPeriodPick(null);
    setGradesState(IDLE);
    setAttendanceState(IDLE);
    setStudentPick("");
    setFromPick("");
    setToPick("");
    resetPdfCards();
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const classroom = yearData.classrooms.find((c) => c.id === classroomPick) ?? yearData.classrooms[0];
  if (!classroom) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p>Primero crea un aula en «Aulas».</p>
      </div>
    );
  }

  const today = todayISO();
  const inYear = today.startsWith(`${year}-`);
  const periodId = periodPick ?? (inYear ? periodOf(today, yearData.periods) : null) ?? "B1";
  const period = yearData.periods.find((p) => p.id === periodId);
  const roomStudents = yearData.students
    .filter((s) => s.classroomId === classroom.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || byStudentName(a, b));
  const student = roomStudents.find((s) => s.id === studentPick) ?? roomStudents[0];
  const from = fromPick || (period?.start.startsWith(`${year}-`) ? period.start : `${year}-01-01`);
  const to = toPick || (period?.end.startsWith(`${year}-`) ? period.end : `${year}-12-31`);
  const noChildren = student ? undefined : "Primero agrega niños o niñas al aula.";
  const month = monthPick || (inYear ? today.slice(0, 7) : (yearData.periods[0]?.start.slice(0, 7) ?? `${year}-03`));

  async function run(
    set: (s: CardState) => void,
    ext: "xlsx" | "pdf",
    build: () => Promise<Built>,
  ): Promise<void> {
    set({ busy: true, error: "", saved: null });
    try {
      const { base, suffix, blob, skippedPhotos = 0 } = await build();
      const name = await saveReport(storage, classroomDir(year, classroom), base, ext, blob, new Date(), suffix);
      if (mounted.current) set({ busy: false, error: "", saved: { name, blob, skippedPhotos } });
    } catch {
      if (mounted.current) set({ busy: false, error: "No se pudo generar el reporte.", saved: null });
    }
  }

  const generateGrades = () =>
    void run(setGradesState, "xlsx", async () => ({
      base: `Registro de notas ${classroom.name}`,
      suffix: ` Bimestre ${periodId.slice(1)}`,
      blob: await gradesWorkbook({
        profile,
        classroom,
        students: yearData.students,
        period: { id: periodId, name: period?.name ?? `Bimestre ${periodId.slice(1)}` },
        grades,
      }),
    }));

  const generateAttendance = () =>
    void run(setAttendanceState, "xlsx", async () => ({
      base: `Asistencia ${classroom.name}`,
      suffix: ` ${month}`,
      blob: await attendanceWorkbook({ classroom, students: yearData.students, month, attendance }),
    }));

  /** Checks the date range; on error shows it in the card and returns false. */
  const validRange = (set: (s: CardState) => void) => {
    if (from <= to) return true;
    set({ busy: false, error: RANGE_ERROR, saved: null });
    return false;
  };

  const generatePortfolio = () => {
    if (!student || !validRange(setPortfolioState)) return;
    void run(setPortfolioState, "pdf", async () => {
      const { portfolioPdf } = await import("./pdf/generate");
      const r = await portfolioPdf({
        storage,
        profile,
        classroom,
        student,
        students: yearData.students,
        notes,
        periods: yearData.periods,
        from,
        to,
      });
      return { base: `Portafolio ${fullName(student)}`, suffix: ` ${from}_${to}`, ...r };
    });
  };

  const generateProgress = () => {
    if (!student) return;
    void run(setProgressState, "pdf", async () => {
      const { progressPdf } = await import("./pdf/generate");
      const r = await progressPdf({
        profile,
        classroom,
        student,
        period: period ?? { id: periodId, name: `Bimestre ${periodId.slice(1)}`, start: `${year}-01-01`, end: `${year}-12-31` },
        grades,
        attendance,
      });
      return { base: `Informe de progreso ${fullName(student)}`, suffix: ` Bimestre ${periodId.slice(1)}`, ...r };
    });
  };

  const generateNotebook = () => {
    if (!validRange(setNotebookState)) return;
    void run(setNotebookState, "pdf", async () => {
      const { notebookPdf } = await import("./pdf/generate");
      const r = await notebookPdf({ storage, profile, classroom, students: yearData.students, notes, year, from, to });
      return { base: `Cuaderno de campo ${classroom.name}`, suffix: ` ${from}_${to}`, ...r };
    });
  };

  const onDate = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    if (!e.target.value.startsWith(`${year}-`)) return;
    set(e.target.value);
    setPortfolioState(IDLE);
    setNotebookState(IDLE);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reportes</h1>
      {!profile && <p className="max-w-3xl rounded-xl bg-accent-soft p-3 text-sm">{PROFILE_NOTICE}</p>}
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <label>
          Aula
          <select
            className="field"
            value={classroom.id}
            onChange={(e) => {
              setClassroomPick(e.target.value);
              setStudentPick("");
              setGradesState(IDLE);
              setAttendanceState(IDLE);
              resetPdfCards();
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
          Bimestre
          <select
            className="field"
            value={periodId}
            onChange={(e) => {
              setPeriodPick(e.target.value as Period["id"]);
              setGradesState(IDLE);
              setProgressState(IDLE);
            }}
          >
            {PERIOD_IDS.map((id) => (
              <option key={id} value={id}>
                {yearData.periods.find((p) => p.id === id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mes
          <input
            type="month"
            className="field"
            value={month}
            min={`${year}-01`}
            max={`${year}-12`}
            onChange={(e) => {
              if (!e.target.value.startsWith(`${year}-`)) return;
              setMonthPick(e.target.value);
              setAttendanceState(IDLE);
            }}
          />
        </label>
      </div>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <ReportCard title="Registro de notas (Excel)" state={gradesState} onGenerate={generateGrades} />
        <ReportCard title="Asistencia del mes (Excel)" state={attendanceState} onGenerate={generateAttendance} />
      </div>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <label>
          Niño o niña
          <select
            className="field"
            value={student?.id ?? ""}
            disabled={!student}
            onChange={(e) => {
              setStudentPick(e.target.value);
              setPortfolioState(IDLE);
              setProgressState(IDLE);
            }}
          >
            {roomStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {`${fullName(s)}${s.active ? "" : " (archivado)"}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" className="field" value={from} min={`${year}-01-01`} max={`${year}-12-31`} onChange={onDate(setFromPick)} />
        </label>
        <label>
          Hasta
          <input type="date" className="field" value={to} min={`${year}-01-01`} max={`${year}-12-31`} onChange={onDate(setToPick)} />
        </label>
      </div>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <ReportCard
          title="Portafolio de evidencias (PDF)"
          hint="Del niño o niña elegido, entre «Desde» y «Hasta»."
          blocked={noChildren}
          state={portfolioState}
          onGenerate={generatePortfolio}
        />
        <ReportCard
          title="Informe de progreso (PDF)"
          hint="Del niño o niña elegido, en el bimestre elegido."
          blocked={noChildren}
          state={progressState}
          onGenerate={generateProgress}
        />
        <ReportCard
          title="Cuaderno de campo del periodo (PDF)"
          hint="Todos los registros del aula entre «Desde» y «Hasta»."
          state={notebookState}
          onGenerate={generateNotebook}
        />
      </div>
    </div>
  );
}
