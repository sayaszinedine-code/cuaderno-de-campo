"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCompetencies } from "@/curriculum";
import { classroomLabel, todayISO } from "@/domain/classrooms";
import { periodOf } from "@/domain/notes";
import { UNIT_KIND_LABELS, type Period, type Unit } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const PERIOD_IDS: Period["id"][] = ["B1", "B2", "B3", "B4"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function UnidadesPage() {
  const { yearData, units } = useWorkspace();
  const [classroomPick, setClassroomPick] = useState("");
  const [periodPick, setPeriodPick] = useState<Period["id"] | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const bim = q.get("bim");
    setClassroomPick(q.get("aula") ?? "");
    if (bim && (PERIOD_IDS as string[]).includes(bim)) setPeriodPick(bim as Period["id"]);
  }, []);

  const classroom = yearData.classrooms.find((c) => c.id === classroomPick) ?? yearData.classrooms[0];
  const periodId = periodPick ?? periodOf(todayISO(), yearData.periods) ?? "B1";

  const cards = useMemo(
    () =>
      classroom
        ? units.units
            .filter((u) => u.classroomId === classroom.id && u.periodId === periodId)
            .sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999") || a.createdAt.localeCompare(b.createdAt))
        : [],
    [units.units, classroom, periodId],
  );

  if (!classroom) {
    return (
      <div className="space-y-3">
        <p>Primero crea un aula en «Aulas».</p>
        <Link href="/aulas/" className="underline">
          Ir a Aulas
        </Link>
      </div>
    );
  }

  const competencyNames = (u: Unit) =>
    u.competencyIds
      .map((id) => getCompetencies(classroom.cycle).find((c) => c.id === id)?.shortName)
      .filter((n): n is string => !!n);
  const sessionsOf = (u: Unit) => units.sessions.filter((s) => s.unitId === u.id);
  const filesOf = (u: Unit) => u.attachments.length + sessionsOf(u).reduce((n, s) => n + s.attachments.length, 0);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Unidades</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block">Aula</span>
          <select className="field" value={classroom.id} onChange={(e) => setClassroomPick(e.target.value)}>
            {yearData.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {classroomLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block">Bimestre</span>
          <select className="field" value={periodId} onChange={(e) => setPeriodPick(e.target.value as Period["id"])}>
            {PERIOD_IDS.map((id) => (
              <option key={id} value={id}>
                {yearData.periods.find((p) => p.id === id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <Link href={`/unidades/unidad/?aula=${classroom.id}&bim=${periodId}`} className="btn-primary">
          Nueva unidad
        </Link>
      </div>

      {cards.length === 0 ? (
        <p>Aún no hay unidades en este bimestre.</p>
      ) : (
        <ul className="space-y-3">
          {cards.map((u) => (
            <li key={u.id}>
              <Link href={`/unidades/unidad/?id=${u.id}`} className="card block space-y-1 p-4">
                <span className="text-muted block text-sm">{UNIT_KIND_LABELS[u.kind]}</span>
                <span className="block text-lg font-semibold">{u.title || "Sin título"}</span>
                {(u.start || u.end) && (
                  <span className="block text-sm">
                    {u.start ?? "…"} → {u.end ?? "…"}
                  </span>
                )}
                {competencyNames(u).length > 0 && <span className="block text-sm">{competencyNames(u).join(" · ")}</span>}
                <span className="text-muted block text-sm">
                  {plural(sessionsOf(u).length, "sesión", "sesiones")} · {plural(filesOf(u), "archivo", "archivos")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
