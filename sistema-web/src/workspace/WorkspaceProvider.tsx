"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWorkspaceRepo, WorkspaceDataError, type WorkspaceRepo } from "@/domain/workspace-repo";
import type { AgendaFile, AttendanceFile, FieldNote, GradesFile, NotesFile, TeacherProfile, UnitsFile, YearData } from "@/domain/schema";
import {
  chooseFolder,
  grantPermission,
  openFallbackStorage,
  restoreStorage,
  supportsFolderAccess,
} from "@/storage/pick";
import type { Storage } from "@/storage/types";

export const FALLBACK_WARNING =
  "Tu navegador no permite elegir una carpeta. Tus datos se guardarán dentro del navegador: usa Chrome o Edge en tu computadora y haz respaldos.";
export const DATA_ERROR_MESSAGE =
  "No se pudo leer tus datos (archivo dañado o de una versión más nueva). No se modificó nada.";
export const SAVE_ERROR_MESSAGE = "No se pudo guardar. Revisa que la carpeta siga disponible.";
const UNSUPPORTED_MESSAGE =
  "Tu navegador no puede guardar tus datos en esta computadora. Usa Chrome o Edge en tu computadora.";

export type WorkspaceValue = {
  storage: Storage;
  repo: WorkspaceRepo;
  year: number;
  setYear(y: number): Promise<void>;
  years: number[];
  yearData: YearData;
  /** Teacher profile from `datos/perfil.json` (null when not saved yet). */
  profile: TeacherProfile | null;
  /** Writes are queued: each one waits for the previous. Rejects when the save fails. */
  saveProfile(p: TeacherProfile): Promise<void>;
  /**
   * Applies `fn` to the latest data and saves. Never rejects: resolves true only when the save committed;
   * false when `fn` threw, the save failed (the save banner is shown) or the write was skipped as stale.
   */
  update(fn: (d: YearData) => YearData): Promise<boolean>;
  /** Field notes of the open year (`cuaderno.json`). */
  notes: FieldNote[];
  /**
   * Same semantics as `update`, for the notes file; shares the write queue. With `opts.year`, resolves
   * false without writing when the loaded year is a different one (e.g. changed while a form was open).
   */
  updateNotes(fn: (f: NotesFile) => NotesFile, opts?: { year?: number }): Promise<boolean>;
  /** Grades of the open year (`notas.json`). */
  grades: GradesFile;
  /** Same semantics as `updateNotes`, for the grades file. */
  updateGrades(fn: (f: GradesFile) => GradesFile, opts?: { year?: number }): Promise<boolean>;
  /** Units and sessions of the open year (`unidades.json`). */
  units: UnitsFile;
  /** Same semantics as `updateNotes`, for the units file. */
  updateUnits(fn: (f: UnitsFile) => UnitsFile, opts?: { year?: number }): Promise<boolean>;
  /** Attendance of the open year (`asistencia.json`). */
  attendance: AttendanceFile;
  /** Same semantics as `updateNotes`, for the attendance file. */
  updateAttendance(fn: (f: AttendanceFile) => AttendanceFile, opts?: { year?: number }): Promise<boolean>;
  /** Agenda of the open year (`agenda.json`). */
  agenda: AgendaFile;
  /** Same semantics as `updateNotes`, for the agenda file. */
  updateAgenda(fn: (f: AgendaFile) => AgendaFile, opts?: { year?: number }): Promise<boolean>;
  reload(): Promise<void>;
  /** Date (YYYY-MM-DD) of the newest backup in `Respaldos/`; null when there is none; undefined until first checked. */
  backupDate: string | null | undefined;
  /** True when there is no backup or the last one is more than 14 days old. */
  backupWarning: boolean;
  /** Last automatic backup failure (Spanish), shown only in the backups panel. Empty when none. */
  backupError: string;
  /** What the write queue is busy with for the backups panel; null when idle. */
  backupBusy: "backup" | "restore" | null;
  /** Makes a manual backup through the write queue; resolves with the file name. Rejects with a Spanish message. */
  runBackup(): Promise<string>;
  /**
   * Restores `file` through the write queue (no other write interleaves), then reloads the workspace from disk
   * inside the same queue slot. Rejects with a Spanish message; the workspace is reloaded either way.
   */
  restoreBackupFile(file: Blob, replace: boolean): Promise<void>;
  /** Opens the folder picker and switches to the chosen folder. */
  changeFolder(): Promise<void>;
  /** True when the browser can pick a real folder (false = browser-internal storage). */
  canChooseFolder: boolean;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error("useWorkspace debe usarse dentro de <WorkspaceProvider>.");
  return v;
}

