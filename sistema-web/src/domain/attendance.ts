import type { AttendanceDay, AttendanceFile, AttendanceMark } from "./schema";

export type AttendanceSummary = {
  P: number;
  T: number;
  F: number;
  J: number;
  marked: number;
  /** Share of marked days counted as attendance (P and T); null when nothing is marked. */
  pct: number | null;
};

/** Marks of a day, merging every entry for (date, classroomId); later entries win per student. */
function mergedMarks(f: AttendanceFile, classroomId: string, date: string): Record<string, AttendanceMark> {
  const out: Record<string, AttendanceMark> = {};
  for (const d of f.days) {
    if (d.date === date && d.classroomId === classroomId) Object.assign(out, d.marks);
  }
  return out;
}

/** Replaces every entry for (date, classroomId) with a single one; an empty day is dropped. */
function writeDay(
  f: AttendanceFile,
  classroomId: string,
  date: string,
  marks: Record<string, AttendanceMark>,
): AttendanceFile {
  const first = f.days.findIndex((d) => d.date === date && d.classroomId === classroomId);
  const days = f.days.filter((d) => !(d.date === date && d.classroomId === classroomId));
  if (Object.keys(marks).length > 0) {
    const day: AttendanceDay = { date, classroomId, marks };
    days.splice(first < 0 ? days.length : Math.min(first, days.length), 0, day);
  }
  return { ...f, days };
}

export function markOf(
  f: AttendanceFile,
  classroomId: string,
  date: string,
  studentId: string,
): AttendanceMark | undefined {
  return mergedMarks(f, classroomId, date)[studentId];
}

export function setMark(
  f: AttendanceFile,
  classroomId: string,
  date: string,
  studentId: string,
  mark: AttendanceMark | null,
): AttendanceFile {
  const marks = mergedMarks(f, classroomId, date);
  if (mark === null) delete marks[studentId];
  else marks[studentId] = mark;
  return writeDay(f, classroomId, date, marks);
}

export function markAllPresent(
  f: AttendanceFile,
  classroomId: string,
  date: string,
  studentIds: string[],
): AttendanceFile {
  const marks = mergedMarks(f, classroomId, date);
  for (const id of studentIds) if (marks[id] === undefined) marks[id] = "P";
  return writeDay(f, classroomId, date, marks);
}

export function summary(
  f: AttendanceFile,
  q: { classroomId: string; studentId?: string; from: string; to: string },
): AttendanceSummary {
  const r: AttendanceSummary = { P: 0, T: 0, F: 0, J: 0, marked: 0, pct: null };
  for (const d of f.days) {
    if (d.classroomId !== q.classroomId || d.date < q.from || d.date > q.to) continue;
    for (const [id, m] of Object.entries(d.marks)) {
      if (q.studentId !== undefined && id !== q.studentId) continue;
      r[m]++;
      r.marked++;
    }
  }
  if (r.marked > 0) r.pct = Math.round(((r.P + r.T) / r.marked) * 100);
  return r;
}

/** Days of `month` (`YYYY-MM`) for a classroom, one entry per date, sorted by date. */
export function monthDays(f: AttendanceFile, classroomId: string, month: string): AttendanceDay[] {
  const dates = [
    ...new Set(f.days.filter((d) => d.classroomId === classroomId && d.date.startsWith(`${month}-`)).map((d) => d.date)),
  ].sort();
  return dates.map((date) => ({ date, classroomId, marks: mergedMarks(f, classroomId, date) }));
}
