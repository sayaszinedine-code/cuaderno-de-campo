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
  photo: z.string().optional(),
  active: z.boolean(),
});

const yearDataShape = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  periods: z.array(periodShape),
  classrooms: z.array(classroomShape),
  students: z.array(studentShape),
});

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