type Phase =
  | { status: "loading" }
  | { status: "needs-folder" }
  | { status: "needs-permission"; folderName: string }
  | { status: "unsupported" }
  | { status: "error"; message: string }
  | { status: "ready"; storage: Storage; repo: WorkspaceRepo; fallback: boolean };

type Loaded = {
  years: number[];
  year: number;
  yearData: YearData;
  notesFile: NotesFile;
  gradesFile: GradesFile;
  unitsFile: UnitsFile;
  attendanceFile: AttendanceFile;
  agendaFile: AgendaFile;
  profile: TeacherProfile | null;
};

type YearDocs = Pick<Loaded, "yearData" | "notesFile" | "gradesFile" | "unitsFile" | "attendanceFile" | "agendaFile">;

/** Loads every document of one year; the single place that knows which files make up a year. */
async function loadYearDocs(repo: WorkspaceRepo, y: number): Promise<YearDocs> {
  const [yearData, notesFile, gradesFile, unitsFile, attendanceFile, agendaFile] = await Promise.all([
    repo.loadYear(y),
    repo.loadNotes(y),
    repo.loadGrades(y),
    repo.loadUnits(y),
    repo.loadAttendance(y),
    repo.loadAgenda(y),
  ]);
  return { yearData, notesFile, gradesFile, unitsFile, attendanceFile, agendaFile };
}

const currentYear = () => new Date().getFullYear();

const DAY_MS = 86_400_000;
const AUTO_BACKUP_AFTER_DAYS = 7;
const BACKUP_WARNING_AFTER_DAYS = 14;
const AUTO_BACKUP_IDLE_MS = 60_000;
const FOLDER_CHANGED_MESSAGE = "La carpeta cambió. Inténtalo de nuevo.";
const BUSY_MESSAGE = "Espera a que termine el respaldo o la restauración en curso.";

/** Whole days since a local `YYYY-MM-DD` date (Infinity when unparsable). */
function daysSince(date: string, now: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return Infinity;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / DAY_MS);
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "No se pudo completar la operación.";
}

