"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { NoteCard } from "@/components/NoteCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { FilterBar, type ActiveFilter } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const nameOf = (id: string) => {
    const st = yearData.students.find((x) => x.id === id);
    return st ? `${st.firstNames} ${st.lastNames}`.trim() : id;
  };
  const active: ActiveFilter[] = [
    studentId && { key: "student", label: nameOf(studentId), onClear: () => reset(setStudentId)("") },
    areaId && {
      key: "area",
      label: areas.find(([id]) => id === areaId)?.[1] ?? areaId,
      onClear: () => {
        reset(setAreaId)("");
        setCompetencyId("");
      },
    },
    competencyId && {
      key: "competency",
      label: competencies.find(([id]) => id === competencyId)?.[1] ?? competencyId,
      onClear: () => reset(setCompetencyId)(""),
    },
    periodId && {
      key: "period",
      label: yearData.periods.find((p) => p.id === periodId)?.name ?? periodId,
      onClear: () => reset(setPeriodId)(""),
    },
    kind && { key: "kind", label: NOTE_KIND_LABELS[kind as NoteKind] ?? kind, onClear: () => reset(setKind)("") },
  ].filter((f): f is ActiveFilter => Boolean(f));
  const clearAll = () => {
    [setStudentId, setAreaId, setCompetencyId, setPeriodId, setKind].forEach((set) => set(""));
    setVisible(PAGE);
  };
  const count = `${list.length} ${list.length === 1 ? "registro" : "registros"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuaderno"
        subtitle={notes.length > 0 ? count : undefined}
        action={
          <span className="hidden md:inline-flex">
            <Link href="/cuaderno/registro/" className="btn-primary gap-2">
              <Icon name="mas-simple" />
              Nuevo registro
            </Link>
          </span>
        }
      />
      <FilterBar
        active={active}
        onClearAll={clearAll}
        search={
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Icon name="buscar" className="text-muted pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" />
            <input
              className={`${sel} !pl-10`}
              type="search"
              placeholder="Buscar en tus registros…"
              value={text}
              onChange={(e) => reset(setText)(e.target.value)}
            />
          </label>
        }
      >
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
      </FilterBar>
      {notes.length === 0 ? (
        <EmptyState icon="cuaderno" text="Todavía no hay registros. Toca «Nuevo registro» para tu primera observación." />
      ) : list.length === 0 ? (
        <EmptyState
          icon="filtro"
          text="Ningún registro coincide con los filtros."
          action={
            <button type="button" className="btn-secondary" onClick={() => { clearAll(); reset(setText)(""); }}>
              Limpiar filtros y búsqueda
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {list.slice(0, visible).map((n) => (
              <NoteCard key={n.id} note={n} students={yearData.students} storage={storage} />
            ))}
          </div>
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
      <Fab href="/cuaderno/registro/" label="Nuevo registro" />
    </div>
  );
}
