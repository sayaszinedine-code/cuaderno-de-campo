import type { Storage } from "@/storage/types";
import { gradesPath, notesPath, profilePath, unitsPath, yearDataPath } from "./paths";
import {
  SCHEMA_VERSION,
  gradesFileSchema,
  notesFileSchema,
  profileFileSchema,
  unitsFileSchema,
  yearDataSchema,
  type GradesFile,
  type NotesFile,
  type Period,
  type TeacherProfile,
  type UnitsFile,
  type YearData,
} from "./schema";

export class WorkspaceDataError extends Error {
  constructor(
    public kind: "corrupt" | "future-version",
    public path: string,
    detail?: string,
  ) {
    super(
      kind === "future-version"
        ? `El archivo ${path} fue creado por una versión más nueva de la aplicación.`
        : `El archivo ${path} está dañado o no tiene el formato esperado.${detail ? ` (${detail})` : ""}`,
    );
    this.name = "WorkspaceDataError";
  }
}

export function defaultPeriods(year: number): Period[] {
  const y = year;
  return [
    { id: "B1", name: "Bimestre I", start: `${y}-03-16`, end: `${y}-05-15` },
    { id: "B2", name: "Bimestre II", start: `${y}-05-18`, end: `${y}-07-24` },
    { id: "B3", name: "Bimestre III", start: `${y}-08-10`, end: `${y}-10-09` },
    { id: "B4", name: "Bimestre IV", start: `${y}-10-12`, end: `${y}-12-18` },
  ];
}

export interface SaveOptions {
  /** Deliberate recovery: replace an existing corrupt / future-version file. Default false. */
  overwriteInvalid?: boolean;
}

export interface WorkspaceRepo {
  loadProfile(): Promise<TeacherProfile | null>;
  saveProfile(p: TeacherProfile, opts?: SaveOptions): Promise<void>;
  listYears(): Promise<number[]>;
  /** Returns a default (unsaved) YearData when the file does not exist. */
  loadYear(y: number): Promise<YearData>;
  saveYear(d: YearData, opts?: SaveOptions): Promise<void>;
  /** Returns an empty (unsaved) NotesFile when the file does not exist. */
  loadNotes(y: number): Promise<NotesFile>;
  saveNotes(f: NotesFile, opts?: SaveOptions): Promise<void>;
  /** Returns an empty (unsaved) GradesFile when the file does not exist. */
  loadGrades(y: number): Promise<GradesFile>;
  saveGrades(f: GradesFile, opts?: SaveOptions): Promise<void>;
  /** Returns an empty (unsaved) UnitsFile when the file does not exist. */
  loadUnits(y: number): Promise<UnitsFile>;
  saveUnits(f: UnitsFile, opts?: SaveOptions): Promise<void>;
}

interface DocSchema<T> {
  parse(v: unknown): T;
  safeParse(v: unknown): { success: true; data: T } | { success: false; error: { message: string } };
}

function parseFile<T>(path: string, text: string, schema: Pick<DocSchema<T>, "safeParse">): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WorkspaceDataError("corrupt", path, "JSON inválido");
  }
  const version = raw && typeof raw === "object" ? (raw as { version?: unknown }).version : undefined;
  if (typeof version === "number" && version > SCHEMA_VERSION) throw new WorkspaceDataError("future-version", path);
  const res = schema.safeParse(raw);
  if (!res.success) throw new WorkspaceDataError("corrupt", path, "esquema inválido");
  return res.data;
}

export function createWorkspaceRepo(storage: Storage): WorkspaceRepo {
  async function guardExisting(
    path: string,
    schema: Parameters<typeof parseFile>[2],
    opts?: SaveOptions,
  ): Promise<void> {
    if (opts?.overwriteInvalid) return;
    const existing = await storage.readText(path);
    if (existing !== null) parseFile(path, existing, schema);
  }

  /** Loads a validated document, or `empty()` (unsaved) when the file does not exist. */
  async function loadDoc<T>(path: string, schema: DocSchema<T>, empty: () => T): Promise<T> {
    const text = await storage.readText(path);
    return text === null ? empty() : parseFile(path, text, schema);
  }

  /** Validates, refuses to clobber an invalid existing file (unless overwriteInvalid), then writes atomically. */
  async function saveDoc<T>(path: string, schema: DocSchema<T>, data: T, opts?: SaveOptions): Promise<void> {
    const valid = schema.parse(data);
    await guardExisting(path, schema, opts);
    await storage.writeTextAtomic(path, JSON.stringify(valid, null, 2));
  }

  return {
    async loadProfile() {
      const path = profilePath();
      const text = await storage.readText(path);
      if (text === null) return null;
      const { version: _v, ...profile } = parseFile(path, text, profileFileSchema);
      void _v;
      return profile;
    },

    async saveProfile(p, opts) {
      const file = profileFileSchema.parse({ version: SCHEMA_VERSION, ...p });
      await guardExisting(profilePath(), profileFileSchema, opts);
      await storage.writeTextAtomic(profilePath(), JSON.stringify(file, null, 2));
    },

    async listYears() {
      const entries = await storage.list("");
      const years: number[] = [];
      for (const e of entries) {
        if (e.kind !== "dir" || !/^\d{4}$/.test(e.name)) continue;
        const y = Number(e.name);
        if ((await storage.readText(yearDataPath(y))) !== null) years.push(y);
      }
      return years.sort((a, b) => b - a);
    },

    async loadYear(y) {
      const path = yearDataPath(y);
      const text = await storage.readText(path);
      if (text === null) {
        return { version: SCHEMA_VERSION, schoolYear: y, periods: defaultPeriods(y), classrooms: [], students: [] };
      }
      return parseFile(path, text, yearDataSchema);
    },

    async saveYear(d, opts) {
      const data = yearDataSchema.parse(d);
      await guardExisting(yearDataPath(data.schoolYear), yearDataSchema, opts);
      await storage.writeTextAtomic(yearDataPath(data.schoolYear), JSON.stringify(data, null, 2));
    },

    async loadNotes(y) {
      return loadDoc(notesPath(y), notesFileSchema, () => ({ version: SCHEMA_VERSION, schoolYear: y, notes: [] }));
    },

    async saveNotes(f, opts) {
      await saveDoc(notesPath(f.schoolYear), notesFileSchema, f, opts);
    },

    async loadGrades(y) {
      return loadDoc(gradesPath(y), gradesFileSchema, () => ({
        version: SCHEMA_VERSION,
        schoolYear: y,
        entries: [],
        finals: [],
      }));
    },

    async saveGrades(f, opts) {
      await saveDoc(gradesPath(f.schoolYear), gradesFileSchema, f, opts);
    },

    async loadUnits(y) {
      return loadDoc(unitsPath(y), unitsFileSchema, () => ({
        version: SCHEMA_VERSION,
        schoolYear: y,
        units: [],
        sessions: [],
      }));
    },

    async saveUnits(f, opts) {
      await saveDoc(unitsPath(f.schoolYear), unitsFileSchema, f, opts);
    },
  };
}
