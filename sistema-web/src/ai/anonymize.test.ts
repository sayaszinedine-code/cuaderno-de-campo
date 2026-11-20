import { describe, expect, it } from "vitest";
import { anonymize, deanonymize } from "./anonymize";

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

  it("normalizes compatibility forms and strips invisible format characters before matching", () => {
    const kids = [
      { firstNames: "María", lastNames: "O'Brien" },
      { firstNames: "José", lastNames: "Paz" },
      { firstNames: "Luis", lastNames: "Rojas" },
    ];
    expect(anonymize("Ma\u00ADría llegó.", kids).text).toBe("M. O. B. llegó.");
    expect(anonymize("Jo\u200Bsé llegó.", kids).text).toBe("J. P. llegó.");
    expect(anonymize("\uFF2C\uFF55\uFF49\uFF53 llegó.", kids).text).toBe("L. R. llegó.");
    expect(anonymize("\u2060Luis\uFEFF llegó.", kids).text).toBe("L. R. llegó.");
  });
  it("treats modifier, left, acute and grave apostrophes as separators", () => {
    const a = [{ firstNames: "Ana", lastNames: "O'Brien" }];
    for (const ap of ["\u02BC", "\u2018", "\u00B4", "`"]) {
      expect(anonymize(`O${ap}brien vino.`, a).text).toBe("A. O. B. vino.");
    }
  });
});

describe("deanonymize", () => {
  const kids = [
    { firstNames: "Ana", lastNames: "Paz" },
    { firstNames: "Alba", lastNames: "Pérez" },
    { firstNames: "José María", lastNames: "Quispe Huamán" },
  ];
  it("round-trips: restores full names, suffixed duplicates map to their owner", () => {
    const { text, legend } = anonymize("Ana Paz, Alba Pérez y José María Quispe Huamán juegan.", kids);
    expect(text).toBe("A. P., A. P. (2) y J. M. Q. H. juegan.");
    expect(deanonymize("A. P. (2) ayudó a A. P. y a J. M. Q. H. hoy", legend)).toBe(
      "Alba Pérez ayudó a Ana Paz y a José María Quispe Huamán hoy",
    );
  });
  it("keeps the full stop when a label ends a sentence", () => {
    const { legend } = anonymize("Ana Paz", kids);
    expect(deanonymize("Jugó con A. P.", legend)).toBe("Jugó con Ana Paz.");
    expect(deanonymize("Jugó con A. P. Luego rió.\nA. P. y yo", legend)).toBe("Jugó con Ana Paz. Luego rió.\nAna Paz y yo");
  });
  it("matches whole tokens only", () => {
    const { legend } = anonymize("Ana Paz", kids);
    expect(deanonymize("XA. P. y A. P.x", legend)).toBe("XA. P. y A. P.x");
    expect(deanonymize("(A. P.)", legend)).toBe("(Ana Paz)");
  });
  it("leaves ambiguous labels as they are", () => {
    const shared = [
      { firstNames: "Ana", lastNames: "Quispe" },
      { firstNames: "Luis", lastNames: "Quispe" },
    ];
    const { text, legend } = anonymize("Quispe jugó con Ana.", shared);
    expect(text).toBe("Q. jugó con A. Q..");
    expect(deanonymize("Q. jugó con A. Q. hoy", legend)).toBe("Q. jugó con Ana Quispe hoy");
    expect(legend).not.toHaveProperty("Q.");
  });
  it("drops a label used both for one child and for a shared token", () => {
    const kids2 = [
      { firstNames: "Quintín", lastNames: "" },
      { firstNames: "Ana", lastNames: "Quispe" },
      { firstNames: "Luis", lastNames: "Quispe" },
    ];
    const { text, legend } = anonymize("Quintín y Quispe", kids2);
    expect(text).toBe("Q. y Q.");
    expect(deanonymize("Q. y Q.", legend)).toBe("Q. y Q.");
  });
});
