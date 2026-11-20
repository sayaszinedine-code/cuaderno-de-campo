import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { WorkspaceDataError, createWorkspaceRepo } from "./workspace-repo";
import { UNIT_KINDS, UNIT_KIND_LABELS, type Session, type Unit, type UnitsFile } from "./schema";
import { sessionDir, unitDir, unitsPath } from "./paths";

const PATH = "2026/datos/unidades.json";
const att = { name: "plan.pdf", path: "2026/Aula/plan.pdf", size: 10, type: "application/pdf", addedAt: "2026-04-01T10:00:00.000Z" };
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: "abcd1234-ffff",
  classroomId: "c1",
  periodId: "B2",
  kind: "unidad",
  title: "Mi familia",
  start: "2026-05-18",
  end: "2026-06-18",
  purpose: "Conocer a la familia",
  competencyIds: ["k1"],
  performances: [{ competencyId: "k1", band: "3y", text: "Se reconoce" }],
  description: "",
  attachments: [att],
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  ...over,
});
const session = (over: Partial<Session> = {}): Session => ({
  id: "s1234567-ffff",
  unitId: "abcd1234-ffff",
  date: "2026-05-20",
  title: "Dibujamos",
  purpose: "",
  competencyIds: [],
  performances: [],
  description: "",
  attachments: [],
  noteIds: ["n1"],
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  ...over,
});
const file = (over: Partial<UnitsFile> = {}): UnitsFile => ({
  version: 1,
  schoolYear: 2026,
  units: [unit()],
  sessions: [session()],
  ...over,
});
const cls = { id: "c1id", name: "Patitos", bands: ["3y" as const] };

describe("units repo", () => {
  it("has kinds and labels", () => {
    expect(UNIT_KINDS).toEqual(["unidad", "proyecto", "experiencia"]);
    expect(UNIT_KIND_LABELS).toEqual({
      unidad: "Unidad de aprendizaje",
      proyecto: "Proyecto de aprendizaje",
      experiencia: "Experiencia de aprendizaje",
    });
  });

  it("round-trips", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveUnits(file());
    expect(await repo.loadUnits(2026)).toEqual(file());
  });

  it("loadUnits without file is empty and does not write", async () => {
    const st = new MemoryStorage();
    expect(await createWorkspaceRepo(st).loadUnits(2026)).toEqual({ version: 1, schoolYear: 2026, units: [], sessions: [] });
    expect(await st.readText(PATH)).toBeNull();
  });

  it("corrupt file throws and is not overwritten", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic(PATH, "{nope");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadUnits(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    await expect(repo.saveUnits(file())).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText(PATH)).toBe("{nope");
  });

  it("rejects an unsafe attachment path", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    await expect(repo.saveUnits(file({ units: [unit({ attachments: [{ ...att, path: "../x" }] })] }))).rejects.toThrow();
    await expect(repo.saveUnits(file({ sessions: [session({ attachments: [{ ...att, path: "/etc/x" }] })] }))).rejects.toThrow();
    expect(await st.readText(PATH)).toBeNull();
  });

  it("keeps unknown keys", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveUnits(file({ units: [{ ...unit(), extra: "x" } as Unit] }));
    expect(((await repo.loadUnits(2026)).units[0] as unknown as { extra: string }).extra).toBe("x");
  });
});

describe("unit paths", () => {
  it("unitsPath", () => expect(unitsPath(2026)).toBe(PATH));
  it("unitDir", () => {
    expect(unitDir(2026, cls, unit())).toMatch(/\/Unidades y sesiones\/Bimestre 2\/Mi familia - abcd1234\/$/);
  });
  it("unitDir falls back to Sin título", () => {
    expect(unitDir(2026, cls, unit({ title: "" }))).toMatch(/\/Bimestre 2\/Sin título - abcd1234\/$/);
  });
  it("sessionDir includes date and title", () => {
    const d = sessionDir(2026, cls, unit(), session());
    expect(d).toMatch(/\/Mi familia - abcd1234\/Sesiones\/2026-05-20 Dibujamos - s1234567\/$/);
  });
  it("hostile titles stay safe", () => {
    const d = unitDir(2026, cls, unit({ title: "../../etc/passwd" }));
    expect(d.split("/")).not.toContain("..");
    const s = sessionDir(2026, cls, unit(), session({ title: "a/../b" }));
    expect(s.split("/")).not.toContain("..");
    expect(s).not.toContain("//");
  });
});
