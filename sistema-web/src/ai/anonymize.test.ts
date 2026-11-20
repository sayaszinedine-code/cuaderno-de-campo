import { describe, expect, it } from "vitest";
import { anonymize } from "./anonymize";

const jose = { firstNames: "José María", lastNames: "Quispe Huamán" };

describe("anonymize", () => {
  it("replaces a full name with initials and builds a legend", () => {
    const r = anonymize("José María Quispe Huamán trepó solo.", [jose]);
    expect(r.text).toBe("J. M. Q. H. trepó solo.");
    expect(r.legend).toEqual({ "J. M. Q. H.": "José María Quispe Huamán" });
  });
  it("matches ignoring accents and case, including lone tokens", () => {
    expect(anonymize("jose dijo hola. QUISPE sonrió.", [jose]).text).toBe("J. M. Q. H. dijo hola. J. M. Q. H. sonrió.");
  });
  it("does not touch substrings of other words", () => {
    const ana = { firstNames: "Ana", lastNames: "Paz" };
    const luis = { firstNames: "Luis", lastNames: "Rojas" };
    expect(anonymize("Mañana Luisa y Pazos vienen.", [ana, luis]).text).toBe("Mañana Luisa y Pazos vienen.");
    expect(anonymize("Ana, Luis.", [ana, luis]).text).toBe("A. P., L. R..");
  });
  it("ignores tokens shorter than 3 chars", () => {
    expect(anonymize("Du saluda a Cruz", [{ firstNames: "Ana", lastNames: "Cruz Du" }]).text).toBe("Du saluda a A. C. D.");
  });
  it("handles no students", () => {
    expect(anonymize("hola", []).text).toBe("hola");
  });
});
