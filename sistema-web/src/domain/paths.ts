import type {
  Classroom,
  FieldNote,
  Period,
  Session,
  Student,
  Unit,
} from "./schema";

/** Strips path-hostile characters, collapses spaces, caps at 80 chars; never empty or dot-only. */
export function safeName(s: string): string {
  let cleaned = s
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  // Keep names within 240 UTF-8 bytes so every file system accepts them.
  while (new TextEncoder().encode(cleaned).length > 240)
    cleaned = Array.from(cleaned).slice(0, -1).join("");
  cleaned = cleaned.replace(/[. ]+$/, "");
  // Windows reserved device names (with or without extension) cannot be created or restored.
  if (
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(
      cleaned.split(".")[0].trimEnd(),
    )
  ) {
    const dot = cleaned.indexOf(".");
    cleaned =
      dot < 0
        ? `${cleaned}_`
        : `${cleaned.slice(0, dot)}_${cleaned.slice(dot)}`;
  }
  return cleaned === "" || /^\.+$/.test(cleaned) ? "_" : cleaned;
}

export const profilePath = () => "datos/perfil.json";
export const yearDataPath = (y: number) => `${y}/datos/anio.json`;
export const notesPath = (y: number) => `${y}/datos/cuaderno.json`;
export const gradesPath = (y: number) => `${y}/datos/notas.json`;
export const unitsPath = (y: number) => `${y}/datos/unidades.json`;
export const attendancePath = (y: number) => `${y}/datos/asistencia.json`;
export const agendaPath = (y: number) => `${y}/datos/agenda.json`;

/** "B1" -> "Bimestre 1". */
const periodFolder = (id: Period["id"]) => `Bimestre ${id.slice(1)}`;

function bandsLabel(bands: Classroom["bands"]): string {
  if (bands.length !== 1) return "multiedad";
  const b = bands[0];
  return b.endsWith("y") ? `${b.slice(0, -1)} años` : `${b.slice(0, -1)} meses`;
}

/** `<base> - <first n chars of id>`: the id fragment keeps homonyms apart and survives truncation. */
function withIdSuffix(base: string, id: string, n = 4): string {
  const suffix = ` - ${safeName(id.slice(0, n))}`;
  return safeName(
    `${safeName(base)
      .slice(0, 80 - suffix.length)
      .trim()}${suffix}`,
  );
}

export function classroomDir(
  y: number,
  c: Pick<Classroom, "id" | "name" | "bands">,
): string {
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

export function unitDir(
  y: number,
  c: Pick<Classroom, "id" | "name" | "bands">,
  u: Pick<Unit, "id" | "title" | "periodId">,
): string {
  return `${classroomDir(y, c)}Unidades y sesiones/${periodFolder(u.periodId)}/${withIdSuffix(u.title || "Sin título", u.id, 8)}/`;
}

export function sessionDir(
  y: number,
  c: Pick<Classroom, "id" | "name" | "bands">,
  u: Pick<Unit, "id" | "title" | "periodId">,
  s: Pick<Session, "id" | "date" | "title">,
): string {
  return `${unitDir(y, c, u)}Sesiones/${withIdSuffix(`${s.date} ${s.title}`.trim(), s.id, 8)}/`;
}
