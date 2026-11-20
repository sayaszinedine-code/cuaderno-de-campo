import type { Period, Unit, UnitsFile } from "./schema";

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
