import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { WorkspaceDataError, createWorkspaceRepo } from "./workspace-repo";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_MARKS,
  EVENT_TYPES,
  type AgendaEvent,
  type AgendaFile,
  type AttendanceFile,
} from "./schema";
import { agendaPath, attendancePath } from "./paths";

const APATH = "2026/datos/asistencia.json";
const GPATH = "2026/datos/agenda.json";
const att = (over: Partial<AttendanceFile> = {}): AttendanceFile => ({
  version: 1,
  schoolYear: 2026,
  days: [{ date: "2026-05-18", classroomId: "c1", marks: { s1: "P", s2: "T", s3: "F", s4: "J" } }],
  ...over,
});
const ev = (over: Partial<AgendaEvent> = {}): AgendaEvent => ({
  id: "e1",
  date: "2026-05-20",
  time: "09:30",
  title: "Reunión de padres",
  type: "Reunión",
  note: "",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  ...over,
});
const agenda = (over: Partial<AgendaFile> = {}): AgendaFile => ({ version: 1, schoolYear: 2026, events: [ev()], ...over });

describe("attendance and agenda constants and paths", () => {
  it("has marks, labels and event types", () => {
    expect(ATTENDANCE_MARKS).toEqual(["P", "T", "F", "J"]);
    expect(ATTENDANCE_LABELS).toEqual({ P: "Presente", T: "Tardanza", F: "Falta", J: "Falta justificada" });
    expect(EVENT_TYPES).toEqual([
      "Reunión",
      "Entrega de documentos",
      "Actividad con niños",
      "Fecha cívica",
      "Capacitación",
      "Personal",
    ]);
  });
  it("paths", () => {
    expect(attendancePath(2026)).toBe(APATH);
    expect(agendaPath(2026)).toBe(GPATH);
  });
});

describe("attendance repo", () => {
  it("round-trips", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveAttendance(att());
    expect(await repo.loadAttendance(2026)).toEqual(att());
  });
  it("without file is empty and does not write", async () => {
    const st = new MemoryStorage();
    expect(await createWorkspaceRepo(st).loadAttendance(2026)).toEqual({ version: 1, schoolYear: 2026, days: [] });
    expect(await st.readText(APATH)).toBeNull();
  });
  it("corrupt file throws and is not overwritten", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic(APATH, "{nope");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadAttendance(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    await expect(repo.saveAttendance(att())).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText(APATH)).toBe("{nope");
  });
  it("rejects an invalid mark or date", async () => {
    const st = new MemoryStorage();
    const repo = createWorkspaceRepo(st);
    const bad = att({ days: [{ date: "2026-05-18", classroomId: "c1", marks: { s1: "X" as never } }] });
    await expect(repo.saveAttendance(bad)).rejects.toThrow();
    await expect(repo.saveAttendance(att({ days: [{ date: "18/05", classroomId: "c1", marks: {} }] }))).rejects.toThrow();
    expect(await st.readText(APATH)).toBeNull();
  });
  it("keeps unknown keys", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    const f = att();
    await repo.saveAttendance({ ...f, days: [{ ...f.days[0], extra: "x" } as AttendanceFile["days"][number]] });
    expect(((await repo.loadAttendance(2026)).days[0] as unknown as { extra: string }).extra).toBe("x");
  });
});

describe("agenda repo", () => {
  it("round-trips", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await repo.saveAgenda(agenda());
    expect(await repo.loadAgenda(2026)).toEqual(agenda());
  });
  it("without file is empty and does not write", async () => {
    const st = new MemoryStorage();
    expect(await createWorkspaceRepo(st).loadAgenda(2026)).toEqual({ version: 1, schoolYear: 2026, events: [] });
    expect(await st.readText(GPATH)).toBeNull();
  });
  it("corrupt file throws and is not overwritten", async () => {
    const st = new MemoryStorage();
    await st.writeTextAtomic(GPATH, "{nope");
    const repo = createWorkspaceRepo(st);
    await expect(repo.loadAgenda(2026)).rejects.toBeInstanceOf(WorkspaceDataError);
    await expect(repo.saveAgenda(agenda())).rejects.toBeInstanceOf(WorkspaceDataError);
    expect(await st.readText(GPATH)).toBe("{nope");
  });
  it("time accepts HH:MM or is omitted", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    const { time: _t, ...noTime } = ev({ id: "e2" });
    void _t;
    await repo.saveAgenda(agenda({ events: [ev(), noTime as AgendaEvent, ev({ id: "e3", time: "00:00" }), ev({ id: "e4", time: "23:59" })] }));
    expect((await repo.loadAgenda(2026)).events).toHaveLength(4);
    for (const t of ["24:00", "9:30", "09:60", "09:30:00", ""]) {
      await expect(repo.saveAgenda(agenda({ events: [ev({ time: t })] }))).rejects.toThrow();
    }
  });
  it("rejects an unknown event type", async () => {
    const repo = createWorkspaceRepo(new MemoryStorage());
    await expect(repo.saveAgenda(agenda({ events: [ev({ type: "Otro" as never })] }))).rejects.toThrow();
  });
});
