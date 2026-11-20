import { describe, expect, it } from "vitest";
import { describePhoto, interpretation, objectiveEvidence, parseSuggestion, suggestCompetency } from "./prompts";

describe("prompts", () => {
  it("parses JSON wrapped in text", () => {
    expect(parseSuggestion('Claro:\n```json\n{"competencyId":"c1","performanceIndexes":[1,3],"reason":"ok"}\n```')).toEqual({
      competencyId: "c1", performanceIndexes: [1, 3], reason: "ok",
    });
  });
  it("returns null for invalid output", () => {
    expect(parseSuggestion("no json")).toBeNull();
    expect(parseSuggestion('{"reason":"x"}')).toBeNull();
    expect(parseSuggestion("{bad}")).toBeNull();
  });
  it("builders include system, Spanish and no-invent instructions", () => {
    const all = [
      objectiveEvidence("n"),
      suggestCompetency("n", [{ id: "c1", name: "Juega" }], [{ index: 1, text: "d" }]),
      interpretation("e", "c", ["d"]),
      describePhoto(),
    ];
    for (const b of all) {
      expect(b.system).toMatch(/Perú/);
      expect(b.prompt).toMatch(/español/);
      expect(b.prompt).toMatch(/no inventes/i);
    }
    expect(all[1].prompt).toMatch(/JSON/);
    expect(all[1].prompt).toContain("1. [c1] Juega");
  });
});
