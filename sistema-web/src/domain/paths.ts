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

export function classroomDir(y: number, c: Pick<Classroom, "name" | "bands">): string {
  return `${y}/${safeName(`Aula ${safeName(c.name)} (${bandsLabel(c.bands)})`)}/`;
}

export function studentDir(
  y: number,
  c: Pick<Classroom, "name" | "bands">,
  s: Pick<Student, "firstNames" | "lastNames">,
): string {
  return `${classroomDir(y, c)}Niños/${safeName(`${safeName(s.lastNames)}, ${safeName(s.firstNames)}`)}/`;
}
