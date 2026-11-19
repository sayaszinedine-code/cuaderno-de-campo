import { describe, expect, it } from "vitest";
import {
  activeCompetencies,
  addStudent,
  archiveStudent,
  createClassroom,
  deleteClassroom,
  restoreStudent,
  updateClassroom,
  updatePeriods,
  updateStudent,
} from "./classrooms";
import { SCHEMA_VERSION, yearDataSchema, type Period, type YearData } from "./schema";

const empty = (): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: 2026,
  periods: [
    { id: "B1", name: "I Bimestre", start: "2026-03-09", end: "2026-05-08" },
    { id: "B2", name: "II Bimestre", start: "2026-05-18", end: "2026-07-24" },
    { id: "B3", name: "III Bimestre", start: "2026-08-10", end: "2026-10-09" },
    { id: "B4", name: "IV Bimestre", start: "2026-10-19", end: "2026-12-19" },
  ],
  classrooms: [],
  students: [],
});

let n = 0;
const id = () => `id-${++n}`;

describe("createClassroom", () => {
  it("creates with defaults", () => {
    const d = createClassroom(empty(), { name: "Girasoles", cycle: "II", bands: ["4y"] }, id);
    expect(d.classrooms).toHaveLength(1);
    expect(d.classrooms[0]).toMatchObject({
      name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive",
    });
    expect(yearDataSchema.safeParse(d).success).toBe(true);
  });
  it("rejects bands from another cycle", () => {
    expect(() => createClassroom(empty(), { name: "X", cycle: "I", bands: ["4y"] }, id)).toThrow(
      "Las edades no corresponden al ciclo I",
    );
  });
  it("rejects empty name, no bands and duplicate bands", () => {
    expect(() => createClassroom(empty(), { name: " ", cycle: "II", bands: ["4y"] }, id)).toThrow(
      "Escribe el nombre del aula.",
    );
    expect(() => createClassroom(empty(), { name: "X", cycle: "II", bands: [] }, id)).toThrow(
      "Elige al menos una edad.",
    );
    expect(() => createClassroom(empty(), { name: "X", cycle: "II", bands: ["4y", "4y"] }, id)).toThrow(
      "Las edades no pueden repetirse.",
    );
  });
});

describe("activeCompetencies / updateClassroom", () => {
  const base = () => createClassroom(empty(), { name: "A", cycle: "II", bands: ["3y"] }, () => "c1");
  it("excludes disabled competencies", () => {
    const c = base().classrooms[0];
    const all = activeCompetencies(c).map((x) => x.id);
    expect(all).toContain("construye-identidad-religion");
    const d = updateClassroom(base(), "c1", { disabledCompetencyIds: ["construye-identidad-religion"] });
    expect(activeCompetencies(d.classrooms[0]).map((x) => x.id)).not.toContain("construye-identidad-religion");
  });
  it("only optional competencies can be disabled", () => {
    expect(() => updateClassroom(base(), "c1", { disabledCompetencyIds: ["lee"] })).toThrow(
      "Esa competencia no se puede desactivar.",
    );
  });
  it("renames and sets cycle I grading", () => {
    const d = updateClassroom(base(), "c1", { name: "Nuevo", cycleIGrading: "scale" });
    expect(d.classrooms[0]).toMatchObject({ name: "Nuevo", cycleIGrading: "scale" });
    expect(() => updateClassroom(base(), "c1", { name: " " })).toThrow("Escribe el nombre del aula.");
    expect(() => updateClassroom(base(), "zz", { name: "a" })).toThrow("No se encontró el aula.");
  });
});

describe("deleteClassroom", () => {
  it("deletes an empty classroom", () => {
    const d = createClassroom(empty(), { name: "A", cycle: "II", bands: ["3y"] }, () => "c1");
    expect(deleteClassroom(d, "c1").classrooms).toEqual([]);
  });
  it("refuses when it has students", () => {
    let d = createClassroom(empty(), { name: "A", cycle: "II", bands: ["3y"] }, () => "c1");
    d = addStudent(d, { classroomId: "c1", firstNames: "Ana", lastNames: "Paz" }, () => "s1");
    expect(() => deleteClassroom(d, "c1")).toThrow("No puedes eliminar un aula con niños registrados.");
  });
});

describe("students", () => {
  const withRoom = () => createClassroom(empty(), { name: "A", cycle: "II", bands: ["3y"] }, () => "c1");
  it("adds, updates, archives and restores without deleting", () => {
    let d = addStudent(
      withRoom(),
      { classroomId: "c1", firstNames: " Ana ", lastNames: "Paz", birthDate: "2022-01-05" },
      () => "s1",
    );
    expect(d.students[0]).toMatchObject({ id: "s1", firstNames: "Ana", active: true, birthDate: "2022-01-05" });
    d = updateStudent(d, "s1", { dni: "12345678", guardian: "Rosa" });
    expect(d.students[0]).toMatchObject({ dni: "12345678", guardian: "Rosa" });
    d = archiveStudent(d, "s1");
    expect(d.students).toHaveLength(1);
    expect(d.students[0].active).toBe(false);
    d = restoreStudent(d, "s1");
    expect(d.students[0].active).toBe(true);
    expect(yearDataSchema.safeParse(d).success).toBe(true);
  });
  it("validates input", () => {
    expect(() => addStudent(withRoom(), { classroomId: "c1", firstNames: "", lastNames: "P" }, id)).toThrow(
      "Escribe los nombres del niño.",
    );
    expect(() => addStudent(withRoom(), { classroomId: "zz", firstNames: "A", lastNames: "P" }, id)).toThrow(
      "No se encontró el aula.",
    );
    expect(() => updateStudent(withRoom(), "nope", {})).toThrow("No se encontró al niño.");
  });
});

describe("updatePeriods", () => {
  const p = (): Period[] => empty().periods;
  it("accepts valid periods", () => {
    const next = p();
    next[0] = { ...next[0], end: "2026-05-10" };
    expect(updatePeriods(empty(), next).periods[0].end).toBe("2026-05-10");
  });
  it("rejects overlap", () => {
    const next = p();
    next[1] = { ...next[1], start: "2026-05-01" };
    expect(() => updatePeriods(empty(), next)).toThrow("El bimestre 2 empieza antes de que termine el bimestre 1");
  });
  it("rejects start after end", () => {
    const next = p();
    next[2] = { ...next[2], start: "2026-10-10" };
    expect(() => updatePeriods(empty(), next)).toThrow("El bimestre 3 termina antes de empezar");
  });
  it("rejects invalid dates", () => {
    const next = p();
    next[0] = { ...next[0], start: "" };
    expect(() => updatePeriods(empty(), next)).toThrow("El bimestre 1 necesita fechas de inicio y fin");
  });
});
