import { describe, expect, it } from "vitest";
import { classroomDir, profilePath, safeName, studentDir, yearDataPath } from "./paths";
import type { Classroom } from "./schema";

const room = (bands: Classroom["bands"], name = "Girasoles", id = "c1a2b3c4"): Classroom => ({
  id,
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
    expect(classroomDir(2026, room(["4y"]))).toBe("2026/Aula Girasoles (4 años) - c1a2/");
    expect(classroomDir(2026, room(["18m"]))).toBe("2026/Aula Girasoles (18 meses) - c1a2/");
    expect(classroomDir(2026, room(["3y", "4y"]))).toBe("2026/Aula Girasoles (multiedad) - c1a2/");
  });
  it("studentDir", () => {
    expect(studentDir(2026, room(["4y"]), { id: "s9f8e7d6", lastNames: "Pérez Ruiz", firstNames: "Ana" })).toBe(
      "2026/Aula Girasoles (4 años) - c1a2/Niños/Pérez Ruiz, Ana - s9f8/",
    );
  });
  it("homonyms get distinct folders", () => {
    const c = room(["4y"]);
    const a = studentDir(2026, c, { id: "aaaa1111", lastNames: "Quispe", firstNames: "Luis" });
    const b = studentDir(2026, c, { id: "bbbb2222", lastNames: "Quispe", firstNames: "Luis" });
    expect(a).not.toBe(b);
    expect(classroomDir(2026, room(["4y"], "Sol", "x1"))).not.toBe(classroomDir(2026, room(["4y"], "Sol", "y1")));
  });
  it("keeps the id suffix even for very long names", () => {
    const p = studentDir(2026, room(["4y"], "A".repeat(200)), { id: "s9f8e7d6", lastNames: "B".repeat(200), firstNames: "C" });
    const [, roomDir, , kidDir] = p.split("/");
    expect(roomDir.endsWith(" - c1a2")).toBe(true);
    expect(kidDir.endsWith(" - s9f8")).toBe(true);
  });
  it("hostile names and ids cannot traverse", () => {
    const p = studentDir(2026, room(["4y"], "..", "../x"), { id: "..//", lastNames: "..", firstNames: ".." });
    expect(p.split("/")).not.toContain("..");
    expect(p.split("/").filter(Boolean)).toHaveLength(4);
  });
});
