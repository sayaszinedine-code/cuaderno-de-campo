import { z } from "zod";
import { CYCLE_BANDS, type AgeBand } from "@/curriculum";

export const SCHEMA_VERSION = 1;

/*
 * Persisted objects are `.loose()`: keys this version does not know (written by a newer app) are kept on
 * load and written back on save instead of being silently dropped.
 */

const cycle = z.enum(["I", "II"]);
const ALL_BANDS: readonly string[] = [...CYCLE_BANDS.I, ...CYCLE_BANDS.II];
const ageBand = z.custom<AgeBand>((v) => typeof v === "string" && ALL_BANDS.includes(v));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Workspace-relative path: no absolute/drive/backslash forms and no `.`, `..` or empty segments. */
export const relPath = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("/") && !/^[A-Za-z]:/.test(v) && !v.includes("\\"), { message: "must be relative" })
  .refine((v) => v.split("/").every((seg) => seg !== "" && seg !== "." && seg !== ".."), {
    message: "invalid path segment",
  });

// Strict shapes define the TypeScript types (no index signature); the exported schemas are their loose
// counterparts used for parsing and saving.
const teacherProfileShape = z.object({
  firstNames: z.string(),
  lastNames: z.string(),
  phone: z.string(),
  region: z.string(),
  address: z.string(),
  email: z.string(),
  level: z.literal("Inicial"),
  ugel: z.string(),
  institution: z.string(),
});

const periodShape = z.object({
  id: z.enum(["B1", "B2", "B3", "B4"]),
  name: z.string(),
  start: isoDate,
  end: isoDate,
});

const classroomShape = z.object({
  id: z.string().min(1),
  name: z.string(),
  cycle,
  bands: z.array(ageBand).min(1),
  disabledCompetencyIds: z.array(z.string()),
  cycleIGrading: z.enum(["descriptive", "scale"]),
});

const studentShape = z.object({
  id: z.string().min(1),
  classroomId: z.string().min(1),
  firstNames: z.string(),
  lastNames: z.string(),
  birthDate: isoDate.optional(),
  dni: z.string().optional(),
  guardian: z.string().optional(),
  guardianPhone: z.string().optional(),
  motherTongue: z.string().optional(),
  healthNotes: z.string().optional(),
  photo: relPath.optional(),
  active: z.boolean(),
});

const yearDataShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  periods: z.array(periodShape),
  classrooms: z.array(classroomShape),
  students: z.array(studentShape),
});

export const NOTE_KINDS = ["obs", "anec", "logro", "fam", "otro"] as const;
export const NOTE_KIND_LABELS: Record<(typeof NOTE_KINDS)[number], string> = {
  obs: "Observación",
  anec: "Anécdota / incidencia",
  logro: "Logro",
  fam: "Reunión con familia",
  otro: "Otro",
};
export const MOMENTS = [
  "Recepción y rutinas",
  "Juego libre en sectores",
  "Experiencia de aprendizaje",
  "Taller",
  "Alimentación y recreo",
  "Aseo y descanso",
  "Salida",
  "Fuera del aula / visita",
] as const;
export const LEVELS = ["AD", "A", "B", "C"] as const;
export const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  AD: "Logro destacado",
  A: "Logro esperado",
  B: "En proceso",
  C: "En inicio",
};

const selectedPerformanceShape = z.object({
  competencyId: z.string(),
  band: ageBand,
  text: z.string(),
});

const fieldNoteShape = z.object({
  id: z.string().min(1),
  date: isoDate,
  classroomId: z.string().min(1),
  studentIds: z.array(z.string()),
  wholeGroup: z.boolean(),
  moment: z.string(),
  kind: z.enum(NOTE_KINDS),
  areaId: z.string().optional(),
  competencyId: z.string().optional(),
  performances: z.array(selectedPerformanceShape.loose()),
  evidenceText: z.string(),
  evidence: z.array(relPath),
  interpretation: z.string(),
  reflection: z.string(),
  level: z.enum(LEVELS).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const notesFileShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  notes: z.array(fieldNoteShape),
});

const gradeEntryShape = z.object({
  studentId: z.string().min(1),
  competencyId: z.string().min(1),
  periodId: periodShape.shape.id,
  level: z.enum(LEVELS).optional(),
  conclusion: z.string(),
  updatedAt: z.string(),
});

const finalOverrideShape = z.object({
  studentId: z.string().min(1),
  competencyId: z.string().min(1),
  level: z.enum(LEVELS).optional(),
  conclusion: z.string(),
  updatedAt: z.string(),
});

const gradesFileShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  entries: z.array(gradeEntryShape),
  finals: z.array(finalOverrideShape),
});

export const UNIT_KINDS = ["unidad", "proyecto", "experiencia"] as const;
export const UNIT_KIND_LABELS: Record<(typeof UNIT_KINDS)[number], string> = {
  unidad: "Unidad de aprendizaje",
  proyecto: "Proyecto de aprendizaje",
  experiencia: "Experiencia de aprendizaje",
};

const attachmentShape = z.object({
  name: z.string(),
  path: relPath,
  size: z.number().int().nonnegative(),
  type: z.string(),
  addedAt: z.string(),
});

