"use client";

import { useMemo, useState } from "react";
import { getPerformanceBands, getPerformances, type AgeBand } from "@/curriculum";
import { bandLabel } from "@/domain/classrooms";
import { performanceOptions } from "@/domain/notes";
import type { Classroom, SelectedPerformance, Student } from "@/domain/schema";

const NONE = "No hay desempeños registrados para esta competencia en estas edades.";

const sameItem = (a: SelectedPerformance, b: SelectedPerformance) =>
  a.competencyId === b.competencyId && a.band === b.band && a.text === b.text;

/** Desempeños of one competency as checkboxes. Remount (key) when the competency changes. */
export function PerformancePicker({
  classroom,
  students,
  competencyId,
  date,
  schoolYear,
  selected,
  onChange,
}: {
  classroom: Classroom;
  students: Student[];
  competencyId: string;
  date: string;
  schoolYear: number;
  selected: SelectedPerformance[];
  onChange: (next: SelectedPerformance[]) => void;
}) {
  const { bands, defaultBand } = useMemo(
    () => performanceOptions({ classroom, students, competencyId, date, schoolYear }),
    [classroom, students, competencyId, date, schoolYear],
  );
  const [chosen, setChosen] = useState<AgeBand | null>(null);

  if (defaultBand === null) return <p className="text-muted">{NONE}</p>;

  const choices = bands.length > 1 ? bands : getPerformanceBands(competencyId);
  const band = chosen !== null && choices.includes(chosen) ? chosen : defaultBand;
  const list = getPerformances(competencyId, band);

  const toggle = (item: SelectedPerformance) =>
    onChange(selected.some((s) => sameItem(s, item)) ? selected.filter((s) => !sameItem(s, item)) : [...selected, item]);

  return (
    <div className="space-y-3">
      {choices.length > 1 && (
        <label className="block space-y-1">
          <span>Edad de referencia</span>
          <select className="field" value={band} onChange={(e) => setChosen(e.target.value as AgeBand)}>
            {choices.map((b) => (
              <option key={b} value={b}>
                {bandLabel(b)}
              </option>
            ))}
          </select>
        </label>
      )}
      <ul className="space-y-3">
        {list.map((p) => {
          const item: SelectedPerformance = { competencyId, band, text: p.text };
          return (
            <li key={p.text} className="space-y-1">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.some((s) => sameItem(s, item))}
                  onChange={() => toggle(item)}
                />
                <span>{p.text}</span>
              </label>
              {p.example && (
                <details className="ml-6 text-sm text-muted">
                  <summary className="cursor-pointer">Ver ejemplo</summary>
                  <p className="mt-1">{p.example}</p>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
