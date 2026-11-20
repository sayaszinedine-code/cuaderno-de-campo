import type { Classroom, FieldNote, Student } from "./schema";

/** Strips path-hostile characters, collapses spaces, caps at 80 chars; never empty or dot-only. */
export function safeName(s: string): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned === "" || /^\.+$/.test(cleaned) ? "_" : cleaned;
}

export const profilePath = () => "datos/perfil.json";
export const yearDataPath = (y: number) => `${y}/datos/anio.json`;
export const notesPath = (y: number) => `${y}/datos/cuaderno.json`;

function bandsLabel(bands: Classroom["bands"]): string {
  if (bands.length !== 1) return "multiedad";
  const b = bands[0];
  return b.endsWith("y") ? `${b.slice(0, -1)} años` : `${b.slice(0, -1)} meses`;
}

/** `<base> - <first n chars of id>`: the id fragment keeps homonyms apart and survives truncation. */
function withIdSuffix(base: string, id: string, n = 4): string {
  const suffix = ` - ${safeName(id.slice(0, n))}`;
  return safeName(`${safeName(base).slice(0, 80 - suffix.length).trim()}${suffix}`);
}

export function classroomDir(y: number, c: Pick<Classroom, "id" | "name" | "bands">): string {
  return `${y}/${withIdSuffix(`Aula ${safeName(c.name)} (${bandsLabel(c.bands)})`, c.id)}/`;
}

export function studentDir(
  y: number,
  c: Pick<Classroom, "id" | "name" | "bands">,
  s: Pick<Student, "id" | "firstNames" | "lastNames">,
): string {
  return `${classroomDir(y, c)}Niños/${withIdSuffix(`${safeName(s.lastNames)}, ${safeName(s.firstNames)}`, s.id)}/`;
}

/** Notes of the same day share a date: 8 id chars keep their photo folders apart. */
export function noteDir(
  y: number,
  c: Pick<Classroom, "id" | "name" | "bands">,
  note: Pick<FieldNote, "id" | "date">,
): string {
  return `${classroomDir(y, c)}Cuaderno de campo/${withIdSuffix(note.date, note.id, 8)}/`;
}
