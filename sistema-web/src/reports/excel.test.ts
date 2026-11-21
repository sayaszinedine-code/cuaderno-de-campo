import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { activeCompetencies } from "@/domain/classrooms";
import {
  LEVEL_LABELS,
  SCHEMA_VERSION,
  type AttendanceFile,
  type Classroom,
  type GradesFile,
  type Student,
  type TeacherProfile,
} from "@/domain/schema";
import { attendanceWorkbook, gradesWorkbook, saveReport } from "./excel";

const profile: TeacherProfile = {
  firstNames: "Rosa",
  lastNames: "Quispe",
  phone: "",
  region: "Cusco",
  address: "",
  email: "",
  level: "Inicial",
  ugel: "UGEL Cusco",
  institution: "IEI 123 Los Andes",
};

const scaleRoom: Classroom = {
  id: "c1",
  name: "Girasoles",
  cycle: "II",
  bands: ["4y"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};
const descriptiveRoom: Classroom = {
  id: "c2",
  name: "Ositos",
  cycle: "I",
  bands: ["24m"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};

const students: Student[] = [
  { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", active: true },
  { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", active: true },
  { id: "s3", classroomId: "c1", firstNames: "Inés", lastNames: "Paz", active: false },
  { id: "s4", classroomId: "c2", firstNames: "Ana", lastNames: "Soto", active: true },
];

const LONG = "Explora los objetos de su entorno con curiosidad, los manipula y descubre sus características con mucha atención y alegría.";

const grades = (entries: GradesFile["entries"]): GradesFile => ({
  version: SCHEMA_VERSION,
  schoolYear: 2026,
  entries,
  finals: [],
});

async function load(blob: Blob): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb;
}

function allText(wb: ExcelJS.Workbook): string[] {
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(ws.name);
    ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? ""))));
  });
  return out;
}

function findRow(ws: ExcelJS.Worksheet, text: string): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((row) => {
    if (!found && row.values && (row.values as unknown[]).some((v) => v === text)) found = row;
  });
  return found;
}

describe("gradesWorkbook", () => {
  it("writes the header, one row per active child and the level per competency", async () => {
    const comp = activeCompetencies(scaleRoom)[0];
    const blob = await gradesWorkbook({
      profile,
      classroom: scaleRoom,
      students,
      period: { id: "B1", name: "I Bimestre" },
      grades: grades([
        { studentId: "s1", competencyId: comp.id, periodId: "B1", level: "A", conclusion: "Se reconoce.", updatedAt: "" },
        { studentId: "s2", competencyId: comp.id, periodId: "B2", level: "C", conclusion: "Otro bimestre", updatedAt: "" },
      ]),
    });
    const wb = await load(blob);
    const ws = wb.getWorksheet("Registro I Bimestre");
    expect(ws).toBeDefined();
    const text = allText(wb);
    expect(text).toContain("IEI 123 Los Andes");
    expect(text).toContain("Rosa Quispe");
    expect(text).toContain("Aula Girasoles · Ciclo II · 4 años");
    expect(text).toContain("I Bimestre");
    expect(text).not.toContain("Inés Paz");
    const header = findRow(ws!, "Niño o niña")!;
    const col = (header.values as unknown[]).indexOf(comp.shortName);
    expect(col).toBeGreaterThan(0);
    const luz = findRow(ws!, "Rojas, Luz")!;
    expect(luz.getCell(col).value).toBe("A");
    const mateo = findRow(ws!, "Díaz, Mateo")!;
    expect(mateo.getCell(col).value ?? "").toBe("");

    const concl = wb.getWorksheet("Conclusiones")!;
    const row = findRow(concl, "Se reconoce.")!;
    expect(row.values).toEqual(expect.arrayContaining(["Rojas, Luz", comp.name, "Se reconoce."]));
    expect(allText(wb)).not.toContain("Otro bimestre");
  });

  it("never shows AD/A/B/C in a descriptive cycle I classroom, only the conclusion summary", async () => {
    const comp = activeCompetencies(descriptiveRoom)[0];
    const blob = await gradesWorkbook({
      profile,
      classroom: descriptiveRoom,
      students,
      period: { id: "B1", name: "I Bimestre" },
      grades: grades([
        // A stray stored level must not leak into the report.
        { studentId: "s4", competencyId: comp.id, periodId: "B1", level: "AD", conclusion: LONG, updatedAt: "" },
      ]),
    });
    const wb = await load(blob);
    const text = allText(wb);
    for (const t of text) {
      expect(["AD", "A", "B", "C"]).not.toContain(t.trim());
      for (const label of Object.values(LEVEL_LABELS)) expect(t).not.toContain(label);
      expect(t).not.toMatch(/\bAD\b/);
    }
    const ws = wb.getWorksheet("Registro I Bimestre")!;
    const header = findRow(ws, "Niño o niña")!;
    const col = (header.values as unknown[]).indexOf(comp.shortName);
    const ana = findRow(ws, "Soto, Ana")!;
    const summaryText = String(ana.getCell(col).value);
    expect(summaryText.endsWith("…")).toBe(true);
    expect(summaryText.length).toBeLessThanOrEqual(80);
    expect(LONG.startsWith(summaryText.slice(0, -1))).toBe(true);
    expect(text).toContain(LONG);
  });
});

