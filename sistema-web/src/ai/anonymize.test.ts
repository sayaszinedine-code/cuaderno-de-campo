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

  it("handles NFD input (combining marks)", () => {
    const nfd = "Mar\u0069\u0301a".normalize("NFD");
    expect(anonymize(`${nfd} vino`, [{ firstNames: "María", lastNames: "Paz" }]).text).toBe("M. P. vino");
    expect(anonymize("Mar\u0069\u0301a vino".normalize("NFD"), [{ firstNames: "María", lastNames: "Paz" }]).text).not.toMatch(/ar/);
  });
  it("splits compound names on hyphen and apostrophes", () => {
    const a = { firstNames: "María-José", lastNames: "O’Brien" };
    expect(anonymize("María llegó.", [a]).text).toBe("M. J. O. B. llegó.");
    expect(anonymize("José llegó.", [a]).text).toBe("M. J. O. B. llegó.");
    expect(anonymize("Brien llegó.", [a]).text).toBe("M. J. O. B. llegó.");
    expect(anonymize("O’Brien y O'Brien", [a]).text).toBe("M. J. O. B. y M. J. O. B.");
    expect(anonymize("María-José O'Brien", [a]).text).toBe("M. J. O. B.");
  });
  it("replaces an ambiguous shared token with its own initial", () => {
    const ana = { firstNames: "Ana", lastNames: "Quispe" };
    const luis = { firstNames: "Luis", lastNames: "Quispe" };
    const r = anonymize("Quispe jugó. Ana y Luis Quispe.", [ana, luis]);
    expect(r.text).toBe("Q. jugó. A. Q. y L. Q..");
  });
  it("disambiguates repeated initials and keeps legend keys unique", () => {
    const a = { firstNames: "Ana", lastNames: "Paz" };
    const b = { firstNames: "Alba", lastNames: "Pérez" };
    const r = anonymize("Ana Paz y Alba Pérez", [a, b]);
    expect(r.text).toBe("A. P. y A. P. (2)");
    expect(r.legend).toEqual({ "A. P.": "Ana Paz", "A. P. (2)": "Alba Pérez" });
  });
});
