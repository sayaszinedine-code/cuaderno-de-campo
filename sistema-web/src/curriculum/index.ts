import { AREAS, COMPETENCIES, areaIdFor } from "./catalog";
import type { AgeBand, Area, Competency, Cycle, Performance, PerformanceFile } from "./types";

import construyeIdentidad from "./performances/construye-identidad.json";
import conviveParticipa from "./performances/convive-participa.json";
import construyeIdentidadReligion from "./performances/construye-identidad-religion.json";
import seDesenvuelveMotricidad from "./performances/se-desenvuelve-motricidad.json";
import comunicaOralmente from "./performances/comunica-oralmente.json";
import lee from "./performances/lee.json";
import escribe from "./performances/escribe.json";
import creaProyectos from "./performances/crea-proyectos.json";
import comunicaOralmenteCastellanoL2 from "./performances/comunica-oralmente-castellano-l2.json";
import resuelveCantidad from "./performances/resuelve-cantidad.json";
import resuelveFormaMovimiento from "./performances/resuelve-forma-movimiento.json";
import indaga from "./performances/indaga.json";
import tic from "./performances/tic.json";
import gestionaAprendizaje from "./performances/gestiona-aprendizaje.json";

export type { AgeBand, Area, Competency, Cycle, Performance } from "./types";
export { COMPETENCIES, AREAS, areaIdFor } from "./catalog";

export const CYCLE_BANDS: Record<Cycle, AgeBand[]> = {
  I: ["9m", "18m", "24m", "36m"],
  II: ["3y", "4y", "5y"],
};

const BAND_ORDER: AgeBand[] = ["9m", "18m", "24m", "36m", "3y", "4y", "5y"];

const PERFORMANCE_FILES = [
  construyeIdentidad,
  conviveParticipa,
  construyeIdentidadReligion,
  seDesenvuelveMotricidad,
  comunicaOralmente,
  lee,
  escribe,
  creaProyectos,
  comunicaOralmenteCastellanoL2,
  resuelveCantidad,
  resuelveFormaMovimiento,
  indaga,
  tic,
  gestionaAprendizaje,
] as PerformanceFile[];

const PERFORMANCES = new Map<string, PerformanceFile["byAge"]>(
  PERFORMANCE_FILES.map((f) => [f.competencyId, f.byAge]),
);

export function getAreas(cycle: Cycle): Area[] {
  return AREAS.filter((a) => a.cycles.includes(cycle));
}

export function getCompetencies(cycle: Cycle): Competency[] {
  return COMPETENCIES.filter((c) => c.cycles.includes(cycle));
}

/** Competencies of an area in a cycle (honours `areaByCycle`). */
export function getCompetenciesByArea(cycle: Cycle, areaId: string): Competency[] {
  return getCompetencies(cycle).filter((c) => areaIdFor(c, cycle) === areaId);
}

export function getPerformances(competencyId: string, band: AgeBand): Performance[] {
  return PERFORMANCES.get(competencyId)?.[band] ?? [];
}

/** Age bands that have a desempeños list for the competency, in age order. */
export function getPerformanceBands(competencyId: string): AgeBand[] {
  const byAge = PERFORMANCES.get(competencyId);
  if (!byAge) return [];
  return BAND_ORDER.filter((b) => (byAge[b]?.length ?? 0) > 0);
}
