export type Cycle = "I" | "II";

export type AgeBand = "9m" | "18m" | "24m" | "36m" | "3y" | "4y" | "5y";

export interface Area {
  id: string;
  name: string;
  cycles: Cycle[];
}

export interface Competency {
  id: string;
  /** Area the competency belongs to (its Cycle II area). Transversal ones use "transversal". */
  areaId: string;
  /**
   * Overrides `areaId` for specific cycles. Needed because in Cycle I the
   * competencies of Matemática and Ciencia y Tecnología live inside the area
   * "Descubrimiento del mundo".
   */
  areaByCycle?: Partial<Record<Cycle, string>>;
  name: string;
  /** Compact label (≤ 32 chars, unique per cycle) for table headers and cards. */
  shortName: string;
  cycles: Cycle[];
  transversal: boolean;
  /** Can be disabled per classroom (Religión, Castellano como segunda lengua, transversales). */
  optional: boolean;
}

export interface Performance {
  /** Statement of the desempeño, without the example. */
  text: string;
  /** Illustrative example from the PDF, without the "Ejemplo:" label. */
  example?: string;
}

export interface PerformanceFile {
  competencyId: string;
  byAge: Partial<Record<AgeBand, Performance[]>>;
}
