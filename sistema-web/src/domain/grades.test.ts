import { describe, expect, it } from "vitest";
import {
  clearFinalOverride,
  evidenceFor,
  finalOf,
  gradeOf,
  gradeTable,
  progress,
  setFinalOverride,
  setGrade,
  stripLevelsForDescriptive,
  countStoredLevels,
  usesScale,
} from "./grades";
import { activeCompetencies } from "./classrooms";
import { SCHEMA_VERSION, type Classroom, type FieldNote, type GradesFile, type Period, type Student } from "./schema";

const NOW = new Date("2026-06-01T10:00:00.000Z");
const scaleRoom: Classroom = { id: "c1", name: "A", cycle: "II", bands: ["3y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" };
const descRoom: Classroom = { id: "c2", name: "B", cycle: "I", bands: ["9m"], disabledCompetencyIds: [], cycleIGrading: "descriptive" };
const scaleI: Classroom = { ...descRoom, id: "c3", cycleIGrading: "scale" };
const stu = (id: string, classroomId: string, active = true): Student => ({
  id, classroomId, firstNames: id, lastNames: "Q", birthDate: undefined, active,
});
const periods: Period[] = [
  { id: "B1", name: "I", start: "2026-03-01", end: "2026-05-31" },
  { id: "B2", name: "II", start: "2026-06-01", end: "2026-08-31" },
  { id: "B3", name: "III", start: "2026-09-01", end: "2026-10-31" },
  { id: "B4", name: "IV", start: "2026-11-01", end: "2026-12-31" },
];
const empty: GradesFile = { version: SCHEMA_VERSION, schoolYear: 2026, entries: [], finals: [] };
const comp = activeCompetencies(scaleRoom)[0].id;
const comp2 = activeCompetencies(scaleRoom)[1].id;

describe("usesScale", () => {
  it("is true for cycle II and cycle I scale only", () => {
    expect(usesScale(scaleRoom)).toBe(true);
    expect(usesScale(scaleI)).toBe(true);
    expect(usesScale(descRoom)).toBe(false);
  });
});

describe("setGrade / gradeOf", () => {
  it("upserts by student, competency and period", () => {
    let f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", level: "B", conclusion: "x" }, scaleRoom, NOW);
    f = setGrade(f, { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "y" }, scaleRoom, NOW);
    expect(f.entries).toHaveLength(1);
    expect(gradeOf(f, "s1", comp, "B1")).toEqual({
      studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "y", updatedAt: NOW.toISOString(),
    });
    expect(gradeOf(f, "s1", comp, "B2")).toBeUndefined();
  });
  it("collapses duplicates into one entry", () => {
    const e = { studentId: "s1", competencyId: comp, periodId: "B1" as const, conclusion: "", updatedAt: "t" };
    const f = setGrade({ ...empty, entries: [e, e] }, { studentId: "s1", competencyId: comp, periodId: "B1", level: "C", conclusion: "" }, scaleRoom, NOW);
    expect(f.entries).toHaveLength(1);
  });
  it("drops the level in a descriptive classroom", () => {
    const f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "texto" }, descRoom, NOW);
    expect(f.entries[0].level).toBeUndefined();
    expect(f.entries[0].conclusion).toBe("texto");
  });
  it("removes the entry when level and conclusion are empty", () => {
    let f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "" }, scaleRoom, NOW);
    expect(f.entries).toHaveLength(1);
    f = setGrade(f, { studentId: "s1", competencyId: comp, periodId: "B1", conclusion: "" }, scaleRoom, NOW);
    expect(f.entries).toHaveLength(0);
  });
  it("removes the entry in a descriptive classroom with an empty conclusion", () => {
    const f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "" }, descRoom, NOW);
    expect(f.entries).toHaveLength(0);
  });
});

describe("setGrade whitespace", () => {
  it("treats a whitespace-only conclusion as empty", () => {
    const f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", conclusion: "   " }, scaleRoom, NOW);
    expect(f.entries).toHaveLength(0);
  });
});

