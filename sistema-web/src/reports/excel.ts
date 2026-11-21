import type * as ExcelNS from "exceljs";
import { summary, monthDays } from "@/domain/attendance";
import { byStudentName, classroomLabel } from "@/domain/classrooms";
import { gradeTable, usesScale } from "@/domain/grades";
import { safeName } from "@/domain/paths";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_MARKS,
  LEVEL_LABELS,
  LEVELS,
  relPath,
  type AttendanceFile,
  type Classroom,
  type GradesFile,
  type Period,
  type Student,
  type TeacherProfile,
} from "@/domain/schema";
import type { Storage } from "@/storage/types";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SUMMARY_MAX = 80;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

type ExcelModule = typeof ExcelNS;

/** exceljs is heavy: it is only fetched when a report is generated. */
async function loadExcel(): Promise<ExcelModule> {
  const mod: ExcelModule & { default?: ExcelModule } = await import("exceljs");
  return mod.default ?? mod;
}

async function toBlob(wb: ExcelNS.Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buf as ArrayBuffer)], { type: XLSX_TYPE });
}

const rowName = (s: Student) => `${s.lastNames}, ${s.firstNames}`.trim();
const teacherName = (p: TeacherProfile | null) => (p ? `${p.firstNames} ${p.lastNames}`.trim() : "");

/** Shortens a conclusion to at most SUMMARY_MAX chars, ending in «…» when cut. */
export function summarize(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SUMMARY_MAX) return t;
  return `${t.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/** Excel sheet names: ≤ 31 chars, none of `\ / ? * [ ] :`. */
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Hoja";

function boldRow(row: ExcelNS.Row) {
  row.font = { bold: true };
}

export async function gradesWorkbook(params: {
  profile: TeacherProfile | null;
  classroom: Classroom;
  students: Student[];
  period: Pick<Period, "id" | "name">;
  grades: GradesFile;
}): Promise<Blob> {
  const Excel = await loadExcel();
  const { classroom, period, profile } = params;
  const scale = usesScale(classroom);
  const table = gradeTable({ file: params.grades, classroom, students: params.students, periodId: period.id });

  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(sheetName(`Registro ${period.name}`));
  boldRow(ws.addRow([`Registro de notas — ${period.name}`]));
  ws.addRow(["Institución educativa", profile?.institution ?? ""]);
  ws.addRow(["Docente", teacherName(profile)]);
  ws.addRow(["Aula", classroomLabel(classroom)]);
  ws.addRow(["Bimestre", period.name]);
  if (!scale) ws.addRow(["Evaluación descriptiva: resumen de la conclusión de cada competencia."]);
  ws.addRow([]);
  boldRow(ws.addRow(["N.°", "Niño o niña", ...table.competencies.map((c) => c.shortName)]));
  const rows = [...table.students].sort(byStudentName);
  rows.forEach((s, i) => {
    const cells = table.competencies.map((c) => {
      const e = table.cell(s.id, c.id);
      if (!e) return "";
      return scale ? (e.level ?? "") : summarize(e.conclusion);
    });
    ws.addRow([i + 1, rowName(s), ...cells]);
  });
  if (scale) {
    ws.addRow([]);
    boldRow(ws.addRow(["Leyenda"]));
    for (const l of LEVELS) ws.addRow([l, LEVEL_LABELS[l]]);
  }
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 32;
  for (let i = 0; i < table.competencies.length; i++) {
    const col = ws.getColumn(i + 3);
    col.width = scale ? 14 : 40;
    col.alignment = { wrapText: true, vertical: "top" };
  }

  const cs = wb.addWorksheet("Conclusiones");
  boldRow(cs.addRow(["Niño o niña", "Competencia", "Conclusión"]));
  for (const s of rows) {
    for (const c of table.competencies) {
      const conclusion = table.cell(s.id, c.id)?.conclusion.trim() ?? "";
      if (conclusion) cs.addRow([rowName(s), c.name, conclusion]);
    }
  }
  cs.getColumn(1).width = 32;
  cs.getColumn(2).width = 40;
  cs.getColumn(3).width = 80;
  cs.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  return toBlob(wb);
}

/** `YYYY-MM` → first and last day. */
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1] ?? month} de ${y}`;
}

export async function attendanceWorkbook(params: {
  classroom: Classroom;
  students: Student[];
  month: string;
  attendance: AttendanceFile;
}): Promise<Blob> {
  const Excel = await loadExcel();
  const { classroom, month, attendance } = params;
  const students = params.students.filter((s) => s.classroomId === classroom.id && s.active)
    .sort(byStudentName);
  const days = monthDays(attendance, classroom.id, month);
  const range = monthRange(month);

  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(sheetName(`Asistencia ${month}`));
  boldRow(ws.addRow([`Asistencia — ${monthLabel(month)}`]));
  ws.addRow(["Aula", classroomLabel(classroom)]);
  ws.addRow(["Mes", monthLabel(month)]);
  ws.addRow([]);
  boldRow(
    ws.addRow(["N.°", "Niño o niña", ...days.map((d) => String(Number(d.date.slice(8)))), ...ATTENDANCE_MARKS, "%"]),
  );
  students.forEach((s, i) => {
    const r = summary(attendance, { classroomId: classroom.id, studentId: s.id, ...range });
    ws.addRow([
      i + 1,
      rowName(s),
      ...days.map((d) => d.marks[s.id] ?? ""),
      r.P,
      r.T,
      r.F,
      r.J,
      r.pct === null ? "—" : `${r.pct}%`,
    ]);
  });
  ws.addRow([]);
  ws.addRow([ATTENDANCE_MARKS.map((m) => `${m}: ${ATTENDANCE_LABELS[m]}`).join(" · ")]);
  ws.addRow(["%: (P + T) / días marcados"]);
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 32;
  for (let i = 0; i < days.length; i++) ws.getColumn(i + 3).width = 4;
  return toBlob(wb);
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;

/** Longest base name (label + suffix) before the timestamp. */
const BASE_MAX = 60;

/**
 * Saves `blob` as `<dir>Reportes/<base><suffix> YYYY-MM-DD HHMM.<ext>`; never overwrites (« (2)», « (3)»…).
 * Only `base` is shortened to fit, so the `suffix` (a date range, « Bimestre N»…) always stays whole.
 * Resolves with the file name.
 */
export async function saveReport(
  storage: Storage,
  dir: string,
  baseName: string,
  ext: string,
  blob: Blob,
  now: Date = new Date(),
  suffix = "",
): Promise<string> {
  const folder = `${dir.replace(/\/+$/, "")}/Reportes`;
  if (!relPath.safeParse(folder).success) throw new Error("Invalid report folder");
  const tail = suffix.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trimEnd().slice(0, BASE_MAX - 1);
  const base = `${safeName(baseName).slice(0, BASE_MAX - tail.length).trim()}${tail} ${stamp(now)}`;
  const cleanExt = safeName(ext).replace(/^\.+/, "");
  // Both backends return [] for a missing folder; any other failure must stop the write (no blind overwrite).
  const taken = new Set((await storage.list(folder)).map((e) => e.name.toLowerCase()));
  let name = `${base}.${cleanExt}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n}).${cleanExt}`;
  await storage.writeFile(`${folder}/${name}`, blob);
  return name;
}
