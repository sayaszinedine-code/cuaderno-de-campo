"use client";

import { useMemo, useRef, useState } from "react";
import { CYCLE_BANDS, type AgeBand, type Cycle } from "@/curriculum";
import { bandLabel, classroomLabel, createClassroom } from "@/domain/classrooms";
import type { Classroom } from "@/domain/schema";
import {
  applyLegacyImport,
  findImportedClassrooms,
  planLegacyImport,
  readLegacyFile,
  type ImportTarget,
  type LegacyData,
  type LegacyPlan,
} from "@/legacy/legacy-import";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const NEW = "new";
const DRAFT_ID = "__nueva__";
const ALREADY = "Este respaldo ya se importó. Solo se agregará lo nuevo.";

const duplicateWarning = (name: string) =>
  `Este respaldo ya se importó en el aula ${name}. Si lo importas en otra aula, se duplicarán los niños y registros.`;

function summaryText(p: LegacyPlan): string {
  return `Importación terminada: se agregaron ${p.students} niños, ${p.notes} registros, ${p.photos} fotos, ${p.attendanceDays} días de asistencia y ${p.events} eventos.`;
}

export function ImportLegacy() {
  const ws = useWorkspace();
  const { year, yearData, notes, attendance, agenda, profile, backupBusy } = ws;
  const [data, setData] = useState<LegacyData | null>(null);
  const [error, setError] = useState("");
  const [dest, setDest] = useState<string>("");
  const [name, setName] = useState("");
  const [cycle, setCycle] = useState<Cycle>("II");
  const [band, setBand] = useState<AgeBand>(CYCLE_BANDS.II[0]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [result, setResult] = useState<LegacyPlan | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const classrooms = yearData.classrooms;
  const destination = dest && (dest === NEW || classrooms.some((c) => c.id === dest)) ? dest : (classrooms[0]?.id ?? NEW);

  const draft = useMemo<Classroom>(
    () => ({ id: DRAFT_ID, name: name.trim(), cycle, bands: [band], disabledCompetencyIds: [], cycleIGrading: "descriptive" }),
    [name, cycle, band],
  );
  const classroom = useMemo(
    () => (destination === NEW ? draft : classrooms.find((c) => c.id === destination)),
    [destination, draft, classrooms],
  );

  const target = (c: Classroom, extra?: Classroom): ImportTarget => ({
    classroom: c,
    year,
    yearData: extra ? { ...yearData, classrooms: [...yearData.classrooms, extra] } : yearData,
    notes,
    attendance,
    agenda,
    profile,
  });

  // Memoized so progress ticks do not recompute it; it follows every saved document.
  const plan = useMemo(
    () =>
      data && classroom
        ? planLegacyImport(data, { classroom, year, yearData, notes, attendance, agenda, profile })
        : null,
    [data, classroom, year, yearData, notes, attendance, agenda, profile],
  );
  /** Classrooms that already hold children or records of this backup. */
  const importedIn = useMemo(() => (data ? findImportedClassrooms(data, yearData, notes) : []), [data, yearData, notes]);
  const otherRoom = importedIn.length > 0 && !importedIn.includes(destination) ? classrooms.find((c) => c.id === importedIn[0]) : undefined;

  async function onPick(file: File | undefined) {
    setError("");
    setResult(null);
    setData(null);
    if (!file) return;
    const parsed = await readLegacyFile(file);
    if ("error" in parsed) {
      setError(parsed.error);
      if (input.current) input.current.value = "";
      return;
    }
    // Preselect the classroom this backup was already imported into, so a re-import only adds what is new.
    const already = findImportedClassrooms(parsed, yearData, notes);
    if (already.length > 0) setDest(already[0]);
    setData(parsed);
  }

  async function onImport() {
    if (!data || !classroom || busy) return;
    setError("");
    setBusy(true);
    try {
      let into = classroom;
      let created: Classroom | undefined;
      if (destination === NEW) {
        const id = crypto.randomUUID();
        let next;
        try {
          next = createClassroom(yearData, { name, cycle, bands: [band] }, () => id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo crear el aula.");
          return;
        }
        created = next.classrooms.find((c) => c.id === id);
        if (!created) return;
        const ok = await ws.update((d) => {
          if (d.schoolYear !== year) throw new Error("year changed");
          return createClassroom(d, { name, cycle, bands: [band] }, () => id);
        });
        if (!ok) {
          setError("No se pudo crear el aula. Inténtalo de nuevo.");
          return;
        }
        into = created;
        setDest(id);
      }
      const done = await applyLegacyImport(data, target(into, created), {
        storage: ws.storage,
        update: ws.update,
        updateNotes: ws.updateNotes,
        updateAttendance: ws.updateAttendance,
        updateAgenda: ws.updateAgenda,
        saveProfile: ws.saveProfile,
        onPhoto: (i, n) => setProgress({ i, n }),
      });
      setResult(done);
      setData(null);
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la importación.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const disabled = busy || backupBusy !== null;

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Importar desde la app anterior</h2>
      <p className="text-sm text-muted">
        Usa el archivo de «Descargar respaldo completo (JSON)» de la app anterior. Solo se agregan datos; no se borra ni se cambia
        nada de lo que ya tienes. Se importa al año {year}.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Archivo de respaldo (.json)</span>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={(e) => void onPick(e.target.files?.[0])}
          className="block w-full text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          {error}
        </p>
      )}

      {data && plan && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Aula de destino</span>
            <select className="field w-full" value={destination} disabled={disabled} onChange={(e) => setDest(e.target.value)}>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {classroomLabel(c)}
                </option>
              ))}
              <option value={NEW}>Crear aula nueva</option>
            </select>
          </label>
          {destination === NEW && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Nombre del aula</span>
                <input className="field w-full" value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Ciclo</span>
                <select
                  className="field w-full"
                  value={cycle}
                  disabled={disabled}
                  onChange={(e) => {
                    const c = e.target.value === "I" ? "I" : "II";
                    setCycle(c);
                    setBand(CYCLE_BANDS[c][0]);
                  }}
                >
                  <option value="I">Ciclo I</option>
                  <option value="II">Ciclo II</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Edad</span>
                <select
                  className="field w-full"
                  value={band}
                  disabled={disabled}
                  onChange={(e) => {
                    const b = CYCLE_BANDS[cycle].find((x) => x === e.target.value);
                    if (b) setBand(b);
                  }}
                >
                  {CYCLE_BANDS[cycle].map((b) => (
                    <option key={b} value={b}>
                      {bandLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {otherRoom ? (
            <p className="rounded-xl bg-danger-soft p-3 text-sm">{duplicateWarning(otherRoom.name)}</p>
          ) : (
            plan.alreadyImported && <p className="rounded-xl bg-accent-soft p-3 text-sm">{ALREADY}</p>
          )}
          <ul className="list-inside list-disc text-sm">
            <li>Niños: {plan.students}</li>
            <li>Registros: {plan.notes}</li>
            <li>Fotos: {plan.photos}</li>
            <li>Días de asistencia: {plan.attendanceDays}</li>
            <li>Eventos de agenda: {plan.events}</li>
          </ul>
          {plan.unmatchedNotes > 0 && (
            <p className="text-sm">No se reconoció la competencia en {plan.unmatchedNotes} registros.</p>
          )}
          {plan.otherYearNotes > 0 && <p className="text-sm">{plan.otherYearNotes} registros de otro año no se importaron.</p>}
          {plan.skippedPhotos > 0 && <p className="text-sm">{plan.skippedPhotos} archivos adjuntos no son fotos y no se importarán.</p>}
          <button className="btn-primary" disabled={disabled} onClick={() => void onImport()}>
            Importar
          </button>
          {progress && (
            <p role="status" className="text-sm">
              Importando fotos {progress.i} de {progress.n}…
            </p>
          )}
        </div>
      )}

      {result && (
        <div role="status" className="space-y-1 rounded-xl bg-accent-soft p-3 text-sm">
          <p>{summaryText(result)}</p>
          {result.unmatchedNotes > 0 && <p>No se reconoció la competencia en {result.unmatchedNotes} registros.</p>}
          {result.otherYearNotes > 0 && <p>{result.otherYearNotes} registros de otro año no se importaron.</p>}
          {result.skippedPhotos > 0 && <p>{result.skippedPhotos} fotos no se pudieron importar.</p>}
        </div>
      )}
    </section>
  );
}