describe("setFinalOverride edge cases", () => {
  const g = { studentId: "s1", competencyId: comp, periodId: "B1" as const, level: "B" as const, conclusion: "uno", updatedAt: "t" };
  it("does not create an override equal to the automatic value", () => {
    const f = { ...empty, entries: [g] };
    const next = setFinalOverride(f, { studentId: "s1", competencyId: comp, level: "B", conclusion: "uno" }, scaleRoom, NOW);
    expect(next.finals).toEqual([]);
  });
  it("clears an existing override when saved empty", () => {
    let f = setFinalOverride(empty, { studentId: "s1", competencyId: comp, level: "C", conclusion: "x" }, scaleRoom, NOW);
    f = setFinalOverride(f, { studentId: "s1", competencyId: comp, conclusion: "  " }, scaleRoom, NOW);
    expect(f.finals).toEqual([]);
  });
});

describe("finalOf", () => {
  const g = (periodId: Period["id"], level: GradesFile["entries"][number]["level"], conclusion = "") => ({
    studentId: "s1", competencyId: comp, periodId, level, conclusion, updatedAt: "t",
  });
  it("takes the most recent period with a level", () => {
    const f = { ...empty, entries: [g("B1", "A", "uno"), g("B2", undefined, "dos"), g("B3", "B", "tres")] };
    expect(finalOf(f, "s1", comp, scaleRoom)).toEqual({ level: "B", conclusion: "tres", source: "auto", fromPeriodId: "B3" });
  });
  it("orders by period, not by insertion", () => {
    const f = { ...empty, entries: [g("B3", "B"), g("B1", "A")] };
    expect(finalOf(f, "s1", comp, scaleRoom).fromPeriodId).toBe("B3");
  });
  it("falls back to the latest conclusion when no level exists", () => {
    const f = { ...empty, entries: [g("B1", undefined, "uno"), g("B2", undefined, "dos"), g("B3", undefined, "")] };
    expect(finalOf(f, "s1", comp, descRoom)).toEqual({ level: undefined, conclusion: "dos", source: "auto", fromPeriodId: "B2" });
  });
  it("never returns a level for a descriptive classroom", () => {
    const f = { ...empty, entries: [g("B1", "A", "uno")] };
    const r = finalOf(f, "s1", comp, descRoom);
    expect(r.level).toBeUndefined();
    expect(r.conclusion).toBe("uno");
  });
  it("returns empty without data", () => {
    expect(finalOf(empty, "s1", comp, scaleRoom)).toEqual({ conclusion: "", source: "auto" });
  });
  it("override wins and clearing returns to auto", () => {
    let f: GradesFile = { ...empty, entries: [g("B1", "A", "uno")] };
    f = setFinalOverride(f, { studentId: "s1", competencyId: comp, level: "C", conclusion: "final" }, scaleRoom, NOW);
    expect(finalOf(f, "s1", comp, scaleRoom)).toEqual({ level: "C", conclusion: "final", source: "override" });
    f = clearFinalOverride(f, "s1", comp);
    expect(finalOf(f, "s1", comp, scaleRoom).source).toBe("auto");
  });
  it("setFinalOverride replaces and ignores level when descriptive", () => {
    let f = setFinalOverride(empty, { studentId: "s1", competencyId: comp, level: "C", conclusion: "a" }, descRoom, NOW);
    f = setFinalOverride(f, { studentId: "s1", competencyId: comp, level: "C", conclusion: "b" }, descRoom, NOW);
    expect(f.finals).toHaveLength(1);
    expect(f.finals[0].level).toBeUndefined();
    expect(f.finals[0].conclusion).toBe("b");
  });
});

describe("gradeTable", () => {
  it("shows only active students and competencies but keeps hidden entries", () => {
    const hidden = activeCompetencies(scaleRoom)[1].id;
    const room = { ...scaleRoom, disabledCompetencyIds: [] as string[] };
    const f = setGrade(empty, { studentId: "s2", competencyId: comp, periodId: "B1", level: "A", conclusion: "" }, room, NOW);
    const students = [stu("s1", "c1"), stu("s2", "c1", false), stu("s3", "c2")];
    const t = gradeTable({ file: f, classroom: room, students, periodId: "B1" });
    expect(t.students.map((s) => s.id)).toEqual(["s1"]);
    expect(t.cell("s2", comp)?.level).toBe("A");
    expect(f.entries).toHaveLength(1);
    const narrowed = { ...room, disabledCompetencyIds: [hidden] };
    const t2 = gradeTable({ file: f, classroom: narrowed, students, periodId: "B1" });
    expect(t2.competencies.map((c) => c.id)).not.toContain(hidden);
    expect(f.entries).toHaveLength(1);
  });
});

