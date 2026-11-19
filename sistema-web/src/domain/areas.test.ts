import { describe, expect, it } from "vitest";
import { areaName, areasForCycles } from "./areas";

describe("areas", () => {
  it("adds the transversal area for cycle II only", () => {
    expect(areasForCycles(["II"]).map((a) => a.id)).toContain("transversal");
    expect(areasForCycles(["I"]).map((a) => a.id)).not.toContain("transversal");
  });
  it("resolves the transversal area name", () => {
    expect(areaName("transversal")).toBe("Competencias transversales");
    expect(areaName("comunicacion")).toBe("Comunicación");
    expect(areaName("zz")).toBeUndefined();
  });
});
