import { z } from "zod";
import { areaIdFor, getCompetencies } from "@/curriculum";
import { areasForCycles } from "@/domain/areas";
import { markOf, setMark } from "@/domain/attendance";
import { DEFAULT_MOMENT, fold, newNote } from "@/domain/notes";
import { noteDir } from "@/domain/paths";
import { compressPhoto, EVIDENCE_MAX_SIZE } from "@/domain/photo";
import {
  ATTENDANCE_MARKS,
  EVENT_TYPES,
  LEVELS,
  NOTE_KINDS,
  type AgendaEvent,
  type AgendaFile,
  type AttendanceFile,
  type AttendanceMark,
  type Classroom,
  type EventType,
  type FieldNote,
  type NotesFile,
  type Student,
  type TeacherProfile,
  type YearData,
} from "@/domain/schema";
import type { Storage } from "@/storage/types";

export const LEGACY_INVALID = "Este archivo no es un respaldo de la app anterior.";
export const LEGACY_TOO_BIG = "El archivo pesa más de 300 MB y no se puede importar.";
export const LEGACY_SAVE_FAILED =
  "No se pudo completar la importación. Lo ya guardado se conserva: vuelve a importar el archivo para agregar lo que faltó.";
export const LEGACY_MAX_BYTES = 300 * 1024 * 1024;

/* ---------- Parsing (mirrors the legacy `restaurar` check, tolerant of missing or odd fields) ---------- */

/** Any value as a trimmed-free string: strings as is, numbers stringified, everything else "". */
const text = z.unknown().optional().transform((v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : ""));
const objectLike = z.record(z.string(), z.unknown());

// Unknown keys of the legacy objects are dropped: only these fields are mapped.
const childSchema = z.object({ id: text, nombre: text, nac: text, apo: text, tel: text, notas: text });
const recordSchema = z.object({
  id: text,
  fecha: text,
  hora: text,
  momento: text,
  tipo: text,
  area: text,
  comp: text,
  nivel: text,
  ninos: z.array(z.unknown()).catch([]),
  hecho: text,
  interpretacion: text,
  acciones: text,
  fotos: z.array(z.unknown()).catch([]),
});
const eventSchema = z.object({ id: text, fecha: text, hora: text, titulo: text, tipo: text, nota: text });
const profileSchema = z.object({ nombre: text, ie: text, aula: text, ugel: text });

export type LegacyChild = z.infer<typeof childSchema>;
export type LegacyRecord = Omit<z.infer<typeof recordSchema>, "ninos" | "fotos"> & { ninos: string[]; fotos: string[] };
export type LegacyEvent = z.infer<typeof eventSchema>;
export type LegacyData = {
  perfil: z.infer<typeof profileSchema>;
  ninos: LegacyChild[];
  registros: LegacyRecord[];
  /** `asis[YYYY-MM][YYYY-MM-DD][childId] = mark` (unvalidated marks). */
  asis: Record<string, Record<string, Record<string, string>>>;
  agenda: LegacyEvent[];
};

const rootSchema = z
  .object({ ninos: z.array(z.unknown()), registros: objectLike, perfil: z.unknown().optional(), asis: z.unknown().optional(), agenda: z.unknown().optional() })
  .loose();

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function parseAsis(v: unknown): LegacyData["asis"] {
  const out: LegacyData["asis"] = {};
  for (const [month, days] of Object.entries(asObject(v))) {
    const m: Record<string, Record<string, string>> = {};
    for (const [date, marks] of Object.entries(asObject(days))) {
      const d: Record<string, string> = {};
      for (const [child, mark] of Object.entries(asObject(marks))) if (typeof mark === "string") d[child] = mark;
      m[date] = d;
    }
    out[month] = m;
  }
  return out;
}

function photoSrc(f: unknown): string | null {
  const src = asObject(f).src;
  return typeof src === "string" && src.startsWith("data:") ? src : null;
}

export function parseLegacy(json: unknown): LegacyData | { error: string } {
  const root = rootSchema.safeParse(json);
  if (!root.success) return { error: LEGACY_INVALID };
  const { ninos, registros, perfil, asis, agenda } = root.data;

  const children = ninos.flatMap((n) => {
    const c = childSchema.safeParse(n);
    return c.success && c.data.id ? [c.data] : [];
  });
  const records = Object.values(registros).flatMap((r): LegacyRecord[] => {
    const p = recordSchema.safeParse(r);
    if (!p.success || !p.data.id) return [];
    return [
      {
        ...p.data,
        ninos: p.data.ninos.flatMap((x) => (typeof x === "string" || typeof x === "number" ? [String(x)] : [])),
        fotos: p.data.fotos.flatMap((f) => photoSrc(f) ?? []),
      },
    ];
  });
  const events = (Array.isArray(agenda) ? agenda : []).flatMap((e) => {
    const p = eventSchema.safeParse(e);
    return p.success && p.data.id ? [p.data] : [];
  });
  const profile = profileSchema.safeParse(asObject(perfil));

  return {
    perfil: profile.success ? profile.data : { nombre: "", ie: "", aula: "", ugel: "" },
    ninos: children,
    registros: records,
    asis: parseAsis(asis),
    agenda: events,
  };
}

