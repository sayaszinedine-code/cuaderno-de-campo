import { describe, expect, it } from "vitest";
import {
  filterNotes,
  fold,
  newNote,
  performanceOptions,
  periodOf,
  removeNote,
  studentsWithoutRecentNotes,
  upsertNote,
  validateNote,
  validStudents,
} from "./notes";
import { SCHEMA_VERSION, type Classroom, type FieldNote, type NotesFile, type Student, type YearData } from "./schema";

const classroom: Classroom = {
  id: "c1", name: "Multiedad", cycle: "II", bands: ["3y", "4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive",
};
const stu = (id: string, first: string, birthDate: string | undefined, active = true, classroomId = "c1"): Student => ({
  id, classroomId, firstNames: first, lastNames: "Quispe", birthDate, active,
});
const s1 = stu("s1", "José", "2023-01-10"); // 3y in 2026
const s2 = stu("s2", "Ana", "2023-02-10"); // 3y
const s3 = stu("s3", "Luis", "2022-02-10"); // 4y
const year: YearData = {
  version: SCHEMA_VERSION,
  schoolYear: 2026,
  periods: [
    { id: "B1", name: "I", start: "2026-03-09", end: "2026-05-08" },
    { id: "B2", name: "II", start: "2026-05-18", end: "2026-07-24" },
  ],
  classrooms: [classroom],
  students: [s1, s2, s3, stu("s4", "Arch", "2023-01-01", false), stu("s5", "Otro", "2023-01-01", true, "c2")],
};
const base = (o: Partial<FieldNote> = {}): FieldNote => ({
  id: "n1", date: "2026-06-01", classroomId: "c1", studentIds: ["s1"], wholeGroup: false,
  moment: "Taller", kind: "obs", performances: [], evidenceText: "Armó una torre", evidence: [],
  interpretation: "", reflection: "", createdAt: "t0", updatedAt: "t0", ...o,
});
const file = (notes: FieldNote[]): NotesFile => ({ version: SCHEMA_VERSION, schoolYear: 2026, notes });

describe("newNote / upsert / remove", () => {
  it("applies defaults", () => {
    const n = newNote({ classroomId: "c1" }, () => "x", new Date(2026, 5, 3, 10));
    expect(n).toMatchObject({
      id: "x", date: "2026-06-03", classroomId: "c1", kind: "obs", moment: "Juego libre en sectores",
      studentIds: [], wholeGroup: false, performances: [], evidence: [], evidenceText: "", interpretation: "", reflection: "",
    });
    expect(newNote({ classroomId: "c1", date: "2026-01-02" }, () => "y").date).toBe("2026-01-02");
  });
  it("upsert inserts, updates with new updatedAt, and remove deletes", () => {
    const now = new Date("2026-06-05T12:00:00Z");
    const f1 = upsertNote(file([]), base(), now);
    expect(f1.notes).toHaveLength(1);
    expect(f1.notes[0].updatedAt).toBe(now.toISOString());
    const f2 = upsertNote(f1, base({ evidenceText: "otro" }), new Date("2026-06-06T12:00:00Z"));
    expect(f2.notes).toHaveLength(1);
    expect(f2.notes[0].evidenceText).toBe("otro");
    expect(removeNote(f2, "n1").notes).toEqual([]);
  });
});

describe("validateNote", () => {
  it("passes a valid note", () => expect(validateNote(base(), year)).toBeNull());
  it("unknown classroom", () => expect(validateNote(base({ classroomId: "zz" }), year)).toBe("Elige un aula."));
  it("no students and no wholeGroup", () =>
    expect(validateNote(base({ studentIds: [] }), year)).toBe("Elige al menos un niño o niña, o marca «Todo el grupo»."));
  it("archived or other-classroom students do not count", () => {
    const msg = "Elige al menos un niño o niña, o marca «Todo el grupo».";
    expect(validateNote(base({ studentIds: ["s4"] }), year)).toBe(msg);
    expect(validateNote(base({ studentIds: ["s5"] }), year)).toBe(msg);
  });
  it("wholeGroup alone is fine", () => expect(validateNote(base({ studentIds: [], wholeGroup: true }), year)).toBeNull());
  it("empty evidence and no photos", () => {
    const msg = "Describe la evidencia o agrega una foto.";
    expect(validateNote(base({ evidenceText: "  " }), year)).toBe(msg);
    expect(validateNote(base({ evidenceText: "", evidence: ["a/b.jpg"] }), year)).toBeNull();
  });
  it("competency outside cycle", () => {
    expect(validateNote(base({ competencyId: "nope" }), year)).toBe("La competencia no corresponde al ciclo del aula.");
    expect(validateNote(base({ competencyId: "lee" }), year)).toBeNull();
  });
  it("disabled competency is still valid", () => {
    const y = { ...year, classrooms: [{ ...classroom, disabledCompetencyIds: ["tic"] }] };
    expect(validateNote(base({ competencyId: "tic" }), y)).toBeNull();
  });
});

describe("validStudents", () => {
  it("keeps only active students of the classroom", () => {
    const n = base({ studentIds: ["s1", "s4", "s5", "ghost"] });
    expect(validStudents(n, year).map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("performanceOptions", () => {
  const p = (competencyId: string, students: Student[]) =>
    performanceOptions({ classroom, students, competencyId, date: "2026-06-01", schoolYear: 2026 });
  it("multi-age: two 3y and one 4y", () => {
    expect(p("lee", [s1, s2, s3])).toEqual({ bands: ["3y", "4y"], defaultBand: "3y" });
  });
  it("tie picks the lowest band", () => {
    expect(p("lee", [s3, s1]).defaultBand).toBe("3y");
  });
  it("excludes bands without performances", () => {
    expect(p("escribe", [s1, s2, s3])).toEqual({ bands: ["4y"], defaultBand: "4y" });
  });
  it("returns null default when no band has performances", () => {
    const only3 = { ...classroom, bands: ["3y" as const] };
    expect(performanceOptions({ classroom: only3, students: [s1], competencyId: "escribe", date: "2026-06-01", schoolYear: 2026 })).toEqual({
      bands: [],
      defaultBand: null,
    });
  });
  it("uses classroom bands when no students", () => {
    expect(p("lee", [])).toEqual({ bands: ["3y", "4y"], defaultBand: "3y" });
  });
});

describe("periodOf", () => {
  it("is inclusive at the edges and null outside", () => {
    expect(periodOf("2026-03-09", year.periods)).toBe("B1");
    expect(periodOf("2026-05-08", year.periods)).toBe("B1");
    expect(periodOf("2026-05-18", year.periods)).toBe("B2");
    expect(periodOf("2026-05-10", year.periods)).toBeNull();
  });
});

describe("filterNotes", () => {
  const a = base({ id: "a", date: "2026-04-01", updatedAt: "1", studentIds: ["s1"], competencyId: "lee", areaId: "comunicacion" });
  const b = base({ id: "b", date: "2026-06-01", updatedAt: "1", studentIds: ["s2"], kind: "logro", evidenceText: "Dijo JOSÉ" });
  const c = base({ id: "c", date: "2026-06-01", updatedAt: "2", studentIds: [], wholeGroup: true, reflection: "Canción" });
  const all = [a, b, c];
  const q = { periods: year.periods, students: year.students };
  const ids = (r: FieldNote[]) => r.map((n) => n.id);
  it("sorts by date desc then updatedAt desc", () => expect(ids(filterNotes(all, q))).toEqual(["c", "b", "a"]));
  it("filters by student incl. wholeGroup notes of their classroom", () => {
    expect(ids(filterNotes(all, { ...q, studentId: "s1" }))).toEqual(["c", "a"]);
  });
  it("filters by area, competency, period, kind", () => {
    expect(ids(filterNotes(all, { ...q, areaId: "comunicacion" }))).toEqual(["a"]);
    expect(ids(filterNotes(all, { ...q, competencyId: "lee" }))).toEqual(["a"]);
    expect(ids(filterNotes(all, { ...q, periodId: "B2" }))).toEqual(["c", "b"]);
    expect(ids(filterNotes(all, { ...q, kind: "logro" }))).toEqual(["b"]);
  });
  it("search ignores case and accents, searches text and student names", () => {
    expect(ids(filterNotes(all, { ...q, text: "jose" }))).toEqual(["b", "a"]);
    expect(ids(filterNotes(all, { ...q, text: "cancion" }))).toEqual(["c"]);
    expect(fold("JOSÉ")).toBe("jose");
  });
});

describe("studentsWithoutRecentNotes", () => {
  const students = [s1, s2, s3, stu("s4", "Arch", undefined, false)];
  it("lists active students without a note in the window; wholeGroup counts for all", () => {
    const notes = [base({ date: "2026-06-10", studentIds: ["s1"] }), base({ id: "o", date: "2026-05-01", studentIds: ["s2"] })];
    expect(studentsWithoutRecentNotes(notes, students, "2026-06-15").map((s) => s.id)).toEqual(["s2", "s3"]);
    const wg = [...notes, base({ id: "w", date: "2026-06-14", studentIds: [], wholeGroup: true })];
    expect(studentsWithoutRecentNotes(wg, students, "2026-06-15")).toEqual([]);
  });
  it("window is inclusive of today-days and excludes future notes", () => {
    expect(studentsWithoutRecentNotes([base({ date: "2026-06-01" })], [s1], "2026-06-15").length).toBe(0);
    expect(studentsWithoutRecentNotes([base({ date: "2026-05-31" })], [s1], "2026-06-15").length).toBe(1);
    expect(studentsWithoutRecentNotes([base({ date: "2026-06-16" })], [s1], "2026-06-15").length).toBe(1);
  });
});
