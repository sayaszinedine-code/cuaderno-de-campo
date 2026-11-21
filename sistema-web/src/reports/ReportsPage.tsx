"use client";

import { useEffect, useRef, useState } from "react";
import { classroomLabel, todayISO } from "@/domain/classrooms";
import { periodOf } from "@/domain/notes";
import { classroomDir } from "@/domain/paths";
import type { Period } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";
import { attendanceWorkbook, gradesWorkbook, saveReport } from "./excel";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];
const OPEN_REVOKE_DELAY_MS = 60_000;
const DOWNLOAD_REVOKE_DELAY_MS = 1000;

type CardState = { busy: boolean; error: string; saved: { name: string; blob: Blob } | null };
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

function ReportCard(props: { title: string; state: CardState; onGenerate: () => void }) {
  const { title, state, onGenerate } = props;
  return (
    <section className="card space-y-3 p-4" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <button type="button" className="btn-primary" disabled={state.busy} onClick={onGenerate}>
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
  const { storage, year, yearData, profile, grades, attendance } = useWorkspace();
  const [classroomPick, setClassroomPick] = useState("");
  const [periodPick, setPeriodPick] = useState<Period["id"] | null>(null);
  const [monthPick, setMonthPick] = useState("");
  const [gradesState, setGradesState] = useState<CardState>(IDLE);
  const [attendanceState, setAttendanceState] = useState<CardState>(IDLE);
  const [seenYear, setSeenYear] = useState(year);
  if (seenYear !== year) {
    // The open year changed: picks from the previous year no longer apply.
    setSeenYear(year);
    setMonthPick("");
    setPeriodPick(null);
    setGradesState(IDLE);
    setAttendanceState(IDLE);
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
  const month = monthPick || (inYear ? today.slice(0, 7) : (yearData.periods[0]?.start.slice(0, 7) ?? `${year}-03`));

  async function run(
    set: (s: CardState) => void,
    build: () => Promise<{ base: string; blob: Blob }>,
  ): Promise<void> {
    set({ busy: true, error: "", saved: null });
    try {
      const { base, blob } = await build();
      const name = await saveReport(storage, classroomDir(year, classroom), base, "xlsx", blob);
      if (mounted.current) set({ busy: false, error: "", saved: { name, blob } });
    } catch {
      if (mounted.current) set({ busy: false, error: "No se pudo generar el reporte.", saved: null });
    }
  }

  const generateGrades = () =>
    void run(setGradesState, async () => ({
      base: `Registro de notas Bimestre ${periodId.slice(1)} ${classroom.name}`,
      blob: await gradesWorkbook({
        profile,
        classroom,
        students: yearData.students,
        period: { id: periodId, name: period?.name ?? `Bimestre ${periodId.slice(1)}` },
        grades,
      }),
    }));

  const generateAttendance = () =>
    void run(setAttendanceState, async () => ({
      base: `Asistencia ${month} ${classroom.name}`,
      blob: await attendanceWorkbook({ classroom, students: yearData.students, month, attendance }),
    }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <label>
          Aula
          <select
            className="field"
            value={classroom.id}
            onChange={(e) => {
              setClassroomPick(e.target.value);
              setGradesState(IDLE);
              setAttendanceState(IDLE);
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
    </div>
  );
}
