import { todayISO } from "./classrooms";
import type { FieldNote, Period, Session, Unit, UnitsFile } from "./schema";

type IdGen = () => string;
const newId: IdGen = () => crypto.randomUUID();

export function newUnit(
  input: { classroomId: string; periodId: Period["id"] },
  genId: IdGen = newId,
  now: Date = new Date(),
): Unit {
  const stamp = now.toISOString();
  return {
    id: genId(),
    classroomId: input.classroomId,
    periodId: input.periodId,
    kind: "unidad",
    title: "",
    purpose: "",
    competencyIds: [],
    performances: [],
    description: "",
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function upsertUnit(f: UnitsFile, u: Unit, now: Date = new Date()): UnitsFile {
  const next: Unit = { ...u, updatedAt: now.toISOString() };
  const exists = f.units.some((x) => x.id === u.id);
  return { ...f, units: exists ? f.units.map((x) => (x.id === u.id ? next : x)) : [...f.units, next] };
}

/** Removes the unit and its sessions. */
export function removeUnit(f: UnitsFile, id: string): UnitsFile {
  return { ...f, units: f.units.filter((u) => u.id !== id), sessions: f.sessions.filter((s) => s.unitId !== id) };
}

export function validateUnit(u: Pick<Unit, "title" | "start" | "end">): string | null {
  if (u.title.trim() === "") return "Escribe un título.";
  if (u.start && u.end && u.start > u.end) return "La fecha de inicio es posterior a la de fin.";
  return null;
}

/** Files that live under a unit: its own attachments and those of its sessions. */
export function unitFilePaths(f: UnitsFile, unitId: string): string[] {
  const own = f.units.find((u) => u.id === unitId)?.attachments ?? [];
  const sessions = f.sessions.filter((s) => s.unitId === unitId).flatMap((s) => s.attachments);
  return [...own, ...sessions].map((a) => a.path);
}

export function newSession(unit: Pick<Unit, "id" | "competencyIds">, genId: IdGen = newId, now: Date = new Date()): Session {
  const stamp = now.toISOString();
  return {
    id: genId(),
    unitId: unit.id,
    date: todayISO(now),
    title: "",
    purpose: "",
    competencyIds: [...unit.competencyIds],
    performances: [],
    description: "",
    attachments: [],
    noteIds: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function upsertSession(f: UnitsFile, s: Session, now: Date = new Date()): UnitsFile {
  const next: Session = { ...s, updatedAt: now.toISOString() };
  const exists = f.sessions.some((x) => x.id === s.id);
  return { ...f, sessions: exists ? f.sessions.map((x) => (x.id === s.id ? next : x)) : [...f.sessions, next] };
}

export function removeSession(f: UnitsFile, id: string): UnitsFile {
  return { ...f, sessions: f.sessions.filter((s) => s.id !== id) };
}

export function validateSession(s: Pick<Session, "title" | "date">): string | null {
  if (s.title.trim() === "") return "Escribe un título.";
  if (!s.date) return "Elige la fecha de la sesión.";
  return null;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

export function sessionsOfUnit(f: UnitsFile, unitId: string): Session[] {
  return f.sessions.filter((s) => s.unitId === unitId).sort(byDate);
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Notes of the classroom dated within `days` days (inclusive) of `date`, oldest first. */
export function notesNear(notes: FieldNote[], classroomId: string, date: string, days = 7): FieldNote[] {
  if (!date) return [];
  const center = dayNumber(date);
  return notes
    .filter((n) => n.classroomId === classroomId && Math.abs(dayNumber(n.date) - center) <= days)
    .sort(byDate);
}

export function linkedSessionsOfNote(f: UnitsFile, noteId: string): Session[] {
  return f.sessions.filter((s) => s.noteIds.includes(noteId)).sort(byDate);
}

/** Drops the ids of notes that no longer exist. */
export function pruneNoteIds(s: Pick<Session, "noteIds">, notes: Pick<FieldNote, "id">[]): string[] {
  return s.noteIds.filter((id) => notes.some((n) => n.id === id));
}
