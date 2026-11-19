import type { Classroom, Student } from "./schema";

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

function bandsLabel(bands: Classroom["bands"]): string {
  if (bands.length !== 1) return "multiedad";
  const b = bands[0];
  return b.endsWith("y") ? `${b.slice(0, -1)} años` : `${b.slice(0, -1)} meses`;
}

/** `<base> - <first 4 chars of id>`: the id fragment keeps homonyms apart and survives truncation. */
function withIdSuffix(base: string, id: string): string {
  const suffix = ` - ${safeName(id.slice(0, 4))}`;
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