const unitShape = z.object({
  id: z.string().min(1),
  classroomId: z.string().min(1),
  periodId: periodShape.shape.id,
  kind: z.enum(UNIT_KINDS),
  title: z.string(),
  start: isoDate.optional(),
  end: isoDate.optional(),
  purpose: z.string(),
  competencyIds: z.array(z.string()),
  performances: z.array(selectedPerformanceShape.loose()),
  description: z.string(),
  attachments: z.array(attachmentShape.loose()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const sessionShape = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  date: isoDate,
  title: z.string(),
  purpose: z.string(),
  competencyIds: z.array(z.string()),
  performances: z.array(selectedPerformanceShape.loose()),
  description: z.string(),
  attachments: z.array(attachmentShape.loose()),
  noteIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const unitsFileShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  units: z.array(unitShape),
  sessions: z.array(sessionShape),
});

export const ATTENDANCE_MARKS = ["P", "T", "F", "J"] as const;
export const ATTENDANCE_LABELS: Record<(typeof ATTENDANCE_MARKS)[number], string> = {
  P: "Presente",
  T: "Tardanza",
  F: "Falta",
  J: "Falta justificada",
};

const attendanceDayShape = z.object({
  date: isoDate,
  classroomId: z.string().min(1),
  marks: z.record(z.string(), z.enum(ATTENDANCE_MARKS)),
});

const attendanceFileShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  days: z.array(attendanceDayShape),
});

export const EVENT_TYPES = [
  "Reunión",
  "Entrega de documentos",
  "Actividad con niños",
  "Fecha cívica",
  "Capacitación",
  "Personal",
] as const;

const agendaEventShape = z.object({
  id: z.string().min(1),
  date: isoDate,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  title: z.string(),
  type: z.enum(EVENT_TYPES),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const agendaFileShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  events: z.array(agendaEventShape),
});

export const attendanceDaySchema = attendanceDayShape.loose();
export const attendanceFileSchema = attendanceFileShape.extend({ days: z.array(attendanceDaySchema) }).loose();
export const agendaEventSchema = agendaEventShape.loose();
export const agendaFileSchema = agendaFileShape.extend({ events: z.array(agendaEventSchema) }).loose();

export const attachmentSchema = attachmentShape.loose();
export const unitSchema = unitShape.loose();
export const sessionSchema = sessionShape.loose();
export const unitsFileSchema = unitsFileShape
  .extend({ units: z.array(unitSchema), sessions: z.array(sessionSchema) })
  .loose();

export const gradeEntrySchema = gradeEntryShape.loose();
export const finalOverrideSchema = finalOverrideShape.loose();
export const gradesFileSchema = gradesFileShape
  .extend({ entries: z.array(gradeEntrySchema), finals: z.array(finalOverrideSchema) })
  .loose();

export const fieldNoteSchema = fieldNoteShape.loose();
export const notesFileSchema = notesFileShape.extend({ notes: z.array(fieldNoteSchema) }).loose();

export const teacherProfileSchema = teacherProfileShape.loose();

/** On-disk shape of the profile: the profile plus the schema version. */
export const profileFileSchema = teacherProfileShape.extend({ version: z.literal(SCHEMA_VERSION) }).loose();

export const periodSchema = periodShape.loose();

export const classroomSchema = classroomShape
  .loose()
  .refine((c) => c.bands.every((b) => CYCLE_BANDS[c.cycle].includes(b)), {
    message: "bands must belong to the classroom cycle",
    path: ["bands"],
  })
  .refine((c) => new Set(c.bands).size === c.bands.length, {
    message: "duplicate bands",
    path: ["bands"],
  });

export const studentSchema = studentShape.loose();

export const yearDataSchema = yearDataShape
  .extend({
    periods: z.array(periodSchema),
    classrooms: z.array(classroomSchema),
    students: z.array(studentSchema),
  })
  .loose();

export type TeacherProfile = z.infer<typeof teacherProfileShape>;
export type Period = z.infer<typeof periodShape>;
export type Classroom = z.infer<typeof classroomShape>;
export type Student = z.infer<typeof studentShape>;
export type YearData = z.infer<typeof yearDataShape>;
export type NoteKind = (typeof NOTE_KINDS)[number];
export type Level = (typeof LEVELS)[number];
export type SelectedPerformance = z.infer<typeof selectedPerformanceShape>;
export type FieldNote = z.infer<typeof fieldNoteShape>;
export type NotesFile = z.infer<typeof notesFileShape>;
export type GradeEntry = z.infer<typeof gradeEntryShape>;
export type FinalOverride = z.infer<typeof finalOverrideShape>;
export type Attachment = z.infer<typeof attachmentShape>;
export type Unit = z.infer<typeof unitShape>;
export type Session = z.infer<typeof sessionShape>;
export type UnitsFile = z.infer<typeof unitsFileShape>;
export type GradesFile = z.infer<typeof gradesFileShape>;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];
export type AttendanceDay = z.infer<typeof attendanceDayShape>;
export type AttendanceFile = z.infer<typeof attendanceFileShape>;
export type EventType = (typeof EVENT_TYPES)[number];
export type AgendaEvent = z.infer<typeof agendaEventShape>;
export type AgendaFile = z.infer<typeof agendaFileShape>;
