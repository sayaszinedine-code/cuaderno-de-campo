import { getAreas, TRANSVERSAL_AREA_ID, type Area, type Cycle } from "@/curriculum";

export const TRANSVERSAL_AREA: Area = {
  id: TRANSVERSAL_AREA_ID,
  name: "Competencias transversales",
  cycles: ["II"],
};

/** Areas of the given cycles (deduplicated), plus the transversal one when any cycle has such competencies. */
export function areasForCycles(cycles: Cycle[]): Area[] {
  const m = new Map<string, Area>();
  cycles.flatMap((c) => getAreas(c)).forEach((a) => m.set(a.id, a));
  if (cycles.includes("II")) m.set(TRANSVERSAL_AREA.id, TRANSVERSAL_AREA);
  return [...m.values()];
}

export function areaName(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  return areasForCycles(["I", "II"]).find((a) => a.id === id)?.name;
}