function withYear(years: number[], y: number): number[] {
  return [...new Set([...years, y])].sort((a, b) => b - a);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Picks the year to open: the current one if it has data, else the most recent past year with data. */
function initialYear(yearsWithData: number[]): number {
  const now = currentYear();
  if (yearsWithData.includes(now)) return now;
  return yearsWithData.filter((y) => y < now).sort((a, b) => b - a)[0] ?? now;
}

/** `userId` scopes the remembered folder and the browser-internal storage to the signed-in account. */
export function WorkspaceProvider({
  userId,
  children,
  autoBackupDelayMs = AUTO_BACKUP_IDLE_MS,
}: {
  userId: string;
  children: ReactNode;
  /** How long the app must be idle (no queued work, no writes) before the automatic backup starts. Injectable for tests. */
  autoBackupDelayMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [backupDate, setBackupDate] = useState<string | null | undefined>(undefined);
  const [backupError, setBackupError] = useState("");
  const [backupBusy, setBackupBusy] = useState<"backup" | "restore" | null>(null);
  const [folderHasData, setFolderHasData] = useState(false);
  const pending = useRef(0);
  const lastActivity = useRef(Date.now());
  const busyRef = useRef<"backup" | "restore" | null>(null);

  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<Loaded | null>(null);

  /** Makes any in-flight load stale so it cannot overwrite newer state. */
  const invalidateLoads = useCallback(() => {
    generation.current++;
  }, []);

  const commit = useCallback((next: Loaded) => {
    latest.current = next;
    setLoaded(next);
  }, []);

  /**
   * Serializes tasks. A task enqueued before a folder change becomes stale: it is skipped if it has not
   * started, and an in-flight one must check `live()` before committing anything.
   */
  const enqueue = useCallback(<T,>(task: (live: () => boolean) => Promise<T>): Promise<T | undefined> => {
    const gen = generation.current;
    const live = () => generation.current === gen;
    const guarded = async () => (live() ? task(live) : undefined);
    pending.current++;
    const run = queue.current.then(guarded, guarded);
    void run.then(
      () => void pending.current--,
      () => void pending.current--,
    );
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const activate = useCallback(
    async (storage: Storage, fallback: boolean) => {
      const gen = ++generation.current;
      latest.current = null;
      setLoaded(null);
      setNotice("");
      setSaveError(false);
      setBackupDate(undefined);
      setFolderHasData(false);
      setBackupError("");
      setPhase({ status: "loading" });
      try {
        const repo = createWorkspaceRepo(storage);
        const [list, profile] = await Promise.all([repo.listYears(), repo.loadProfile()]);
        const year = initialYear(list);
        const docs = await loadYearDocs(repo, year);
        if (gen !== generation.current) return;
        commit({ years: withYear(withYear(list, currentYear()), year), year, ...docs, profile });
        setPhase({ status: "ready", storage, repo, fallback });
      } catch (e) {
        if (gen !== generation.current) return;
        setPhase({
          status: "error",
          message: e instanceof WorkspaceDataError ? DATA_ERROR_MESSAGE : "No se pudo abrir la carpeta.",
        });
      }
    },
    [commit],
  );

  const applyRestored = useCallback(async () => {
    if (supportsFolderAccess()) {
      const state = await restoreStorage(userId);
      if (state.status === "ready") return activate(state.storage, false);
      return setPhase(state);
    }
    const opfs = await openFallbackStorage(userId);
    if (opfs) return activate(opfs, true);
    setPhase({ status: "unsupported" });
  }, [activate, userId]);

  useEffect(() => {
    void applyRestored();
    return invalidateLoads;
  }, [applyRestored, invalidateLoads]);

  const pickFolder = useCallback(async () => {
    setNotice("");
    try {
      const storage = await chooseFolder(userId);
      await activate(storage, false);
    } catch (e) {
      if (!isAbort(e)) setNotice("No se pudo abrir la carpeta elegida.");
    }
  }, [activate, userId]);

  const allow = useCallback(async () => {
    setNotice("");
    const storage = await grantPermission(userId);
    if (storage) await activate(storage, false);
    else setNotice("No se concedió el permiso. Inténtalo otra vez o elige otra carpeta.");
  }, [activate, userId]);

  const readyPhase = phase.status === "ready" ? phase : null;

  /** Re-reads the open year from disk. Must run inside a queue slot. */
  const reloadNow = useCallback(
    async (repo: WorkspaceRepo, live: () => boolean) => {
      const year = latest.current?.year ?? currentYear();
      try {
        const [list, docs, profile] = await Promise.all([repo.listYears(), loadYearDocs(repo, year), repo.loadProfile()]);
        if (!live()) return;
        commit({ years: withYear(list, year), year, ...docs, profile });
      } catch (e) {
        if (!live()) return;
        setPhase({
          status: "error",
          message: e instanceof WorkspaceDataError ? DATA_ERROR_MESSAGE : "No se pudo leer la carpeta.",
        });
      }
    },
    [commit],
  );

  const reload = useCallback(async () => {
    if (!readyPhase) return;
    await enqueue((live) => reloadNow(readyPhase.repo, live));
  }, [readyPhase, enqueue, reloadNow]);

  const readyStorage = readyPhase?.storage ?? null;

  /** Runs `task` as the only thing in the queue; `busyRef` makes a second call fail fast (double click, navigation). */
  const runBackupTask = useCallback(
    async <T,>(kind: "backup" | "restore", task: (live: () => boolean) => Promise<T>): Promise<T> => {
      if (busyRef.current) throw new Error(BUSY_MESSAGE);
      busyRef.current = kind;
      setBackupBusy(kind);
      try {
        const out = await enqueue(async (live) => {
          const r = await task(live);
          // The folder was switched while this ran: never report success for a folder that is no longer open.
          if (!live()) throw new Error(FOLDER_CHANGED_MESSAGE);
          return r;
        });
        if (out === undefined) throw new Error(FOLDER_CHANGED_MESSAGE);
        return out;
      } finally {
        busyRef.current = null;
        setBackupBusy(null);
      }
    },
    [enqueue],
  );

  const runBackup = useCallback(async (): Promise<string> => {
    if (!readyStorage) throw new Error("La carpeta no está lista.");
    return runBackupTask("backup", async (live) => {
      const { saveBackup, lastBackupDate } = await import("@/backup/backup");
      const { hasData } = await import("@/backup/backup");
      const name = await saveBackup(readyStorage, "manual");
      const [date, data] = await Promise.all([lastBackupDate(readyStorage), hasData(readyStorage)]);
      if (live()) {
        setBackupDate(date);
        setFolderHasData(data);
      }
      return name;
    });
  }, [readyStorage, runBackupTask]);

  const restoreBackupFile = useCallback(
    async (file: Blob, replace: boolean): Promise<void> => {
      if (!readyPhase) throw new Error("La carpeta no está lista.");
      const { repo, storage } = readyPhase;
      await runBackupTask("restore", async (live) => {
        try {
          const { restoreBackup } = await import("@/backup/restore");
          await restoreBackup(storage, file, { replace });
        } finally {
          // Even after a partial failure the screen must show what is really on disk, inside this same slot.
          await reloadNow(repo, live);
          const { lastBackupDate, hasData } = await import("@/backup/backup");
          const date = await lastBackupDate(storage).catch(() => null);
          const data = await hasData(storage).catch(() => true);
          if (live()) {
            setBackupDate(date);
            setFolderHasData(data);
          }
        }
        return true;
      });
    },
    [readyPhase, runBackupTask, reloadNow],
  );

  /**
   * Weekly automatic backup. The status (date, has data) is read right away without touching the queue; the backup
   * itself starts only after the app has been idle for `autoBackupDelayMs`. Known limit: once it runs it holds the
   * write queue until the zip is done, so saves wait on very large folders.
   */
  const autoBackupFor = useRef<Storage | null>(null);
  useEffect(() => {
    if (!readyStorage || autoBackupFor.current === readyStorage) return;
    autoBackupFor.current = readyStorage;
    const storage = readyStorage;
    const gen = generation.current;
    const live = () => generation.current === gen;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idleHandle: number | undefined;
    lastActivity.current = Date.now();

    const idle = () => pending.current === 0 && Date.now() - lastActivity.current >= autoBackupDelayMs;
    const wait = () => Math.max(autoBackupDelayMs - (Date.now() - lastActivity.current), 50);

    const start = () => {
      idleHandle = undefined;
      if (cancelled || !live()) return;
      if (!idle()) return schedule();
      void enqueue(async (stillLive) => {
        try {
          if (!stillLive() || busyRef.current) return;
          const { saveBackup, lastBackupDate } = await import("@/backup/backup");
          busyRef.current = "backup";
          setBackupBusy("backup");
          try {
            await saveBackup(storage, "auto");
            const date = await lastBackupDate(storage);
            if (stillLive()) {
              setBackupDate(date);
              setBackupError("");
            }
          } finally {
            busyRef.current = null;
            setBackupBusy(null);
          }
        } catch (e) {
          console.warn("Automatic backup failed", e);
          if (stillLive()) setBackupError(errorMessage(e));
        }
      }).catch(() => undefined);
    };
    const schedule = () => {
      timer = setTimeout(() => {
        timer = undefined;
        if (cancelled || !live()) return;
        if (!idle()) return schedule();
        if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(start, { timeout: 10_000 });
        else start();
      }, wait());
    };

    void (async () => {
      try {
        const { lastBackupDate, hasData } = await import("@/backup/backup");
        const [date, data] = await Promise.all([lastBackupDate(storage), hasData(storage)]);
        if (cancelled || !live()) return;
        setBackupDate(date);
        setFolderHasData(data);
        const stale = date ? daysSince(date) > AUTO_BACKUP_AFTER_DAYS : data;
        if (stale) schedule();
      } catch (e) {
        console.warn("Backup status check failed", e);
      }
    })();

    return () => {
      cancelled = true;
      autoBackupFor.current = null;
      if (timer !== undefined) clearTimeout(timer);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
    };
  }, [readyStorage, enqueue, autoBackupDelayMs]);

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!readyPhase || !loaded) return null;
    const { repo, storage } = readyPhase;

    const refreshFromDisk = async (year: number, live: () => boolean) => {
      try {
        const [list, docs] = await Promise.all([repo.listYears(), loadYearDocs(repo, year)]);
        const cur = latest.current;
        if (cur && live()) commit({ ...cur, years: withYear(list, year), year, ...docs });
      } catch {
        // Keep the last known in-memory state.
      }
    };

    /** Queued read-modify-write of one document; shared by `update`, `updateNotes`, `updateGrades` and `updateUnits`. */
    const mutate = async <D,>(
      select: (l: Loaded) => D,
      store: (l: Loaded, d: D) => Loaded,
      save: (d: D) => Promise<void>,
      fn: (d: D) => D,
      year?: number,
    ): Promise<boolean> => {
      lastActivity.current = Date.now();
      const saved = await enqueue(async (live): Promise<boolean> => {
        const cur = latest.current;
        if (!cur) return false;
        if (year !== undefined && cur.year !== year) return false;
        let next: D;
        try {
          next = fn(select(cur));
        } catch {
          return false;
        }
        try {
          await save(next);
          if (!live()) return false;
          commit(store(cur, next));
          lastActivity.current = Date.now();
          setFolderHasData(true);
          setSaveError(false);
          return true;
        } catch {
          if (!live()) return false;
          setSaveError(true);
          await refreshFromDisk(cur.year, live);
          return false;
        }
      });
      return saved === true;
    };

    return {
      storage,
      repo,
      year: loaded.year,
      years: loaded.years,
      yearData: loaded.yearData,
      notes: loaded.notesFile.notes,
      grades: loaded.gradesFile,
      units: loaded.unitsFile,
      attendance: loaded.attendanceFile,
      agenda: loaded.agendaFile,
      profile: loaded.profile,
      canChooseFolder: supportsFolderAccess(),
      reload,
      backupDate,
      backupWarning:
        folderHasData && (backupDate === null || (backupDate !== undefined && daysSince(backupDate) > BACKUP_WARNING_AFTER_DAYS)),
      backupError,
      backupBusy,
      runBackup,
      restoreBackupFile,
      changeFolder: pickFolder,
      setYear: (y) =>
        enqueue(async (live) => {
          const cur = latest.current;
          if (!cur) return;
          try {
            const docs = await loadYearDocs(repo, y);
            if (!live()) return;
            commit({ ...cur, year: y, years: withYear(cur.years, y), ...docs });
          } catch {
            if (live()) setNotice("No se pudo abrir ese año.");
          }
        }),
      update: (fn) =>
        mutate(
          (l) => l.yearData,
          (l, yearData) => ({ ...l, yearData, years: withYear(l.years, yearData.schoolYear) }),
          (d) => repo.saveYear(d),
          fn,
        ),
      updateNotes: (fn, opts) =>
        mutate(
          (l) => l.notesFile,
          (l, notesFile) => ({ ...l, notesFile }),
          (f) => repo.saveNotes(f),
          fn,
          opts?.year,
        ),
      updateGrades: (fn, opts) =>
        mutate(
          (l) => l.gradesFile,
          (l, gradesFile) => ({ ...l, gradesFile }),
          (f) => repo.saveGrades(f),
          fn,
          opts?.year,
        ),
      updateUnits: (fn, opts) =>
        mutate(
          (l) => l.unitsFile,
          (l, unitsFile) => ({ ...l, unitsFile }),
          (f) => repo.saveUnits(f),
          fn,
          opts?.year,
        ),
      updateAttendance: (fn, opts) =>
        mutate(
          (l) => l.attendanceFile,
          (l, attendanceFile) => ({ ...l, attendanceFile }),
          (f) => repo.saveAttendance(f),
          fn,
          opts?.year,
        ),
      updateAgenda: (fn, opts) =>
        mutate(
          (l) => l.agendaFile,
          (l, agendaFile) => ({ ...l, agendaFile }),
          (f) => repo.saveAgenda(f),
          fn,
          opts?.year,
        ),
      saveProfile: (p): Promise<void> =>
        enqueue(async (live) => {
          lastActivity.current = Date.now();
          await repo.saveProfile(p);
          lastActivity.current = Date.now();
          setFolderHasData(true);
          const cur = latest.current;
          if (cur && live()) commit({ ...cur, profile: p });
        }),
    };
  }, [readyPhase, loaded, reload, backupDate, folderHasData, backupError, backupBusy, runBackup, restoreBackupFile, pickFolder, enqueue, commit]);

  if (value && readyPhase) {
    return (
      <WorkspaceContext.Provider value={value}>
        {readyPhase.fallback && (
          <p role="status" className="bg-accent-soft text-foreground px-4 py-2 text-sm">
            {FALLBACK_WARNING}
          </p>
        )}
        {saveError && (
          <p role="alert" className="bg-danger-soft text-foreground px-4 py-2 text-sm">
            {SAVE_ERROR_MESSAGE}
          </p>
        )}
        {notice && (
          <p role="alert" className="bg-danger-soft text-foreground px-4 py-2 text-sm">
            {notice}
          </p>
        )}
        {children}
      </WorkspaceContext.Provider>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <section className="card space-y-4 p-6">
        {phase.status === "loading" && <p>Abriendo tu cuaderno…</p>}
        {phase.status === "needs-folder" && (
          <>
            <h1 className="text-xl font-semibold">Elige dónde guardar tu cuaderno</h1>
            <p>
              Tus datos se guardan en una carpeta de tu computadora, no en internet. Elige o crea una carpeta llamada
              «Cuaderno de Campo».
            </p>
            <button className="btn-primary" onClick={() => void pickFolder()}>
              Elegir carpeta
            </button>
          </>
        )}
        {phase.status === "needs-permission" && (
          <>
            <h1 className="text-xl font-semibold">Permite el acceso a la carpeta &quot;{phase.folderName}&quot;</h1>
            <p>El navegador necesita tu permiso para volver a abrir tu carpeta.</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void allow()}>
                Permitir
              </button>
              <button className="btn-secondary" onClick={() => void pickFolder()}>
                Elegir otra carpeta
              </button>
            </div>
          </>
        )}
        {phase.status === "unsupported" && <p role="alert">{UNSUPPORTED_MESSAGE}</p>}
        {phase.status === "error" && <p role="alert">{phase.message}</p>}
        {notice && <p role="alert">{notice}</p>}
      </section>
    </main>
  );
}
