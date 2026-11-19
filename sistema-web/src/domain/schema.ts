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
const relPath = z
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
