import { describe, expect, it } from "vitest";
import {
  CYCLE_BANDS,
  areaIdFor,
  getAreas,
  getCompetencies,
  getPerformanceBands,
  getPerformances,
  type AgeBand,
  type Cycle,
} from "./index";

const CYCLE_I_BANDS: AgeBand[] = ["9m", "18m", "24m", "36m"];
const CYCLE_II_BANDS: AgeBand[] = ["3y", "4y", "5y"];

/**
 * Age bands that actually have a "DESEMPEÑOS POR EDAD" list in the PDF
 * (Programa curricular de Educación Inicial), per competency id.
 */
const EXPECTED_BANDS: Record<string, AgeBand[]> = {
  "construye-identidad": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  "convive-participa": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  "construye-identidad-religion": CYCLE_II_BANDS,
  "se-desenvuelve-motricidad": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  "comunica-oralmente": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  lee: CYCLE_II_BANDS,
  // 3 años: "No se evidencian desempeños en esta edad."
  escribe: ["4y", "5y"],
  "crea-proyectos": CYCLE_II_BANDS,
  "comunica-oralmente-castellano-l2": ["5y"],
  "resuelve-cantidad": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  "resuelve-forma-movimiento": [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  indaga: [...CYCLE_I_BANDS, ...CYCLE_II_BANDS],
  tic: ["5y"],
  "gestiona-aprendizaje": ["5y"],
};

const CYCLES: Cycle[] = ["I", "II"];

describe("areas", () => {
  it("lists the Cycle I areas", () => {
    expect(getAreas("I").map((a) => a.name)).toEqual([
      "Personal Social",
      "Psicomotriz",
      "Comunicación",
      "Descubrimiento del mundo",
    ]);
  });

  it("lists the Cycle II areas", () => {
    expect(getAreas("II").map((a) => a.name)).toEqual([
      "Personal Social",
      "Psicomotriz",
      "Comunicación",
      "Castellano como segunda lengua",
      "Matemática",
      "Ciencia y Tecnología",
    ]);
  });
});

describe("competencies", () => {
  it("has 7 competencies in Cycle I", () => {
    expect(getCompetencies("I")).toHaveLength(7);
  });

  it("has 12 area competencies and 2 transversal ones in Cycle II", () => {
    const list = getCompetencies("II");
    expect(list.filter((c) => !c.transversal)).toHaveLength(12);
    const transversal = list.filter((c) => c.transversal);
    expect(transversal).toHaveLength(2);
    expect(transversal.every((c) => c.optional)).toBe(true);
  });

  it("marks religion and Castellano L2 competencies as optional", () => {
    const optional = getCompetencies("II")
      .filter((c) => c.optional && !c.transversal)
      .map((c) => c.id)
      .sort();
    expect(optional).toEqual(["comunica-oralmente-castellano-l2", "construye-identidad-religion"]);
  });

  it("only references existing areas (except transversal ones)", () => {
    for (const cycle of CYCLES) {
      const areaIds = new Set(getAreas(cycle).map((a) => a.id));
      for (const c of getCompetencies(cycle).filter((x) => !x.transversal)) {
        const areaId = areaIdFor(c, cycle);
        expect(areaIds.has(areaId), `${c.id} (${cycle}) -> ${areaId}`).toBe(true);
      }
    }
  });

  it("has unique ids", () => {
    for (const cycle of CYCLES) {
      const ids = getCompetencies(cycle).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const all = new Set([...getCompetencies("I"), ...getCompetencies("II")].map((c) => c.id));
    expect(Object.keys(EXPECTED_BANDS).sort()).toEqual([...all].sort());
  });
});

describe("performances", () => {
  it("exposes the bands of each cycle", () => {
    expect(CYCLE_BANDS).toEqual({ I: CYCLE_I_BANDS, II: CYCLE_II_BANDS });
  });

  for (const [id, bands] of Object.entries(EXPECTED_BANDS)) {
    it(`${id}: has performances exactly for ${bands.join(", ")}`, () => {
      const cycles = CYCLES.filter((cy) => getCompetencies(cy).some((c) => c.id === id));
      expect(cycles.length).toBeGreaterThan(0);
      const allBands = cycles.flatMap((cy) => CYCLE_BANDS[cy]);
      for (const band of allBands) {
        if (bands.includes(band)) {
          expect(getPerformances(id, band).length, `${id} ${band}`).toBeGreaterThan(0);
        } else {
          expect(getPerformances(id, band), `${id} ${band}`).toEqual([]);
        }
      }
      expect(getPerformanceBands(id)).toEqual(bands);
    });
  }

  it("returns [] for unknown competencies", () => {
    expect(getPerformances("nope", "3y")).toEqual([]);
    expect(getPerformanceBands("nope")).toEqual([]);
  });

  it("has clean text: no empties, no broken words, no hyphenation leftovers", () => {
    for (const id of Object.keys(EXPECTED_BANDS)) {
      for (const band of [...CYCLE_I_BANDS, ...CYCLE_II_BANDS]) {
        for (const p of getPerformances(id, band)) {
          const fields = [p.text, ...(p.example !== undefined ? [p.example] : [])];
          for (const text of fields) {
            expect(text.trim().length, `${id} ${band}`).toBeGreaterThan(0);
            expect(text, `${id} ${band}`).toBe(text.trim());
            expect(text, `${id} ${band}`).not.toMatch(/\n/);
            expect(text, `${id} ${band}`).not.toMatch(/\w-\s\w/);
            expect(text, `${id} ${band}`).not.toMatch(/\s{2,}/);
            expect(text, `${id} ${band}`).not.toMatch(/^•/);
          }
          expect(p.text, `${id} ${band}`).not.toMatch(/Ejemplo/);
          expect(p.example ?? "", `${id} ${band}`).not.toMatch(/^Ejemplo/);
        }
      }
    }
  });

  it("separates the example from the statement", () => {
    const withExample = getPerformances("resuelve-cantidad", "5y").filter((p) => p.example);
    expect(withExample.length).toBeGreaterThan(0);
    expect(withExample[0].example!.length).toBeGreaterThan(0);
    const last = getPerformances("resuelve-cantidad", "5y").at(-1)!;
    expect(last.example).toBeUndefined();
  });
});
