"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NoteCard } from "@/components/NoteCard";
import { getCompetenciesByArea, type Cycle } from "@/curriculum";
import { areasForCycles } from "@/domain/areas";
import { filterNotes } from "@/domain/notes";
import { NOTE_KINDS, NOTE_KIND_LABELS, type NoteKind } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

export default function CuadernoPage() {
  const { storage, yearData, notes } = useWorkspace();
  const [studentId, setStudentId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [competencyId, setCompetencyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [kind, setKind] = useState("");
  const [text, setText] = useState("");

  const cycles = useMemo(
    () => (["I", "II"] as Cycle[]).filter((c) => yearData.classrooms.some((k) => k.cycle === c)),
    [yearData.classrooms],
  );
  const areas = useMemo(() => {
    return areasForCycles(cycles).map((a): [string, string] => [a.id, a.name]);
  }, [cycles]);
  const competencies = useMemo(() => {
    const m = new Map<string, string>();
    cycles.forEach((c) =>
      areas.forEach(([id]) => {
        if (areaId && id !== areaId) return;
        getCompetenciesByArea(c, id).forEach((k) => m.set(k.id, k.name));
      }),
    );
    return [...m];
  }, [cycles, areas, areaId]);

  const list = useMemo(
    () =>
      filterNotes(notes, {
        studentId: studentId || undefined,
        areaId: areaId || undefined,
        competencyId: competencyId || undefined,
        periodId: (periodId || undefined) as "B1" | "B2" | "B3" | "B4" | undefined,
        kind: (kind || undefined) as NoteKind | undefined,
        text,
        periods: yearData.periods,
        students: yearData.students,
      }),
    [notes, studentId, areaId, competencyId, periodId, kind, text, yearData],
  );

  const PAGE = 30;
  const [visible, setVisible] = useState(PAGE);
  /** Wraps a filter setter so every filter/search change restarts pagination. */
  const reset =
    (set: (v: string) => void) =>
    (v: string): void => {
      set(v);
      setVisible(PAGE);
    };

  const sel = "field";
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cuaderno</h1>
        <Link href="/cuaderno/registro/" className="btn-primary">
          Nuevo registro
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          Buscar
          <input className={sel} type="search" value={text} onChange={(e) => reset(setText)(e.target.value)} />
        </label>
        <label>
          Niño o niña
          <select className={sel} value={studentId} onChange={(e) => reset(setStudentId)(e.target.value)}>
            <option value="">Todos</option>
            {yearData.students.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.firstNames} ${s.lastNames}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select
            className={sel}
            value={areaId}
            onChange={(e) => {
              reset(setAreaId)(e.target.value);
              setCompetencyId("");
            }}
          >
            <option value="">Todas</option>
            {areas.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Competencia
          <select className={sel} value={competencyId} onChange={(e) => reset(setCompetencyId)(e.target.value)}>
            <option value="">Todas</option>
            {competencies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bimestre
          <select className={sel} value={periodId} onChange={(e) => reset(setPeriodId)(e.target.value)}>
            <option value="">Todos</option>
            {yearData.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select className={sel} value={kind} onChange={(e) => reset(setKind)(e.target.value)}>
            <option value="">Todos</option>
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {notes.length === 0 ? (
        <p className="card p-5">Todavía no hay registros. Toca «Nuevo registro» para tu primera observación.</p>
      ) : list.length === 0 ? (
        <p className="card p-5">Ningún registro coincide con los filtros.</p>
      ) : (
        <div className="space-y-3">
          {list.slice(0, visible).map((n) => (
            <NoteCard key={n.id} note={n} students={yearData.students} storage={storage} />
          ))}
          <p className="text-sm text-muted">
            Mostrando {Math.min(visible, list.length)} de {list.length} registros
          </p>
          {visible < list.length && (
            <button type="button" className="btn-secondary" onClick={() => setVisible(visible + PAGE)}>
              Ver más
            </button>
          )}
        </div>
      )}
    </div>
  );
}
