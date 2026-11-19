"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWorkspaceRepo, WorkspaceDataError, type WorkspaceRepo } from "@/domain/workspace-repo";
import type { TeacherProfile, YearData } from "@/domain/schema";
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
  /** Applies `fn` to the latest data and saves. Never rejects: a failure shows the save banner. */
  update(fn: (d: YearData) => YearData): Promise<void>;
  reload(): Promise<void>;
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

type Loaded = { years: number[]; year: number; yearData: YearData; profile: TeacherProfile | null };

const currentYear = () => new Date().getFullYear();

function withYear(years: number[], y: number): number[] {
  return [...new Set([...years, y])].sort((a, b) => b - a);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(false);

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
    const run = queue.current.then(guarded, guarded);
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
      setPhase({ status: "loading" });
      try {
        const repo = createWorkspaceRepo(storage);
        const year = currentYear();
        const [list, yearData, profile] = await Promise.all([repo.listYears(), repo.loadYear(year), repo.loadProfile()]);
        if (gen !== generation.current) return;
        commit({ years: withYear(list, year), year, yearData, profile });
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
      const state = await restoreStorage();
      if (state.status === "ready") return activate(state.storage, false);
      return setPhase(state);
    }
    const opfs = await openFallbackStorage();
    if (opfs) return activate(opfs, true);
    setPhase({ status: "unsupported" });
  }, [activate]);

  useEffect(() => {
    void applyRestored();
    return invalidateLoads;
  }, [applyRestored, invalidateLoads]);

  const pickFolder = useCallback(async () => {
    setNotice("");
    try {
      const storage = await chooseFolder();
      await activate(storage, false);
    } catch (e) {
      if (!isAbort(e)) setNotice("No se pudo abrir la carpeta elegida.");
    }
  }, [activate]);

  const allow = useCallback(async () => {
    setNotice("");
    const storage = await grantPermission();
    if (storage) await activate(storage, false);
    else setNotice("No se concedió el permiso. Inténtalo otra vez o elige otra carpeta.");
  }, [activate]);

  const readyPhase = phase.status === "ready" ? phase : null;

  const reload = useCallback(async () => {
    if (!readyPhase) return;
    await enqueue(async (live) => {
      const year = latest.current?.year ?? currentYear();
      try {
        const [list, yearData, profile] = await Promise.all([
          readyPhase.repo.listYears(),
          readyPhase.repo.loadYear(year),
          readyPhase.repo.loadProfile(),
        ]);
        if (!live()) return;
        commit({ years: withYear(list, year), year, yearData, profile });
      } catch (e) {
        if (!live()) return;
        setPhase({
          status: "error",
          message: e instanceof WorkspaceDataError ? DATA_ERROR_MESSAGE : "No se pudo leer la carpeta.",
        });
      }
    });
  }, [readyPhase, enqueue, commit]);

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!readyPhase || !loaded) return null;
    const { repo, storage } = readyPhase;

    const refreshFromDisk = async (year: number, live: () => boolean) => {
      try {
        const [list, yearData] = await Promise.all([repo.listYears(), repo.loadYear(year)]);
        const cur = latest.current;
        if (cur && live()) commit({ ...cur, years: withYear(list, year), year, yearData });
      } catch {
        // Keep the last known in-memory state.
      }
    };

    return {
      storage,
      repo,
      year: loaded.year,
      years: loaded.years,
      yearData: loaded.yearData,
      profile: loaded.profile,
      canChooseFolder: supportsFolderAccess(),
      reload,
      changeFolder: pickFolder,
      setYear: (y) =>
        enqueue(async (live) => {
          const cur = latest.current;
          if (!cur) return;
          try {
            const yearData = await repo.loadYear(y);
            if (!live()) return;
            commit({ ...cur, year: y, years: withYear(cur.years, y), yearData });
          } catch {
            if (live()) setNotice("No se pudo abrir ese año.");
          }
        }),
      update: (fn) =>
        enqueue(async (live) => {
          const cur = latest.current;
          if (!cur) return;
          try {
            const next = fn(cur.yearData);
            await repo.saveYear(next);
            if (!live()) return;
            commit({ ...cur, yearData: next, years: withYear(cur.years, next.schoolYear) });
            setSaveError(false);
          } catch {
            if (!live()) return;
            setSaveError(true);
            await refreshFromDisk(cur.year, live);
          }
        }),
      saveProfile: (p): Promise<void> =>
        enqueue(async (live) => {
          await repo.saveProfile(p);
          const cur = latest.current;
          if (cur && live()) commit({ ...cur, profile: p });
        }),
    };
  }, [readyPhase, loaded, reload, pickFolder, enqueue, commit]);

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
