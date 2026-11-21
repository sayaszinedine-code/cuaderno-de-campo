import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type AttendanceFile } from "@/domain/schema";
import { markAllPresent, markOf, monthDays, setMark, summary } from "./attendance";

const empty = (): AttendanceFile => ({ version: SCHEMA_VERSION, schoolYear: 2026, days: [] });
const D = "2026-03-10";

describe("setMark / markOf", () => {
  it("sets, replaces and reads a mark", () => {
    let f = setMark(empty(), "c1", D, "s1", "P");
    expect(markOf(f, "c1", D, "s1")).toBe("P");
    f = setMark(f, "c1", D, "s1", "F");
    expect(markOf(f, "c1", D, "s1")).toBe("F");
    expect(f.days).toHaveLength(1);
    expect(markOf(f, "c1", D, "s2")).toBeUndefined();
    expect(markOf(f, "c2", D, "s1")).toBeUndefined();
  });

  it("null removes the mark and drops the empty day", () => {
    let f = setMark(empty(), "c1", D, "s1", "P");
    f = setMark(f, "c1", D, "s2", "T");
    f = setMark(f, "c1", D, "s1", null);
    expect(markOf(f, "c1", D, "s1")).toBeUndefined();
    expect(f.days).toHaveLength(1);
    f = setMark(f, "c1", D, "s2", null);
    expect(f.days).toHaveLength(0);
  });

  it("does not mutate its input", () => {
    const f = setMark(empty(), "c1", D, "s1", "P");
    const snapshot = JSON.stringify(f);
    setMark(f, "c1", D, "s1", "F");
    expect(JSON.stringify(f)).toBe(snapshot);
  });

  it("merges duplicated day entries, later entries winning per student", () => {
    const f: AttendanceFile = {
      ...empty(),
      days: [
        { date: D, classroomId: "c1", marks: { s1: "P", s2: "F" } },
        { date: "2026-03-11", classroomId: "c1", marks: { s1: "P" } },
        { date: D, classroomId: "c1", marks: { s1: "T", s3: "J" } },
      ],
    };
    expect(markOf(f, "c1", D, "s1")).toBe("T");
    const out = setMark(f, "c1", D, "s2", "P");
    const same = out.days.filter((d) => d.date === D && d.classroomId === "c1");
    expect(same).toHaveLength(1);
    expect(same[0].marks).toEqual({ s1: "T", s2: "P", s3: "J" });
    expect(out.days).toHaveLength(2);
  });
});

describe("markAllPresent", () => {
  it("only fills children without a mark", () => {
    let f = setMark(empty(), "c1", D, "s1", "F");
    f = markAllPresent(f, "c1", D, ["s1", "s2", "s3"]);
    expect(markOf(f, "c1", D, "s1")).toBe("F");
    expect(markOf(f, "c1", D, "s2")).toBe("P");
    expect(markOf(f, "c1", D, "s3")).toBe("P");
  });

  it("merges duplicated days too", () => {
    const f: AttendanceFile = {
      ...empty(),
      days: [
        { date: D, classroomId: "c1", marks: { s1: "F" } },
        { date: D, classroomId: "c1", marks: { s2: "J" } },
      ],
    };
    const out = markAllPresent(f, "c1", D, ["s1", "s2", "s3"]);
    expect(out.days).toHaveLength(1);
    expect(out.days[0].marks).toEqual({ s1: "F", s2: "J", s3: "P" });
  });
});

describe("summary", () => {
  const build = () => {
    let f = empty();
    f = setMark(f, "c1", "2026-03-02", "s1", "P");
    f = setMark(f, "c1", "2026-03-03", "s1", "T");
    f = setMark(f, "c1", "2026-03-04", "s1", "F");
    f = setMark(f, "c1", "2026-03-05", "s1", "J");
    f = setMark(f, "c1", "2026-03-02", "s2", "P");
    f = setMark(f, "c2", "2026-03-02", "s1", "F");
    f = setMark(f, "c1", "2026-04-01", "s1", "F");
    return f;
  };

  it("counts T as attendance and J as marked", () => {
    const r = summary(build(), { classroomId: "c1", studentId: "s1", from: "2026-03-01", to: "2026-03-31" });
    expect(r).toEqual({ P: 1, T: 1, F: 1, J: 1, marked: 4, pct: 50 });
  });

  it("aggregates all students when studentId is omitted", () => {
    const r = summary(build(), { classroomId: "c1", from: "2026-03-01", to: "2026-03-31" });
    expect(r.marked).toBe(5);
    expect(r.P).toBe(2);
    expect(r.pct).toBe(60);
  });

  it("returns null pct without marks", () => {
    const r = summary(build(), { classroomId: "c1", studentId: "s9", from: "2026-03-01", to: "2026-03-31" });
    expect(r).toEqual({ P: 0, T: 0, F: 0, J: 0, marked: 0, pct: null });
  });

  it("counts only the requested classroom for a student with days in two", () => {
    const r = summary(build(), { classroomId: "c2", studentId: "s1", from: "2026-03-01", to: "2026-03-31" });
    expect(r).toEqual({ P: 0, T: 0, F: 1, J: 0, marked: 1, pct: 0 });
  });

  it("includes both boundary dates and excludes the neighbours", () => {
    let f = setMark(empty(), "c1", "2026-05-15", "s1", "P");
    f = setMark(f, "c1", "2026-05-16", "s1", "F");
    const b1 = summary(f, { classroomId: "c1", studentId: "s1", from: "2026-03-01", to: "2026-05-15" });
    const b2 = summary(f, { classroomId: "c1", studentId: "s1", from: "2026-05-16", to: "2026-07-31" });
    expect([b1.P, b1.F, b2.P, b2.F]).toEqual([1, 0, 0, 1]);
  });

  it("range is inclusive", () => {
    const r = summary(build(), { classroomId: "c1", studentId: "s1", from: "2026-03-02", to: "2026-03-02" });
    expect(r.marked).toBe(1);
  });
});

describe("monthDays", () => {
  it("returns the merged days of the classroom in that month, sorted", () => {
    let f = setMark(empty(), "c1", "2026-03-05", "s1", "P");
    f = setMark(f, "c1", "2026-03-02", "s1", "P");
    f = setMark(f, "c1", "2026-04-02", "s1", "P");
    f = setMark(f, "c2", "2026-03-03", "s1", "P");
    expect(monthDays(f, "c1", "2026-03").map((d) => d.date)).toEqual(["2026-03-02", "2026-03-05"]);
  });
});
