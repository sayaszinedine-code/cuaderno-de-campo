/** One pastel color per section of the app (classes `.sec-*` in theme.css). */
export type SectionColor = "rosa" | "celeste" | "naranja" | "lima" | "lila" | "amarillo";

const SECTIONS: [prefix: string, color: SectionColor][] = [
  ["/inicio/", "amarillo"],
  ["/cuaderno/", "rosa"],
  ["/ninos/", "celeste"],
  ["/aulas/", "celeste"],
  ["/notas/", "naranja"],
  ["/unidades/", "naranja"],
  ["/asistencia/", "lima"],
  ["/agenda/", "lila"],
  ["/reportes/", "lila"],
];

/** Color of the section a path belongs to (sub-routes keep their parent's); lila otherwise. */
export function sectionColor(pathname: string): SectionColor {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return SECTIONS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "lila";
}
