import { describe, expect, it } from "vitest";
import type { AgeBand } from "@/curriculum/types";
import { ageAtMarch31, ageInMonths, bandFor, formatAge } from "./age";

describe("ageInMonths", () => {
  it("counts completed months", () => {
    expect(ageInMonths("2025-01-15", "2026-03-14")).toBe(13);
    expect(ageInMonths("2025-01-15", "2026-03-15")).toBe(14);
  });
  it("returns null for future or missing birth date", () => {
    expect(ageInMonths("2027-01-01", "2026-01-01")).toBeNull();
    expect(ageInMonths("", "2026-01-01")).toBeNull();
  });
});

describe("ageAtMarch31", () => {
  it("returns completed years at March 31", () => {
    expect(ageAtMarch31("2022-03-31", 2026)).toBe(4);
    expect(ageAtMarch31("2022-04-01", 2026)).toBe(3);
  });
});

describe("bandFor", () => {
  const multi: AgeBand[] = ["3y", "4y", "5y"];
  const at = "2026-06-01";
  // birth date that yields `m` completed months at `at`
  const born = (m: number) => {
    const total = 2026 * 12 + 5 - m; // June 2026 = index 5
    const y = Math.floor(total / 12);
    const mo = (total % 12) + 1;
    return `${y}-${String(mo).padStart(2, "0")}-01`;
  };

  it.each([
    [0, "9m"], [9, "9m"], [10, "18m"], [18, "18m"], [19, "24m"], [25, "36m"], [40, "36m"],
  ] as const)("Cycle I: %i months -> %s", (m, band) => {
    expect(
      bandFor({ cycle: "I", birthDate: born(m), at, schoolYear: 2026, classroomBands: ["18m"] }),
    ).toBe(band);
  });

  it.each([
    [2, "3y"], [3, "3y"], [4, "4y"], [5, "5y"], [6, "5y"],
  ] as const)("Cycle II multi-age: age %i at March 31 -> %s", (age, band) => {
    expect(
      bandFor({ cycle: "II", birthDate: `${2026 - age}-01-01`, at, schoolYear: 2026, classroomBands: multi }),
    ).toBe(band);
  });

  it("Cycle II single-band classroom governs", () => {
    expect(
      bandFor({ cycle: "II", birthDate: "2021-01-01", at, schoolYear: 2026, classroomBands: ["4y"] }),
    ).toBe("4y");
  });

  it("falls back to first classroom band on missing or future birth date", () => {
    for (const cycle of ["I", "II"] as const) {
      expect(bandFor({ cycle, at, schoolYear: 2026, classroomBands: ["24m", "36m"] })).toBe("24m");
      expect(
        bandFor({ cycle, birthDate: "2030-01-01", at, schoolYear: 2026, classroomBands: ["24m", "36m"] }),
      ).toBe("24m");
    }
  });
});

describe("formatAge", () => {
  it("formats years and months", () => {
    expect(formatAge("2022-01-10", "2026-03-20")).toBe("4 años 2 meses");
  });
  it("uses months under 36 months", () => {
    expect(formatAge("2025-01-15", "2026-03-15")).toBe("14 meses");
  });
});
