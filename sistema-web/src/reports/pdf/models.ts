/*
 * View models of the PDF reports: every string the documents print, already cleaned for the PDF font.
 * Pure functions with no PDF dependency, so the texts are testable without rendering.
 */
import { COMPETENCIES, areaIdFor } from "@/curriculum";
import { formatAge } from "@/domain/age";
import { areaName } from "@/domain/areas";
import { activeCompetencies, bandLabel, byStudentName, classroomLabel } from "@/domain/classrooms";
import { summary } from "@/domain/attendance";
import { gradeOf, usesScale } from "@/domain/grades";
import { filterNotes } from "@/domain/notes";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_MARKS,
  LEVEL_LABELS,
  LEVELS,
  type AttendanceFile,
  type Classroom,
  type FieldNote,
  type GradesFile,
  type Period,
  type Student,
  type TeacherProfile,
} from "@/domain/schema";

export type Field = { label: string; value: string; list?: string[] };

/** Characters Windows-1252 adds above 0x7F in 0x80-0x9F (the standard PDF fonts draw them). */
const CP1252_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function drawable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRAS.has(ch);
}

/**
 * Keeps only what Helvetica (WinAnsi) can draw: Spanish letters and punctuation stay, other accented letters
 * lose the accent and anything else (emoji, symbols) is dropped instead of printing garbage.
 */
export function pdfText(s: string): string {
  const out: string[] = [];
  for (const ch of s.replace(/\r\n?/g, "\n").replace(/\t/g, " ").normalize("NFC")) {
    if (ch === "\n" || drawable(ch)) {
      out.push(ch);
      continue;
    }
    const folded = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (folded !== "" && [...folded].every(drawable)) out.push(folded);
  }
  return out
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}

/** `YYYY-MM-DD` → `dd/mm/yyyy`. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const field = (label: string, value: string): Field => ({ label, value: pdfText(value) });
const listField = (label: string, items: string[]): Field => ({
  label,
  value: "",
  list: items.map(pdfText).filter((t) => t !== ""),
});

const fullName = (s: Pick<Student, "firstNames" | "lastNames">) => `${s.firstNames} ${s.lastNames}`.trim();
const teacherName = (p: TeacherProfile | null) => (p ? fullName(p) : "");

const competencyName = (id: string | undefined) =>
  id === undefined ? "" : (COMPETENCIES.find((c) => c.id === id)?.name ?? "");

function noteAreaName(n: FieldNote, classroom: Classroom): string {
  const direct = areaName(n.areaId);
  if (direct) return direct;
  const comp = COMPETENCIES.find((c) => c.id === n.competencyId);
  return comp ? (areaName(areaIdFor(comp, classroom.cycle)) ?? "") : "";
}

const inRange = (n: FieldNote, from: string, to: string) => n.date >= from && n.date <= to;
const oldestFirst = (a: FieldNote, b: FieldNote) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

export type PortfolioModel = {
  title: string;
  cover: Field[];
  entries: { id: string; fields: Field[]; photos: string[] }[];
  empty: string;
};

export function portfolioModel(p: {
  profile: TeacherProfile | null;
  classroom: Classroom;
  student: Student;
  students: Student[];
  notes: FieldNote[];
  periods: Period[];
  from: string;
  to: string;
}): PortfolioModel {
  const { profile, classroom, student, from, to } = p;
  const age = student.birthDate ? formatAge(student.birthDate, to) : "";
  const cover = [
    field("Niño o niña", fullName(student)),
    ...(age ? [field("Edad", age)] : []),
    field("Aula", classroomLabel(classroom)),
    field("Docente", teacherName(profile)),
    field("Institución educativa", profile?.institution ?? ""),
    field("Periodo", `Del ${fmtDate(from)} al ${fmtDate(to)}`),
  ];
  const notes = filterNotes(p.notes, { studentId: student.id, periods: p.periods, students: p.students })
    .filter((n) => inRange(n, from, to))
    .sort(oldestFirst);
  const entries = notes.map((n) => {
    const fields = [
      field("Fecha", fmtDate(n.date)),
      field("Momento de la jornada", n.moment),
      field("Competencia", competencyName(n.competencyId)),
      listField("Desempeños", n.performances.map((x) => x.text)),
      field("Evidencias", n.evidenceText),
      field("Interpretación en relación al desempeño", n.interpretation),
    ].filter((f) => f.value !== "" || (f.list?.length ?? 0) > 0);
    return { id: n.id, fields, photos: [...n.evidence] };
  });
  return {
    title: "Portafolio de evidencias",
    cover,
    entries,
    empty: "No hay registros de este niño o niña en estas fechas.",
  };
}

function attendanceFields(
  f: AttendanceFile,
  q: { classroomId: string; studentId: string; from: string; to: string },
): Field[] {
  const r = summary(f, q);
  if (r.marked === 0) return [];
  return [
    ...ATTENDANCE_MARKS.map((m) => field(ATTENDANCE_LABELS[m], String(r[m]))),
    field("Asistencia", r.pct === null ? "—" : `${r.pct}%`),
  ];
}

export type ProgressRow = { competency: string; level?: string; conclusion: string };

export type ProgressModel = {
  title: string;
  periodName: string;
  data: Field[];
  columns: string[];
  rows: ProgressRow[];
  /** Level legend; empty for the descriptive cycle I. */
  legend: Field[];
  attendanceTitle: string;
  attendance: Field[];
  attendanceEmpty: string;
  signature: { label: string; name: string };
};