/** Reads and parses a legacy backup file; never throws. */
export async function readLegacyFile(file: Blob): Promise<LegacyData | { error: string }> {
  if (file.size > LEGACY_MAX_BYTES) return { error: LEGACY_TOO_BIG };
  try {
    return parseLegacy(JSON.parse(await file.text()));
  } catch {
    return { error: LEGACY_INVALID };
  }
}

/* ---------- Mapping ---------- */

/** «Valentina Quispe Huamán» → first names «Valentina», surnames «Quispe Huamán» (the last two words). */
export function splitLegacyName(name: string): { firstNames: string; lastNames: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstNames: words[0] ?? "", lastNames: "" };
  if (words.length === 2) return { firstNames: words[0], lastNames: words[1] };
  return { firstNames: words.slice(0, -2).join(" "), lastNames: words.slice(-2).join(" ") };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ImportTarget = {
  /** Destination classroom; may not be saved yet (new classroom) while planning. */
  classroom: Classroom;
  year: number;
  yearData: YearData;
  notes: FieldNote[];
  attendance: AttendanceFile;
  agenda: AgendaFile;
  profile: TeacherProfile | null;
};

export type LegacyPlan = {
  students: number;
  notes: number;
  photos: number;
  attendanceDays: number;
  events: number;
  /** Some child, record or event of this backup is already in the workspace. */
  alreadyImported: boolean;
  /** Distinct competency names (as written in the backup) not found in the catalog. */
  unmatchedCompetencies: string[];
  /** New records saved without competency because their competency was not recognized. */
  unmatchedNotes: number;
  /** Records dated outside the target year (not imported). */
  otherYearNotes: number;
};

type PendingNote = { note: FieldNote; photos: string[] };

type Built = {
  plan: LegacyPlan;
  students: Student[];
  notes: PendingNote[];
  events: AgendaEvent[];
  /** Child id in the backup → student id in the workspace (new and previously imported ones). */
  studentIds: Map<string, string>;
  profile: TeacherProfile | null;
};

type Gen = { genId: () => string; now: Date };
const defaultGen = (): Gen => ({ genId: () => crypto.randomUUID(), now: new Date() });

function matchCompetency(r: LegacyRecord, classroom: Classroom): { areaId?: string; competencyId?: string } {
  const comp = fold(r.comp.trim());
  const area = fold(r.area.trim());
  const c = comp ? getCompetencies(classroom.cycle).find((x) => fold(x.name) === comp) : undefined;
  if (c) return { areaId: areaIdFor(c, classroom.cycle), competencyId: c.id };
  const a = area ? areasForCycles([classroom.cycle]).find((x) => fold(x.name) === area) : undefined;
  return a ? { areaId: a.id } : {};
}

function eventType(tipo: string): EventType {
  const t = fold(tipo.trim());
  return EVENT_TYPES.find((x) => fold(x) === t) ?? "Personal";
}

function profileIsEmpty(p: TeacherProfile | null): boolean {
  if (!p) return true;
  return [p.firstNames, p.lastNames, p.phone, p.region, p.address, p.email, p.ugel, p.institution].every((v) => !v.trim());
}

