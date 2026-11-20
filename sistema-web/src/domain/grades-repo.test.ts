import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { WorkspaceDataError, createWorkspaceRepo } from "./workspace-repo";
import { LEVEL_LABELS, type GradeEntry, type GradesFile } from "./schema";

const entry = (over: Partial<GradeEntry> = {}): GradeEntry => ({
  studentId: "s1",
  competencyId: "k1",
  periodId: "B1",
  level: "A",
  conclusion: "Logra lo esperado",
  updatedAt: "2026-04-10T10:00:00.000Z",
  ...over,
});
const file = (entries: GradeEntry[] = [entry()]): GradesFile => ({
  version: 1,
  schoolYear: 2026,
  entries,
  finals: [{ studentId: "s1", competencyId: "k1", level: "B", conclusion: "", updatedAt: "2026-12-01T10:00:00.000Z" }],
});
const PATH = "2026/datos/notas.json";

describe("grades repo", () => {
  it("has level labels", () => {
    expect(LEVEL_LABELS).toEqual({ AD: "Logro destacado", A: "Logro esperado", B: "En proceso", C: "En inicio" });
  });

  it("round-trips", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveGrades(file());
    expect(await repo.loadGrades(2026)).toEqual(file());
  });

  it("loadGrades without file is empty and does not write", async () => {
    const st = new MemoryStorage();
    const f = await createWorkspaceRepo(st).loadGrades(2026);
    expect(f).toEqual({ version: 1, schoolYear: 2026, entries: [], finals: [] });
    expect(await st.readText(PATH)).toBeNull();
  });

  it("corrupt file throws and saveGrades does not overwrite it", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic(PATH, "{nope");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadGrades(2026)).rejects.toMatchObject({ kind: "corrupt" });
    await expect(repo.loadGrades(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    await expect(repo.saveGrades(file())).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText(PATH)).toBe("{nope");
    await repo.saveGrades(file(), { overwriteInvalid: true });
    expect((await repo.loadGrades(2026)).entries).toHaveLength(1);
  });

  it("keeps unknown keys", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveGrades(file([{ ...entry(), extra: "x" } as GradeEntry]));
    const loaded = await repo.loadGrades(2026);
    expect((loaded.entries[0] as unknown as { extra: string }).extra).toBe("x");
  });

  it("rejects an invalid level", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await expect(repo.saveGrades(file([entry({ level: "Z" as GradeEntry["level"] })]))).rejects.toThrow();
    expect(await st.readText(PATH)).toBeNull();
  });

  it("rejects a periodId outside B1..B4", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await expect(repo.saveGrades(file([entry({ periodId: "B5" as GradeEntry["periodId"] })]))).rejects.toThrow();
    expect(await st.readText(PATH)).toBeNull();
  });
});
