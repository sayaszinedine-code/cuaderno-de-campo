import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { WorkspaceDataError, createWorkspaceRepo } from "./workspace-repo";
import type { FieldNote, NotesFile } from "./schema";

const note = (over: Partial<FieldNote> = {}): FieldNote => ({
  id: "abcd1234",
  date: "2026-04-10",
  classroomId: "c1",
  studentIds: ["s1"],
  wholeGroup: false,
  moment: "Taller",
  kind: "obs",
  performances: [{ competencyId: "k1", band: "4y", text: "Hace algo" }],
  evidenceText: "Dibujó",
  evidence: ["a.jpg"],
  interpretation: "",
  reflection: "",
  level: "A",
  createdAt: "2026-04-10T10:00:00.000Z",
  updatedAt: "2026-04-10T10:00:00.000Z",
  ...over,
});
const file = (notes: FieldNote[] = [note()]): NotesFile => ({ version: 1, schoolYear: 2026, notes });
const PATH = "2026/datos/cuaderno.json";

describe("notes repo", () => {
  it("round-trips", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveNotes(file());
    expect(await repo.loadNotes(2026)).toEqual(file());
  });

  it("loadNotes without file is empty and does not write", async () => {
    const st = new MemoryStorage();
    const f = await createWorkspaceRepo(st).loadNotes(2026);
    expect(f.notes).toEqual([]);
    expect(f.schoolYear).toBe(2026);
    expect(await st.readText(PATH)).toBeNull();
  });

  it("corrupt file throws and saveNotes does not overwrite it", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic(PATH, "{nope");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadNotes(2026)).rejects.toMatchObject({ kind: "corrupt" });
    await expect(repo.loadNotes(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    await expect(repo.saveNotes(file())).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText(PATH)).toBe("{nope");
    await repo.saveNotes(file(), { overwriteInvalid: true });
    expect((await repo.loadNotes(2026)).notes).toHaveLength(1);
  });

  it("keeps unknown keys on a note", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveNotes({ version: 1, schoolYear: 2026, notes: [{ ...note(), extra: "x" } as FieldNote] });
    const loaded = await repo.loadNotes(2026);
    expect((loaded.notes[0] as unknown as { extra: string }).extra).toBe("x");
  });

  it("rejects an invalid kind", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await expect(repo.saveNotes(file([note({ kind: "zzz" as FieldNote["kind"] })]))).rejects.toThrow();
    expect(await st.readText(PATH)).toBeNull();
  });
});