describe("progress", () => {
  const students = [stu("s1", "c1"), stu("s2", "c1"), stu("s3", "c1", false)];
  it("counts levels in scale mode", () => {
    const total = activeCompetencies(scaleRoom).length * 2;
    let f = setGrade(empty, { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "" }, scaleRoom, NOW);
    f = setGrade(f, { studentId: "s2", competencyId: comp, periodId: "B1", conclusion: "solo texto" }, scaleRoom, NOW);
    f = setGrade(f, { studentId: "s3", competencyId: comp, periodId: "B1", level: "A", conclusion: "" }, scaleRoom, NOW);
    expect(progress(f, { classroom: scaleRoom, students, periodId: "B1" })).toEqual({ graded: 1, total });
  });
  it("counts conclusions in descriptive mode", () => {
    const ds = [stu("d1", "c2"), stu("d2", "c2")];
    const f = setGrade(empty, { studentId: "d1", competencyId: activeCompetencies(descRoom)[0].id, periodId: "B1", conclusion: "ok" }, descRoom, NOW);
    expect(progress(f, { classroom: descRoom, students: ds, periodId: "B1" })).toEqual({
      graded: 1, total: activeCompetencies(descRoom).length * 2,
    });
  });
});

describe("evidenceFor", () => {
  const note = (o: Partial<FieldNote>): FieldNote => ({
    id: "n", date: "2026-06-05", classroomId: "c1", studentIds: ["s1"], wholeGroup: false, competencyId: comp,
    moment: "Taller", kind: "obs", performances: [], evidenceText: "e", evidence: [],
    interpretation: "", reflection: "", createdAt: "t", updatedAt: "t", ...o,
  });
  it("includes whole-group notes, excludes other period/competency, newest first", () => {
    const notes = [
      note({ id: "a", date: "2026-06-05" }),
      note({ id: "b", date: "2026-06-20", studentIds: [], wholeGroup: true }),
      note({ id: "c", date: "2026-04-05" }),
      note({ id: "d", competencyId: comp2 }),
      note({ id: "e", studentIds: ["s9"] }),
    ];
    const r = evidenceFor(notes, { studentId: "s1", competencyId: comp, periodId: "B2", periods, students: [stu("s1", "c1")] });
    expect(r.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("stripLevelsForDescriptive", () => {
  const f: GradesFile = {
    ...empty,
    entries: [
      { studentId: "d1", competencyId: comp, periodId: "B1", level: "A", conclusion: "uno", updatedAt: "t" },
      { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "dos", updatedAt: "t" },
    ],
    finals: [{ studentId: "d1", competencyId: comp, level: "B", conclusion: "fin", updatedAt: "t" }],
  };
  const students = [stu("d1", "c2", false), stu("s1", "c1")];
  it("removes levels for the classroom students, keeps conclusions", () => {
    const r = stripLevelsForDescriptive(f, descRoom, students);
    expect(r.entries[0]).toMatchObject({ studentId: "d1", level: undefined, conclusion: "uno" });
    expect(r.entries[1].level).toBe("A");
    expect(r.finals[0]).toMatchObject({ level: undefined, conclusion: "fin" });
  });
  it("is a no-op when the classroom uses scale", () => {
    expect(stripLevelsForDescriptive(f, scaleI, students)).toBe(f);
  });
});

describe("countStoredLevels", () => {
  it("counts entry and final levels of that classroom's children only", () => {
    const f: GradesFile = {
      ...empty,
      entries: [
        { studentId: "s1", competencyId: comp, periodId: "B1", level: "A", conclusion: "", updatedAt: "t" },
        { studentId: "s1", competencyId: comp2, periodId: "B1", conclusion: "x", updatedAt: "t" },
        { studentId: "s9", competencyId: comp, periodId: "B1", level: "B", conclusion: "", updatedAt: "t" },
      ],
      finals: [{ studentId: "s1", competencyId: comp, level: "AD", conclusion: "", updatedAt: "t" }],
    };
    expect(countStoredLevels(f, "c1", [stu("s1", "c1"), stu("s9", "c2")])).toBe(2);
  });
});
