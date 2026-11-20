import type { AgendaEvent, AgendaFile } from "./schema";
import { todayISO } from "./classrooms";

type IdGen = () => string;
const newId: IdGen = () => crypto.randomUUID();

export function newEvent(date: string, genId: IdGen = newId, now: Date = new Date()): AgendaEvent {
  const stamp = now.toISOString();
  return { id: genId(), date, title: "", type: "Reunión", note: "", createdAt: stamp, updatedAt: stamp };
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateEvent(e: Pick<AgendaEvent, "title" | "date" | "time">): string | null {
  if (e.title.trim() === "") return "Escribe un título.";
  if (!isRealDate(e.date)) return "Elige una fecha.";
  if (e.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) return "La hora no es válida.";
  return null;
}

/** Adds the event or replaces the one with the same id (extra duplicates are dropped). */
export function upsertEvent(f: AgendaFile, e: AgendaEvent, now: Date = new Date()): AgendaFile {
  const next: AgendaEvent = { ...e, updatedAt: now.toISOString() };
  const first = f.events.findIndex((x) => x.id === e.id);
  const events = f.events.filter((x) => x.id !== e.id);
  events.splice(first < 0 ? events.length : Math.min(first, events.length), 0, next);
  return { ...f, events };
}

export function removeEvent(f: AgendaFile, id: string): AgendaFile {
  return { ...f, events: f.events.filter((e) => e.id !== id) };
}

const byDateTime = (a: AgendaEvent, b: AgendaEvent) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");

export function eventsOn(f: AgendaFile, date: string): AgendaEvent[] {
  return f.events.filter((e) => e.date === date).sort(byDateTime);
}

/** Events from `today` through `today + days - 1`, by date and time. */
export function upcoming(f: AgendaFile, today: string, days = 14): AgendaEvent[] {
  const [y, m, d] = today.split("-").map(Number);
  const last = todayISO(new Date(y, m - 1, d + days - 1));
  return f.events.filter((e) => e.date >= today && e.date <= last).sort(byDateTime);
}
