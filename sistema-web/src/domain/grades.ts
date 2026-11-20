import type { Competency } from "@/curriculum";
import { activeCompetencies } from "./classrooms";
import { filterNotes } from "./notes";
import type { Classroom, FieldNote, FinalOverride, GradeEntry, GradesFile, Level, Period, Student } from "./schema";

const PERIOD_ORDER: Period["id"][] = ["B1", "B2", "B3", "B4"];

export function usesScale(c: Classroom): boolean {
  return c.cycle === "II" || c.cycleIGrading === "scale";
}

export function gradeOf(
  f: GradesFile,
  studentId: string,
  competencyId: string,
  periodId: Period["id"],
): GradeEntry | undefined {
  return f.entries.find((e) => e.studentId === studentId && e.competencyId === competencyId && e.periodId === periodId);
}

export function setGrade(
  f: GradesFile,
  input: { studentId: string; competencyId: string; periodId: Period["id"]; level?: Level; conclusion: string },
  classroom: Classroom,
  now: Date = new Date(),
): GradesFile {
  const level = usesScale(classroom) ? input.level : undefined;
  const rest = f.entries.filter(
    (e) => !(e.studentId === input.studentId && e.competencyId === input.competencyId && e.periodId === input.periodId),
  );
  if (level === undefined && input.conclusion.trim() === "") return { ...f, entries: rest };
  const entry: GradeEntry = {
    studentId: input.studentId,
    competencyId: input.competencyId,
    periodId: input.periodId,
    level,
    conclusion: input.conclusion,
    updatedAt: now.toISOString(),
  };
  return { ...f, entries: [...rest, entry] };
}

export type FinalResult = {
  level?: Level;
  conclusion: string;
  source: "auto" | "override";
  fromPeriodId?: Period["id"];
};

export function finalOf(
  f: GradesFile,
  studentId: string,
  competencyId: string,
  classroom: Classroom,
): FinalResult {
  const scale = usesScale(classroom);
  const override = f.finals.find((x) => x.studentId === studentId && x.competencyId === competencyId);
  if (override) {
    return { level: scale ? override.level : undefined, conclusion: override.conclusion, source: "override" };
  }
  const own = f.entries
    .filter((e) => e.studentId === studentId && e.competencyId === competencyId)
    .sort((a, b) => PERIOD_ORDER.indexOf(b.periodId) - PERIOD_ORDER.indexOf(a.periodId));
  if (scale) {
    const withLevel = own.find((e) => e.level !== undefined);
    if (withLevel) {
      return { level: withLevel.level, conclusion: withLevel.conclusion, source: "auto", fromPeriodId: withLevel.periodId };
    }
  }
  const withText = own.find((e) => e.conclusion.trim() !== "");
  if (withText) {
    return { level: undefined, conclusion: withText.conclusion, source: "auto", fromPeriodId: withText.periodId };
  }
  return { conclusion: "", source: "auto" };
}

export function setFinalOverride(
  f: GradesFile,
  input: { studentId: string; competencyId: string; level?: Level; conclusion: string },
  classroom: Classroom,
  now: Date = new Date(),
): GradesFile {
  const level = usesScale(classroom) ? input.level : undefined;
  if (level === undefined && input.conclusion.trim() === "") {
    return clearFinalOverride(f, input.studentId, input.competencyId);
  }
  if (!f.finals.some((x) => sameFinal(x, input)) && isAutomaticFinal(f, { ...input, level }, classroom)) return f;
  const entry: FinalOverride = {
    studentId: input.studentId,
    competencyId: input.competencyId,
    level,
    conclusion: input.conclusion,
    updatedAt: now.toISOString(),
  };
  return { ...f, finals: [...f.finals.filter((x) => !sameFinal(x, input)), entry] };
}

/** Whether the values equal what `finalOf` would compute without an override. */
export function isAutomaticFinal(
  f: GradesFile,
  v: { studentId: string; competencyId: string; level?: Level; conclusion: string },
  classroom: Classroom,
): boolean {
  const auto = finalOf({ ...f, finals: f.finals.filter((x) => !sameFinal(x, v)) }, v.studentId, v.competencyId, classroom);
  const level = usesScale(classroom) ? v.level : undefined;
  return auto.level === level && auto.conclusion.trim() === v.conclusion.trim();
}

export function clearFinalOverride(f: GradesFile, studentId: string, competencyId: string): GradesFile {
  return { ...f, finals: f.finals.filter((x) => !sameFinal(x, { studentId, competencyId })) };
}

function sameFinal(x: FinalOverride, k: { studentId: string; competencyId: string }): boolean {
  return x.studentId === k.studentId && x.competencyId === k.competencyId;
}

function activeStudents(classroom: Classroom, students: Student[]): Student[] {
  return students.filter((s) => s.classroomId === classroom.id && s.active);
}

export function gradeTable(params: {
  file: GradesFile;
  classroom: Classroom;
  students: Student[];
  periodId: Period["id"];
}): {
  students: Student[];
  competencies: Competency[];
  cell: (studentId: string, competencyId: string) => GradeEntry | undefined;
} {
  const index = new Map<string, GradeEntry>();
  for (const e of params.file.entries) {
    if (e.periodId !== params.periodId) continue;
    const key = `${e.studentId}|${e.competencyId}|${e.periodId}`;
    if (!index.has(key)) index.set(key, e);
  }
  return {
    students: activeStudents(params.classroom, params.students),
    competencies: activeCompetencies(params.classroom),
    cell: (studentId, competencyId) => index.get(`${studentId}|${competencyId}|${params.periodId}`),
  };
}

export function evidenceFor(
  notes: FieldNote[],
  params: {
    studentId: string;
    competencyId: string;
    periodId: Period["id"];
    periods: Period[];
    students: Student[];
  },
): FieldNote[] {
  return filterNotes(notes, params);
}

export function progress(
  f: GradesFile,
  params: { classroom: Classroom; students: Student[]; periodId: Period["id"] },
): { graded: number; total: number } {
  const students = activeStudents(params.classroom, params.students);
  const comps = activeCompetencies(params.classroom);
  const scale = usesScale(params.classroom);
  let graded = 0;
  for (const s of students) {
    for (const c of comps) {
      const e = gradeOf(f, s.id, c.id, params.periodId);
      if (!e) continue;
      if (scale ? e.level !== undefined : e.conclusion.trim() !== "") graded++;
    }
  }
  return { graded, total: students.length * comps.length };
}

export function stripLevelsForDescriptive(f: GradesFile, classroom: Classroom, students: Student[]): GradesFile {
  if (usesScale(classroom)) return f;
  const ids = new Set(students.filter((s) => s.classroomId === classroom.id).map((s) => s.id));
  const strip = <T extends { studentId: string; level?: Level }>(x: T): T =>
    ids.has(x.studentId) && x.level !== undefined ? { ...x, level: undefined } : x;
  return { ...f, entries: f.entries.map(strip), finals: f.finals.map(strip) };
}

/** How many AD/A/B/C levels (entries and finals) are stored for the children of a classroom. */
export function countStoredLevels(f: GradesFile, classroomId: string, students: Student[]): number {
  const ids = new Set(students.filter((s) => s.classroomId === classroomId).map((s) => s.id));
  const has = (x: { studentId: string; level?: Level }) => ids.has(x.studentId) && x.level !== undefined;
  return f.entries.filter(has).length + f.finals.filter(has).length;
}