function build(data: LegacyData, t: ImportTarget, gen: Gen): Built {
  const { classroom, year } = t;
  const stamp = gen.now.toISOString();
  const yearPrefix = `${year}-`;
  let alreadyImported = false;

  // Children: dedup by origin id inside the destination classroom.
  const studentIds = new Map<string, string>();
  for (const s of t.yearData.students) {
    if (s.classroomId === classroom.id && s.importedFrom) studentIds.set(s.importedFrom, s.id);
  }
  const students: Student[] = [];
  for (const n of data.ninos) {
    if (studentIds.has(n.id)) {
      alreadyImported = true;
      continue;
    }
    const s: Student = {
      id: gen.genId(),
      classroomId: classroom.id,
      ...splitLegacyName(n.nombre),
      ...(ISO_DATE.test(n.nac) ? { birthDate: n.nac } : {}),
      ...(n.apo.trim() ? { guardian: n.apo.trim() } : {}),
      ...(n.tel.trim() ? { guardianPhone: n.tel.trim() } : {}),
      ...(n.notas.trim() ? { healthNotes: n.notas.trim() } : {}),
      active: true,
      importedFrom: n.id,
    };
    studentIds.set(n.id, s.id);
    students.push(s);
  }

  // Records: only the target year; dedup by origin id inside the classroom.
  const importedNotes = new Set(t.notes.filter((n) => n.classroomId === classroom.id && n.importedFrom).map((n) => n.importedFrom));
  const hideLevel = classroom.cycle === "I" && classroom.cycleIGrading === "descriptive";
  const notes: PendingNote[] = [];
  const unmatched = new Set<string>();
  let unmatchedNotes = 0;
  let otherYearNotes = 0;
  for (const r of data.registros) {
    if (importedNotes.has(r.id)) {
      alreadyImported = true;
      continue;
    }
    if (!ISO_DATE.test(r.fecha) || !r.fecha.startsWith(yearPrefix)) {
      otherYearNotes++;
      continue;
    }
    const match = matchCompetency(r, classroom);
    if (r.comp.trim() && !match.competencyId) {
      unmatched.add(r.comp.trim());
      unmatchedNotes++;
    }
    const ids = [...new Set(r.ninos.flatMap((id) => studentIds.get(id) ?? []))];
    const level = (LEVELS as readonly string[]).includes(r.nivel) && !hideLevel ? (r.nivel as FieldNote["level"]) : undefined;
    const base = newNote({ classroomId: classroom.id, date: r.fecha }, gen.genId, gen.now);
    const note: FieldNote = {
      ...base,
      studentIds: ids,
      wholeGroup: ids.length === 0,
      moment: r.momento.trim() || DEFAULT_MOMENT,
      kind: (NOTE_KINDS as readonly string[]).includes(r.tipo) ? (r.tipo as FieldNote["kind"]) : "otro",
      ...match,
      evidenceText: r.hecho,
      interpretation: r.interpretacion,
      reflection: r.acciones.trim() ? `Acciones: ${r.acciones.trim()}` : "",
      ...(level ? { level } : {}),
      importedFrom: r.id,
    };
    notes.push({ note, photos: r.fotos });
  }

  // Attendance: only marks the classroom does not have yet.
  const attendanceDays = new Set<string>();
  for (const [date, marks] of attendanceEntries(data, yearPrefix)) {
    for (const [childId, mark] of Object.entries(marks)) {
      const sid = studentIds.get(childId);
      if (!sid || !isMark(mark)) continue;
      if (markOf(t.attendance, classroom.id, date, sid) === undefined) attendanceDays.add(date);
      else alreadyImported = true;
    }
  }

  // Agenda: per teacher, dedup by origin id across the year.
  const importedEvents = new Set(t.agenda.events.flatMap((e) => (e.importedFrom ? [e.importedFrom] : [])));
  const events: AgendaEvent[] = [];
  for (const e of data.agenda) {
    if (importedEvents.has(e.id)) {
      alreadyImported = true;
      continue;
    }
    if (!ISO_DATE.test(e.fecha) || !e.fecha.startsWith(yearPrefix)) continue;
    events.push({
      id: gen.genId(),
      date: e.fecha,
      ...(TIME.test(e.hora) ? { time: e.hora } : {}),
      title: e.titulo.trim() || "Sin título",
      type: eventType(e.tipo),
      note: e.nota,
      importedFrom: e.id,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  const p = data.perfil;
  const hasLegacyProfile = [p.nombre, p.ie, p.ugel].some((v) => v.trim());
  const profile: TeacherProfile | null =
    hasLegacyProfile && profileIsEmpty(t.profile)
      ? {
          ...splitLegacyName(p.nombre),
          phone: "",
          region: "",
          address: "",
          email: "",
          level: "Inicial",
          ugel: p.ugel.trim(),
          institution: p.ie.trim(),
        }
      : null;

  return {
    plan: {
      students: students.length,
      notes: notes.length,
      photos: notes.reduce((n, x) => n + x.photos.length, 0),
      attendanceDays: attendanceDays.size,
      events: events.length,
      alreadyImported,
      unmatchedCompetencies: [...unmatched],
      unmatchedNotes,
      otherYearNotes,
    },
    students,
    notes,
    events,
    studentIds,
    profile,
  };
}

const isMark = (m: string): m is AttendanceMark => (ATTENDANCE_MARKS as readonly string[]).includes(m);

function attendanceEntries(data: LegacyData, yearPrefix: string): [string, Record<string, string>][] {
  return Object.values(data.asis).flatMap((days) =>
    Object.entries(days).filter(([date]) => ISO_DATE.test(date) && date.startsWith(yearPrefix)),
  );
}

export function planLegacyImport(data: LegacyData, target: ImportTarget): LegacyPlan {
  return build(data, target, defaultGen()).plan;
}

/* ---------- Applying ---------- */

type UpdateFn<D> = (fn: (d: D) => D, opts?: { year?: number }) => Promise<boolean>;

export type ImportDeps = {
  storage: Storage;
  update: (fn: (d: YearData) => YearData) => Promise<boolean>;
  updateNotes: UpdateFn<NotesFile>;
  updateAttendance: UpdateFn<AttendanceFile>;
  updateAgenda: UpdateFn<AgendaFile>;
  saveProfile: (p: TeacherProfile) => Promise<void>;
  /** Called before writing each photo: (1-based index, total). */
  onPhoto?: (index: number, total: number) => void;
};

/** `data:<type>[;base64],<payload>` → Blob, without `fetch`. Throws on malformed input. */
export function dataUrlToBlob(src: string): Blob {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,([\s\S]*)$/.exec(src);
  if (!m) throw new Error("bad data URL");
  const type = m[1] || "application/octet-stream";
  if (!m[3]) return new Blob([decodeURIComponent(m[4])], { type });
  const bin = atob(m[4].replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Re-encodes the photo like the notebook does; keeps the original bytes when the browser cannot decode it here. */
async function photoBlob(src: string): Promise<Blob> {
  const raw = dataUrlToBlob(src);
  try {
    return await compressPhoto(raw, EVIDENCE_MAX_SIZE);
  } catch {
    return raw;
  }
}

function fail(): never {
  throw new Error(LEGACY_SAVE_FAILED);
}

/**
 * Imports in order — children, notes (photos first), attendance, agenda, profile — one queued save per document.
 * Stops at the first failed save with `LEGACY_SAVE_FAILED`; everything saved before stays consistent because every
 * later document only references what an earlier save already committed, and re-importing skips it by `importedFrom`.
 */
export async function applyLegacyImport(
  data: LegacyData,
  target: ImportTarget,
  deps: ImportDeps,
  gen: Gen = defaultGen(),
): Promise<LegacyPlan> {
  const { classroom, year } = target;
  const built = build(data, target, gen);

  if (built.students.length > 0) {
    const ok = await deps.update((d) => {
      if (d.schoolYear !== year) throw new Error("year changed");
      if (!d.classrooms.some((c) => c.id === classroom.id)) throw new Error("classroom missing");
      const have = new Set(d.students.filter((s) => s.classroomId === classroom.id).map((s) => s.importedFrom));
      return { ...d, students: [...d.students, ...built.students.filter((s) => !have.has(s.importedFrom))] };
    });
    if (!ok) fail();
  } else if (!target.yearData.classrooms.some((c) => c.id === classroom.id)) {
    fail();
  }

  if (built.notes.length > 0) {
    const total = built.plan.photos;
    let index = 0;
    for (const { note, photos } of built.notes) {
      const dir = noteDir(year, classroom, note);
      const onDisk = new Set((await deps.storage.list(dir).catch(() => [])).map((e) => e.name));
      const evidence: string[] = [];
      let n = 1;
      for (const src of photos) {
        deps.onPhoto?.(++index, total);
        while (onDisk.has(`evidencia-${n}.jpg`)) n++;
        const name = `evidencia-${n}.jpg`;
        onDisk.add(name);
        let blob: Blob;
        try {
          blob = await photoBlob(src);
        } catch {
          continue; // A malformed photo is skipped; the record keeps its text.
        }
        try {
          await deps.storage.writeFile(`${dir}${name}`, blob);
        } catch {
          fail();
        }
        evidence.push(`${dir}${name}`);
      }
      note.evidence = evidence;
    }
    const ok = await deps.updateNotes(
      (f) => {
        const have = new Set(f.notes.filter((n) => n.classroomId === classroom.id).map((n) => n.importedFrom));
        return { ...f, notes: [...f.notes, ...built.notes.map((x) => x.note).filter((n) => !have.has(n.importedFrom))] };
      },
      { year },
    );
    if (!ok) fail();
  }

  if (built.plan.attendanceDays > 0) {
    const ok = await deps.updateAttendance(
      (f) => {
        let next = f;
        for (const [date, marks] of attendanceEntries(data, `${year}-`)) {
          for (const [childId, mark] of Object.entries(marks)) {
            const sid = built.studentIds.get(childId);
            if (!sid || !isMark(mark) || markOf(next, classroom.id, date, sid) !== undefined) continue;
            next = setMark(next, classroom.id, date, sid, mark);
          }
        }
        return next;
      },
      { year },
    );
    if (!ok) fail();
  }

  if (built.events.length > 0) {
    const ok = await deps.updateAgenda(
      (f) => {
        const have = new Set(f.events.flatMap((e) => (e.importedFrom ? [e.importedFrom] : [])));
        return { ...f, events: [...f.events, ...built.events.filter((e) => !have.has(e.importedFrom ?? ""))] };
      },
      { year },
    );
    if (!ok) fail();
  }

  if (built.profile) {
    try {
      await deps.saveProfile(built.profile);
    } catch {
      fail();
    }
  }

  return built.plan;
}
