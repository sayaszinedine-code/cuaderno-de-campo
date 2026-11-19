import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { WorkspaceDataError, createWorkspaceRepo, defaultPeriods } from "./workspace-repo";
import type { TeacherProfile, YearData } from "./schema";

const profile: TeacherProfile = {
  firstNames: "Rosa", lastNames: "Quispe", phone: "999", region: "Cusco", address: "Av. 1",
  email: "r@x.pe", level: "Inicial", ugel: "Cusco", institution: "IE 1",
};
const year: YearData = {
  version: 1,
  schoolYear: 2026,
  periods: defaultPeriods(2026),
  classrooms: [{ id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive" }],
  students: [{ id: "s1", classroomId: "c1", firstNames: "Ana", lastNames: "Pérez", active: true }],
};

describe("workspace repo", () => {
  it("round-trips profile and year", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    expect(await repo.loadProfile()).toBeNull();
    await repo.saveProfile(profile);
    await repo.saveYear(year);
    expect(await repo.loadProfile()).toEqual(profile);
    expect(await repo.loadYear(2026)).toEqual(year);
  });

  it("loadYear without file returns defaults and does not write", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    const y = await repo.loadYear(2026);
    expect(y.periods).toEqual(defaultPeriods(2026));
    expect(y.classrooms).toEqual([]);
    expect(y.students).toEqual([]);
    expect(await st.readText("2026/datos/anio.json")).toBeNull();
  });

  it("defaultPeriods values", () => {
    expect(defaultPeriods(2026).map((p) => [p.id, p.start, p.end])).toEqual([
      ["B1", "2026-03-16", "2026-05-15"],
      ["B2", "2026-05-18", "2026-07-24"],
      ["B3", "2026-08-10", "2026-10-09"],
      ["B4", "2026-10-12", "2026-12-18"],
    ]);
  });

  it("corrupt JSON throws and is not overwritten", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic("2026/datos/anio.json", "{oops");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadYear(2026)).rejects.toMatchObject({ kind: "corrupt", path: "2026/datos/anio.json" });
    await expect(repo.loadYear(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText("2026/datos/anio.json")).toBe("{oops");
  });

  it("schema-invalid file is corrupt", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic("datos/perfil.json", JSON.stringify({ version: 1, firstNames: 5 }));
    await expect(createWorkspaceRepo(st).loadProfile()).rejects.toMatchObject({ kind: "corrupt" });
  });

  it("future version is rejected untouched", async () => {
    const st = new MemoryStorage();
    const text = JSON.stringify({ version: 2, schoolYear: 2026 });
    await st.writeTextAtomic("2026/datos/anio.json", text);
    await expect(createWorkspaceRepo(st).loadYear(2026)).rejects.toMatchObject({ kind: "future-version" });
    expect(await st.readText("2026/datos/anio.json")).toBe(text);
  });

  it("saveYear/saveProfile validate and write nothing when invalid", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await expect(repo.saveYear({ ...year, schoolYear: "x" } as unknown as YearData)).rejects.toThrow();
    await expect(repo.saveProfile({ ...profile, level: "Primaria" } as unknown as TeacherProfile)).rejects.toThrow();
    expect(await st.readText("2026/datos/anio.json")).toBeNull();
    expect(await st.readText("datos/perfil.json")).toBeNull();
  });

  it("listYears returns years with anio.json, descending", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await repo.saveYear({ ...year, schoolYear: 2025, periods: defaultPeriods(2025) });
    await repo.saveYear(year);
    await st.writeTextAtomic("2027/otro.json", "{}");
    await st.writeTextAtomic("datos/perfil.json", "{}");
    expect(await repo.listYears()).toEqual([2026, 2025]);
  });
});