describe("attendanceWorkbook", () => {
  const attendance: AttendanceFile = {
    version: SCHEMA_VERSION,
    schoolYear: 2026,
    days: [
      { date: "2026-04-14", classroomId: "c1", marks: { s1: "P", s2: "F", s3: "P" } },
      { date: "2026-04-15", classroomId: "c1", marks: { s1: "T", s2: "J" } },
      { date: "2026-05-02", classroomId: "c1", marks: { s1: "F" } },
      { date: "2026-04-16", classroomId: "c2", marks: { s4: "P" } },
    ],
  };

  it("has a column per day of the month and totals P, T, F, J and %", async () => {
    const blob = await attendanceWorkbook({ classroom: scaleRoom, students, month: "2026-04", attendance });
    const wb = await load(blob);
    const ws = wb.worksheets[0];
    const header = findRow(ws, "Niño o niña")!;
    const h = header.values as unknown[];
    expect(h).toEqual(expect.arrayContaining(["14", "15", "P", "T", "F", "J", "%"]));
    expect(h).not.toContain("16");
    expect(h).not.toContain("2");
    const luz = findRow(ws, "Rojas, Luz")!;
    expect(luz.getCell(h.indexOf("14")).value).toBe("P");
    expect(luz.getCell(h.indexOf("15")).value).toBe("T");
    expect(luz.getCell(h.indexOf("P")).value).toBe(1);
    expect(luz.getCell(h.indexOf("T")).value).toBe(1);
    expect(luz.getCell(h.indexOf("%")).value).toBe("100%");
    const mateo = findRow(ws, "Díaz, Mateo")!;
    expect(mateo.getCell(h.indexOf("F")).value).toBe(1);
    expect(mateo.getCell(h.indexOf("J")).value).toBe(1);
    expect(mateo.getCell(h.indexOf("%")).value).toBe("0%");
    expect(allText(wb)).not.toContain("Paz, Inés");
  });

  it("shows «—» when a child has no marks in the month", async () => {
    const blob = await attendanceWorkbook({ classroom: scaleRoom, students, month: "2026-06", attendance });
    const ws = (await load(blob)).worksheets[0];
    const h = findRow(ws, "Niño o niña")!.values as unknown[];
    expect(findRow(ws, "Rojas, Luz")!.getCell(h.indexOf("%")).value).toBe("—");
  });
});

describe("student order", () => {
  const unsorted: Student[] = [
    { id: "z", classroomId: "c1", firstNames: "Zoe", lastNames: "Ñahui", active: true },
    { id: "b", classroomId: "c1", firstNames: "Bea", lastNames: "Álvarez", active: true },
    { id: "a", classroomId: "c1", firstNames: "Ana", lastNames: "Nuñez", active: true },
  ];
  const order = (ws: ExcelJS.Worksheet) => {
    const names: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(2).value;
      if (typeof v === "string" && v.includes(", ")) names.push(v);
    });
    return names;
  };
  const expected = ["Álvarez, Bea", "Nuñez, Ana", "Ñahui, Zoe"];

  it("lists children by apellidos then nombres in the grade register", async () => {
    const blob = await gradesWorkbook({ profile, classroom: scaleRoom, students: unsorted, period: { id: "B1", name: "I Bimestre" }, grades: grades([]) });
    expect(order((await load(blob)).getWorksheet("Registro I Bimestre")!)).toEqual(expected);
  });

  it("lists children by apellidos then nombres in the attendance sheet", async () => {
    const att: AttendanceFile = { version: SCHEMA_VERSION, schoolYear: 2026, days: [] };
    const blob = await attendanceWorkbook({ classroom: scaleRoom, students: unsorted, month: "2026-04", attendance: att });
    expect(order((await load(blob)).worksheets[0])).toEqual(expected);
  });
});

describe("saveReport", () => {
  const now = new Date(2026, 10, 21, 15, 30);

  it("writes into <dir>Reportes/ with date and time in the name", async () => {
    const storage = new MemoryStorage();
    const name = await saveReport(storage, "2026/Aula X/", "Registro de notas Bimestre 1 Girasoles", "xlsx", new Blob(["a"]), now);
    expect(name).toBe("Registro de notas Bimestre 1 Girasoles 2026-11-21 1530.xlsx");
    expect(await storage.readText(`2026/Aula X/Reportes/${name}`)).toBe("a");
  });

  it("never overwrites: adds « (2)», « (3)»", async () => {
    const storage = new MemoryStorage();
    const a = await saveReport(storage, "2026/Aula X/", "Asistencia 2026-11 Girasoles", "xlsx", new Blob(["1"]), now);
    const b = await saveReport(storage, "2026/Aula X/", "Asistencia 2026-11 Girasoles", "xlsx", new Blob(["2"]), now);
    const c = await saveReport(storage, "2026/Aula X/", "Asistencia 2026-11 Girasoles", "xlsx", new Blob(["3"]), now);
    expect(b).toBe("Asistencia 2026-11 Girasoles 2026-11-21 1530 (2).xlsx");
    expect(c).toBe("Asistencia 2026-11 Girasoles 2026-11-21 1530 (3).xlsx");
    expect(await storage.readText(`2026/Aula X/Reportes/${a}`)).toBe("1");
    expect(await storage.readText(`2026/Aula X/Reportes/${b}`)).toBe("2");
  });

  it("propagates a list failure and writes nothing", async () => {
    const storage = new MemoryStorage();
    storage.list = () => Promise.reject(new Error("permission lost"));
    const write = vi.spyOn(storage, "writeFile");
    await expect(saveReport(storage, "2026/Aula X/", "Asistencia", "xlsx", new Blob(["1"]), now)).rejects.toThrow("permission lost");
    expect(write).not.toHaveBeenCalled();
  });

  it("strips path-hostile characters from the base name and rejects unsafe dirs", async () => {
    const storage = new MemoryStorage();
    const name = await saveReport(storage, "2026/", "Registro a/b:c", "xlsx", new Blob(["x"]), now);
    expect(name).not.toMatch(/[/:]/);
    await expect(saveReport(storage, "../", "x", "xlsx", new Blob(["x"]), now)).rejects.toThrow();
  });
});
