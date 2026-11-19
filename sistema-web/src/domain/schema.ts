import { z } from "zod";
import { CYCLE_BANDS, type AgeBand } from "@/curriculum";

export const SCHEMA_VERSION = 1;

const cycle = z.enum(["I", "II"]);
const ALL_BANDS: readonly string[] = [...CYCLE_BANDS.I, ...CYCLE_BANDS.II];
const ageBand = z.custom<AgeBand>((v) => typeof v === "string" && ALL_BANDS.includes(v));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const teacherProfileSchema = z.object({
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

/** On-disk shape of the profile: the profile plus the schema version. */
export const profileFileSchema = teacherProfileSchema.extend({ version: z.literal(SCHEMA_VERSION) });

export const periodSchema = z.object({
  id: z.enum(["B1", "B2", "B3", "B4"]),
  name: z.string(),
  start: isoDate,
  end: isoDate,
});

export const classroomSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cycle,
  bands: z.array(ageBand).min(1),
  disabledCompetencyIds: z.array(z.string()),
  cycleIGrading: z.enum(["descriptive", "scale"]),
}).refine((c) => c.bands.every((b) => CYCLE_BANDS[c.cycle].includes(b)), {
  message: "bands must belong to the classroom cycle",
  path: ["bands"],
}).refine((c) => new Set(c.bands).size === c.bands.length, {
  message: "duplicate bands",
  path: ["bands"],
});

export const studentSchema = z.object({
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

export const yearDataSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  schoolYear: z.number().int().min(1000).max(9999),
  periods: z.array(periodSchema),
  classrooms: z.array(classroomSchema),
  students: z.array(studentSchema),
});

export type TeacherProfile = z.infer<typeof teacherProfileSchema>;
export type Period = z.infer<typeof periodSchema>;
export type Classroom = z.infer<typeof classroomSchema>;
export type Student = z.infer<typeof studentSchema>;
export type YearData = z.infer<typeof yearDataSchema>;
