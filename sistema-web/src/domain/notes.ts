import { CYCLE_BANDS, getCompetencies, getPerformanceBands, type AgeBand } from "@/curriculum";
import { bandFor } from "./age";
import { todayISO } from "./classrooms";
import type { Classroom, FieldNote, NoteKind, NotesFile, Period, Student, YearData } from "./schema";

type IdGen = () => string;
const newId: IdGen = () => crypto.randomUUID();

export const DEFAULT_MOMENT = "Juego libre en sectores";

export function newNote(
  input: { classroomId: string; date?: string },
  genId: IdGen = newId,
  now: Date = new Date(),
): FieldNote {
  const stamp = now.toISOString();
  return {
    id: genId(),
    date: input.date ?? todayISO(now),
    classroomId: input.classroomId,
    studentIds: [],
    wholeGroup: false,
    moment: DEFAULT_MOMENT,
    kind: "obs",
    performances: [],
    evidenceText: "",
    evidence: [],
    interpretation: "",
    reflection: "",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function upsertNote(f: NotesFile, n: FieldNote, now: Date = new Date()): NotesFile {
  const next: FieldNote = { ...n, updatedAt: now.toISOString() };
  const exists = f.notes.some((x) => x.id === n.id);
  return { ...f, notes: exists ? f.notes.map((x) => (x.id === n.id ? next : x)) : [...f.notes, next] };
}

export function removeNote(f: NotesFile, id: string): NotesFile {
  return { ...f, notes: f.notes.filter((x) => x.id !== id) };
}

export function validateNote(
  n: FieldNote,
  year: YearData,
  opts: { keepStudentIds?: string[] } = {},
): string | null {
  const classroom = year.classrooms.find((c) => c.id === n.classroomId);
  if (!classroom) return "Elige un aula.";
  if (!n.wholeGroup && validStudents(n, year, opts.keepStudentIds).length === 0) return "Elige al menos un niño o niña, o marca «Todo el grupo».";
  if (n.evidenceText.trim() === "" && n.evidence.length === 0) return "Describe la evidencia o agrega una foto.";
  if (n.competencyId !== undefined && !getCompetencies(classroom.cycle).some((c) => c.id === n.competencyId)) {
    return "La competencia no corresponde al ciclo del aula.";
  }
  return null;
}

/** Active students of the note's classroom that the note refers to (`keep` ids also count when archived). */
export function validStudents(n: FieldNote, year: YearData, keep: string[] = []): Student[] {
  const ids = new Set(n.studentIds);
  const kept = new Set(keep);
  return year.students.filter(
    (s) => ids.has(s.id) && (s.active || kept.has(s.id)) && s.classroomId === n.classroomId,
  );
}

const BAND_ORDER: AgeBand[] = [...CYCLE_BANDS.I, ...CYCLE_BANDS.II];
const rank = (b: AgeBand) => BAND_ORDER.indexOf(b);

export function performanceOptions(params: {
  classroom: Classroom;
  students: Student[];
  competencyId: string;
  date: string;
  schoolYear: number;
}): { bands: AgeBand[]; defaultBand: AgeBand | null } {
  const { classroom, students, competencyId, date, schoolYear } = params;
  const available = new Set(getPerformanceBands(competencyId));
  const studentBands = students.map((s) =>
    bandFor({
      cycle: classroom.cycle,
      birthDate: s.birthDate,
      at: date,
      schoolYear,
      classroomBands: classroom.bands,
    }),
  );
  const source = students.length > 0 ? studentBands : classroom.bands;
  const bands = [...new Set(source)].filter((b) => available.has(b)).sort((a, b) => rank(a) - rank(b));

  const counts = new Map<AgeBand, number>();
  for (const b of studentBands) if (bands.includes(b)) counts.set(b, (counts.get(b) ?? 0) + 1);
  let defaultBand: AgeBand | null = bands[0] ?? null;
  let best = 0;
  for (const b of bands) {
    const c = counts.get(b) ?? 0;
    if (c > best) {
      best = c;
      defaultBand = b;
    }
  }
  return { bands, defaultBand };
}

export function periodOf(date: string, periods: Period[]): Period["id"] | null {
  return periods.find((p) => date >= p.start && date <= p.end)?.id ?? null;
}

/** Lowercase and strip diacritics, for accent- and case-insensitive search. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterNotes(
  notes: FieldNote[],
  q: {
    studentId?: string;
    areaId?: string;
    competencyId?: string;
    periodId?: Period["id"];
    kind?: NoteKind;
    text?: string;
    /** "pending" = still without an area (see isPending). */
    status?: "pending" | "complete";
    periods: Period[];
    students: Student[];
  },
): FieldNote[] {
  const byId = new Map(q.students.map((s) => [s.id, s]));
  const studentClassroom = q.studentId ? byId.get(q.studentId)?.classroomId : undefined;
  const needle = q.text ? fold(q.text.trim()) : "";

  const matches = (n: FieldNote): boolean => {
    if (q.studentId) {
      const direct = n.studentIds.includes(q.studentId);
      const group = n.wholeGroup && studentClassroom !== undefined && n.classroomId === studentClassroom;
      if (!direct && !group) return false;
    }
    if (q.areaId && n.areaId !== q.areaId) return false;
    if (q.status && isPending(n) !== (q.status === "pending")) return false;
    if (q.competencyId && n.competencyId !== q.competencyId) return false;
    if (q.periodId && periodOf(n.date, q.periods) !== q.periodId) return false;
    if (q.kind && n.kind !== q.kind) return false;
    if (needle) {
      const names = n.studentIds.flatMap((id) => {
        const s = byId.get(id);
        return s ? [s.firstNames, s.lastNames] : [];
      });
      const hay = fold([n.evidenceText, n.interpretation, n.reflection, ...names].join("\n"));
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  return notes
    .filter(matches)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function studentsWithoutRecentNotes(
  notes: FieldNote[],
  students: Student[],
  today: string,
  days = 14,
): Student[] {
  const from = shiftDays(today, -days);
  const recent = notes.filter((n) => n.date >= from && n.date <= today);
  return students.filter(
    (s) =>
      s.active &&
      !recent.some((n) => n.studentIds.includes(s.id) || (n.wholeGroup && n.classroomId === s.classroomId)),
  );
}

/** A quick record saved in class is «Por completar» until it gets an area. */
export function isPending(n: FieldNote): boolean {
  return !n.areaId;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const utcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** «Hoy», «Ayer», «12 nov», or «12 nov 2025» when the year differs from today's. */
export function dayLabel(date: string, today: string): string {
  const diff = utcDay(today) - utcDay(date);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const [y, m, d] = date.split("-").map(Number);
  const base = `${d} ${MONTHS_SHORT[m - 1] ?? ""}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}

/** Consecutive records of the same date, in the given order. */
export function groupByDay(notes: FieldNote[]): { date: string; notes: FieldNote[] }[] {
  const groups: { date: string; notes: FieldNote[] }[] = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && last.date === n.date) last.notes.push(n);
    else groups.push({ date: n.date, notes: [n] });
  }
  return groups;
}
