import { describe, expect, it } from "vitest";
import { dayLabel, filterNotes, groupByDay, isPending } from "./notes";
import type { FieldNote } from "./schema";

const n = (id: string, date: string, areaId?: string): FieldNote =>
  ({
    id, date, classroomId: "c1", studentIds: [], wholeGroup: true, moment: "Taller", kind: "obs", performances: [],
    evidenceText: "x", evidence: [], interpretation: "", reflection: "", areaId,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  }) as FieldNote;

describe("isPending", () => {
  it("is pending until it has an area", () => {
    expect(isPending(n("a", "2026-11-24"))).toBe(true);
    expect(isPending(n("a", "2026-11-24", "matematica"))).toBe(false);
  });
});

describe("filterNotes status", () => {
  const notes = [n("a", "2026-11-24"), n("b", "2026-11-24", "matematica")];
  const q = { periods: [], students: [] };
  it("filters pending and complete records", () => {
    expect(filterNotes(notes, { ...q, status: "pending" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterNotes(notes, { ...q, status: "complete" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterNotes(notes, q)).toHaveLength(2);
  });
});

describe("dayLabel", () => {
  it("names today and yesterday", () => {
    expect(dayLabel("2026-11-24", "2026-11-24")).toBe("Hoy");
    expect(dayLabel("2026-11-23", "2026-11-24")).toBe("Ayer");
  });
  it("handles month and year boundaries for Ayer", () => {
    expect(dayLabel("2026-10-31", "2026-11-01")).toBe("Ayer");
    expect(dayLabel("2025-12-31", "2026-01-01")).toBe("Ayer");
  });
  it("shows day and month, plus the year when it differs", () => {
    expect(dayLabel("2026-11-12", "2026-11-24")).toBe("12 nov");
    expect(dayLabel("2025-11-12", "2026-11-24")).toBe("12 nov 2025");
  });
});

describe("groupByDay", () => {
  it("groups consecutive records of the same day in order", () => {
    const g = groupByDay([n("a", "2026-11-24"), n("b", "2026-11-24"), n("c", "2026-11-20")]);
    expect(g.map((d) => [d.date, d.notes.map((x) => x.id)])).toEqual([
      ["2026-11-24", ["a", "b"]],
      ["2026-11-20", ["c"]],
    ]);
  });
});
