import type { Area, Competency, Cycle } from "./types";

/** Source: Programa curricular de Educación Inicial, organization table (printed p. 66). */
export const AREAS: Area[] = [
  { id: "personal-social", name: "Personal Social", cycles: ["I", "II"] },
  { id: "psicomotriz", name: "Psicomotriz", cycles: ["I", "II"] },
  { id: "comunicacion", name: "Comunicación", cycles: ["I", "II"] },
  { id: "descubrimiento-mundo", name: "Descubrimiento del mundo", cycles: ["I"] },
  { id: "castellano-l2", name: "Castellano como segunda lengua", cycles: ["II"] },
  { id: "matematica", name: "Matemática", cycles: ["II"] },
  { id: "ciencia-tecnologia", name: "Ciencia y Tecnología", cycles: ["II"] },
];

/** Pseudo area id for competencies transversal to all areas. */
export const TRANSVERSAL_AREA_ID = "transversal";

export const COMPETENCIES: Competency[] = [
  {
    id: "construye-identidad",
    areaId: "personal-social",
    name: "Construye su identidad",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "convive-participa",
    areaId: "personal-social",
    name: "Convive y participa democráticamente en la búsqueda del bien común",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "construye-identidad-religion",
    areaId: "personal-social",
    name: "Construye su identidad, como persona humana, amada por Dios, digna, libre y trascendente, comprendiendo la doctrina de su propia religión, abierto al diálogo con las que le son cercanas",
    cycles: ["II"],
    transversal: false,
    optional: true,
  },
  {
    id: "se-desenvuelve-motricidad",
    areaId: "psicomotriz",
    name: "Se desenvuelve de manera autónoma a través de su motricidad",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "comunica-oralmente",
    areaId: "comunicacion",
    name: "Se comunica oralmente en su lengua materna",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "lee",
    areaId: "comunicacion",
    name: "Lee diversos tipos de texto en su lengua materna",
    cycles: ["II"],
    transversal: false,
    optional: false,
  },
  {
    id: "escribe",
    areaId: "comunicacion",
    name: "Escribe diversos tipos de texto en su lengua materna",
    cycles: ["II"],
    transversal: false,
    optional: false,
  },
  {
    id: "crea-proyectos",
    areaId: "comunicacion",
    name: "Crea proyectos desde los lenguajes del arte",
    cycles: ["II"],
    transversal: false,
    optional: false,
  },
  {
    id: "comunica-oralmente-castellano-l2",
    areaId: "castellano-l2",
    name: "Se comunica oralmente en castellano como segunda lengua",
    cycles: ["II"],
    transversal: false,
    optional: true,
  },
  {
    id: "resuelve-cantidad",
    areaId: "matematica",
    areaByCycle: { I: "descubrimiento-mundo" },
    name: "Resuelve problemas de cantidad",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "resuelve-forma-movimiento",
    areaId: "matematica",
    areaByCycle: { I: "descubrimiento-mundo" },
    name: "Resuelve problemas de forma, movimiento y localización",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "indaga",
    areaId: "ciencia-tecnologia",
    areaByCycle: { I: "descubrimiento-mundo" },
    name: "Indaga mediante métodos científicos para construir sus conocimientos",
    cycles: ["I", "II"],
    transversal: false,
    optional: false,
  },
  {
    id: "tic",
    areaId: TRANSVERSAL_AREA_ID,
    name: "Se desenvuelve en entornos virtuales generados por las TIC",
    cycles: ["II"],
    transversal: true,
    optional: true,
  },
  {
    id: "gestiona-aprendizaje",
    areaId: TRANSVERSAL_AREA_ID,
    name: "Gestiona su aprendizaje de manera autónoma",
    cycles: ["II"],
    transversal: true,
    optional: true,
  },
];

/** Area id of a competency in a given cycle. */
export function areaIdFor(competency: Competency, cycle: Cycle): string {
  return competency.areaByCycle?.[cycle] ?? competency.areaId;
}
