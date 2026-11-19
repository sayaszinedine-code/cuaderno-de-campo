import { describe, expect, it } from "vitest";
import { classroomDir, profilePath, safeName, studentDir, yearDataPath } from "./paths";
import type { Classroom } from "./schema";

const room = (bands: Classroom["bands"], name = "Girasoles"): Classroom => ({
  id: "c1",
  name,
  cycle: bands[0] === "3y" || bands[0] === "4y" || bands[0] === "5y" ? "II" : "I",
  bands,
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
});

describe("safeName", () => {
  it("removes forbidden chars and collapses spaces", () => {
    expect(safeName('Aula "A"/B')).toBe("Aula A B");
  });
  it("never returns a traversal segment", () => {
    expect(safeName("..")).toBe("_");
    expect(safeName(".")).toBe("_");
    expect(safeName("")).toBe("_");
    expect(safeName(" / ")).toBe("_");
  });
  it("truncates to 80 chars", () => {
    expect(safeName("a".repeat(200))).toHaveLength(80);
  });
});

describe("paths", () => {
  it("fixed paths", () => {
    expect(profilePath()).toBe("datos/perfil.json");
    expect(yearDataPath(2026)).toBe("2026/datos/anio.json");
  });
  it("classroomDir labels", () => {
    expect(classroomDir(2026, room(["4y"]))).toBe("2026/Aula Girasoles (4 años)/");
    expect(classroomDir(2026, room(["18m"]))).toBe("2026/Aula Girasoles (18 meses)/");
    expect(classroomDir(2026, room(["3y", "4y"]))).toBe("2026/Aula Girasoles (multiedad)/");
  });
  it("studentDir", () => {
    expect(studentDir(2026, room(["4y"]), { lastNames: "Pérez Ruiz", firstNames: "Ana" })).toBe(
      "2026/Aula Girasoles (4 años)/Niños/Pérez Ruiz, Ana/",
    );
  });
  it("hostile names cannot traverse", () => {
    const p = studentDir(2026, room(["4y"], ".."), { lastNames: "..", firstNames: ".." });
    expect(p.split("/")).not.toContain("..");
  });
});
