import { z } from "zod";

export const SCHEMA_VERSION = 1;

const cycle = z.enum(["I", "II"]);
const ageBand = z.enum(["9m", "18m", "24m", "36m", "3y", "4y", "5y"]);
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
});

export const studentSchema = z.object({
  id: z.string().min(1),
  classroomId: z.string().min(1),
  firstNames: z.string(),
  lastNames: z.string(),
  birthDate: z.string().optional(),
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
  schoolYear: z.number().int(),
  periods: z.array(periodSchema),
  classrooms: z.array(classroomSchema),
  students: z.array(studentSchema),
});

export type TeacherProfile = z.infer<typeof teacherProfileSchema>;
export type Period = z.infer<typeof periodSchema>;
export type Classroom = z.infer<typeof classroomSchema>;
export type Student = z.infer<typeof studentSchema>;
export type YearData = z.infer<typeof yearDataSchema>;