export function progressModel(p: {
  profile: TeacherProfile | null;
  classroom: Classroom;
  student: Student;
  period: Pick<Period, "id" | "name" | "start" | "end">;
  grades: GradesFile;
  attendance: AttendanceFile;
}): ProgressModel {
  const { profile, classroom, student, period } = p;
  const scale = usesScale(classroom);
  const age = student.birthDate ? formatAge(student.birthDate, period.end) : "";
  const data = [
    field("Niño o niña", fullName(student)),
    ...(student.dni?.trim() ? [field("DNI", student.dni)] : []),
    ...(age ? [field("Edad", age)] : []),
    field("Aula", classroomLabel(classroom)),
    field("Institución educativa", profile?.institution ?? ""),
    field("UGEL", profile?.ugel ?? ""),
    field("Docente", teacherName(profile)),
  ];
  const rows = activeCompetencies(classroom).map((c): ProgressRow => {
    const e = gradeOf(p.grades, student.id, c.id, period.id);
    const competency = pdfText(c.name);
    const conclusion = pdfText(e?.conclusion ?? "");
    return scale ? { competency, level: e?.level ?? "", conclusion } : { competency, conclusion };
  });
  return {
    title: "Informe de progreso",
    periodName: pdfText(period.name),
    data,
    columns: scale ? ["Competencia", "Nivel de logro", "Conclusión descriptiva"] : ["Competencia", "Conclusión descriptiva"],
    rows,
    legend: scale ? LEVELS.map((l) => field(l, LEVEL_LABELS[l])) : [],
    attendanceTitle: "Asistencia del bimestre",
    attendance: attendanceFields(p.attendance, { classroomId: classroom.id, studentId: student.id, from: period.start, to: period.end }),
    attendanceEmpty: "Sin registros de asistencia en este bimestre.",
    signature: { label: "Firma de la docente", name: pdfText(teacherName(profile)) },
  };
}

/** Slide 4 of the client's presentation, verbatim. */
export const NOTEBOOK_DEFINITION = {
  title: "Cuaderno de Campo",
  paragraph:
    "El cuaderno de campo es un instrumento pedagógico y reflexivo que utiliza la docente de Educación Inicial para registrar de manera sistemática sus observaciones, impresiones, análisis y reflexiones sobre las experiencias de aprendizaje, el comportamiento, el desarrollo de los niños y niñas, así como sobre su propia práctica pedagógica, en coherencia con el enfoque formativo del Currículo Nacional.",
  whenTitle: "¿Cuándo se debe usar?",
  whenIntro: "El cuaderno de campo se utiliza cuando:",
  bullets: [
    "La docente observa situaciones relevantes del desarrollo integral de los niños y niñas.",
    "Se desarrollan experiencias de aprendizaje que requieren análisis posterior.",
    "Se desea reflexionar sobre la práctica pedagógica y tomar decisiones de mejora.",
    "Se identifican necesidades, intereses o dificultades del grupo o de algún niño o niña.",
    "Se necesita sustentar ajustes en la planificación (estrategias, materiales, tiempos).",
  ],
  important:
    "Importante: el cuaderno de campo no es un registro administrativo, sino una herramienta personal y profesional de la docente, orientada a la mejora continua de la enseñanza y el acompañamiento oportuno a los niños y niñas.",
} as const;

export type NotebookModel = {
  cover: { title: string; year: string };
  personal: { title: string; fields: Field[] };
  definition: typeof NOTEBOOK_DEFINITION;
  pages: { id: string; fields: Field[]; photos: string[] }[];
  empty: string;
};

export function notebookModel(p: {
  profile: TeacherProfile | null;
  classroom: Classroom;
  students: Student[];
  notes: FieldNote[];
  year: number;
  from: string;
  to: string;
}): NotebookModel {
  const { profile, classroom, from, to } = p;
  const v = (k: keyof TeacherProfile) => profile?.[k] ?? "";
  const personal = [
    field("NOMBRES:", v("firstNames")),
    field("APELLIDOS:", v("lastNames")),
    field("TELÉFONO:", v("phone")),
    field("REGIÓN:", v("region")),
    field("DOMICILIO:", v("address")),
    field("CORREO:", v("email")),
    field("NIVEL:", v("level")),
    field("UGEL:", v("ugel")),
    field("INSTITUCIÓN:", v("institution")),
  ];
  const byId = new Map(p.students.map((s) => [s.id, s]));
  const grade = classroom.bands.map(bandLabel).join(", ");
  const pages = p.notes
    .filter((n) => n.classroomId === classroom.id && inRange(n, from, to))
    .sort(oldestFirst)
    .map((n) => {
      const names = n.wholeGroup
        ? "Todo el grupo"
        : n.studentIds
            .flatMap((id) => byId.get(id) ?? [])
            .sort(byStudentName)
            .map(fullName)
            .join(", ");
      return {
        id: n.id,
        fields: [
          field("FECHA:", fmtDate(n.date)),
          field("GRADO:", grade),
          field("SECCIÓN:", classroom.name),
          field("NOMBRE COMPLETO:", names),
          field("EVIDENCIAS:", n.evidenceText),
          field("ÁREA:", noteAreaName(n, classroom)),
          field("COMPETENCIA:", competencyName(n.competencyId)),
          listField("DESEMPEÑO:", n.performances.map((x) => x.text)),
          field("INTERPRETACIÓN EN RELACIÓN AL DESEMPEÑO:", n.interpretation),
          field("REFLEXIÓN DOCENTE EN RELACIÓN A LA ACTIVIDAD:", n.reflection),
        ],
        photos: [...n.evidence],
      };
    });
  return {
    cover: { title: "CUADERNO DE CAMPO", year: String(p.year) },
    personal: { title: "Datos personales", fields: personal },
    definition: NOTEBOOK_DEFINITION,
    pages,
    empty: "No hay registros del cuaderno de campo en estas fechas.",
  };
}
