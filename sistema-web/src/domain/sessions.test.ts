import { describe, expect, it } from "vitest";
import type { FieldNote, Session, Unit, UnitsFile } from "./schema";
import {
  linkedSessionsOfNote,
  newSession,
  notesNear,
  pruneNoteIds,
  removeSession,
  sessionsOfUnit,
  upsertSession,
  validateSession,
} from "./units";

const stamp = "2026-01-01T00:00:00.000Z";
const unit = { id: "u1", competencyIds: ["a", "b"] } as Unit;
const sess = (over: Partial<Session> = {}): Session => ({
  id: "s1", unitId: "u1", date: "2026-03-10", title: "T", purpose: "", competencyIds: [], performances: [],
  description: "", attachments: [], noteIds: [], createdAt: stamp, updatedAt: stamp, ...over,
});
const note = (id: string, date: string, classroomId = "c1"): FieldNote =>
  ({ id, date, classroomId, evidenceText: "x" }) as FieldNote;
const file = (sessions: Session[]): UnitsFile => ({ version: 1, schoolYear: 2026, units: [], sessions }) as UnitsFile;

describe("session helpers", () => {
  it("newSession defaults to today and the unit competencies", () => {
    const s = newSession(unit, () => "id1", new Date(2026, 2, 5, 10));
    expect(s).toMatchObject({ id: "id1", unitId: "u1", date: "2026-03-05", title: "", competencyIds: ["a", "b"], noteIds: [] });
    expect(s.competencyIds).not.toBe(unit.competencyIds);
  });

  it("upserts, removes and lists sessions by date", () => {
    let f = upsertSession(file([]), sess({ id: "s2", date: "2026-03-12" }));
    f = upsertSession(f, sess());
    expect(sessionsOfUnit(f, "u1").map((s) => s.id)).toEqual(["s1", "s2"]);
    f = upsertSession(f, sess({ title: "N" }), new Date("2026-05-01T00:00:00Z"));
    expect(f.sessions).toHaveLength(2);
    expect(f.sessions.find((s) => s.id === "s1")).toMatchObject({ title: "N", updatedAt: "2026-05-01T00:00:00.000Z" });
    expect(removeSession(f, "s1").sessions.map((s) => s.id)).toEqual(["s2"]);
  });

  it("validates title then date", () => {
    expect(validateSession(sess({ title: " " }))).toBe("Escribe un título.");
    expect(validateSession(sess({ date: "" }))).toBe("Elige la fecha de la sesión.");
    expect(validateSession(sess())).toBeNull();
  });

  it("notesNear keeps the classroom notes within ±7 days", () => {
    const notes = [note("in1", "2026-03-03"), note("in2", "2026-03-17"), note("out", "2026-03-18"), note("other", "2026-03-10", "c2")];
    expect(notesNear(notes, "c1", "2026-03-10").map((n) => n.id)).toEqual(["in1", "in2"]);
    expect(notesNear(notes, "c1", "2026-03-10", 0)).toEqual([]);
  });

  it("finds the sessions that link a note and prunes deleted ids", () => {
    const f = file([sess({ noteIds: ["n1"] }), sess({ id: "s2", date: "2026-03-01", noteIds: ["n1", "n2"] }), sess({ id: "s3" })]);
    expect(linkedSessionsOfNote(f, "n1").map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(pruneNoteIds(sess({ noteIds: ["n1", "gone"] }), [note("n1", "2026-03-10")])).toEqual(["n1"]);
  });
});
