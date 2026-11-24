"use client";

import { useState } from "react";
import { eventsOn, newEvent, removeEvent, upcoming, upsertEvent, validateEvent } from "@/domain/agenda";
import { todayISO } from "@/domain/classrooms";
import { EVENT_TYPES, type AgendaEvent, type EventType } from "@/domain/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const NOT_SAVED = "No se guardó. Inténtalo de nuevo.";
const OUT_OF_YEAR = "La fecha no pertenece al año abierto.";

const pad = (n: number) => String(n).padStart(2, "0");
const countLabel = (n: number) => (n === 1 ? "1 evento" : `${n} eventos`);
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1] ?? ""} de ${y}`;
};

/** Selection that belongs to `year`: today if it is in it, else January 1st. */
const defaultDay = (year: number) => {
  const today = todayISO();
  return today.startsWith(`${year}-`) ? today : `${year}-01-01`;
};

/** `?dia=YYYY-MM-DD` of the address bar when it falls in `year`. */
function diaFromUrl(year: number): string | null {
  if (typeof window === "undefined") return null;
  const dia = new URLSearchParams(window.location.search).get("dia");
  return dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia.startsWith(`${year}-`) ? dia : null;
}

type Draft = Omit<AgendaEvent, "time"> & { time: string };
const toDraft = (e: AgendaEvent): Draft => ({ ...e, time: e.time ?? "" });

export default function AgendaPage() {
  const { agenda, updateAgenda, year } = useWorkspace();
  const [day, setDay] = useState(() => diaFromUrl(year) ?? defaultDay(year));
  const [month, setMonth] = useState(() => (diaFromUrl(year) ?? defaultDay(year)).slice(0, 7));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seenYear, setSeenYear] = useState(year);
  if (seenYear !== year) {
    // The open year changed: leave a selection that belongs to the previous year and close any form.
    setSeenYear(year);
    const next = defaultDay(year);
    setDay(next);
    setMonth(next.slice(0, 7));
    setDraft(null);
    setError(null);
    setConfirmId(null);
    setDeleteError(false);
  }

  const [my, mm] = month.split("-").map(Number);
  const first = new Date(my, mm - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(my, mm, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const counts: Record<string, number> = {};
  for (const e of agenda.events) counts[e.date] = (counts[e.date] ?? 0) + 1;

  const shift = (delta: number) => {
    const d = new Date(my, mm - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const atFirst = month <= `${year}-01`;
  const atLast = month >= `${year}-12`;

  const select = (iso: string) => {
    setDay(iso);
    setMonth(iso.slice(0, 7));
    setDraft(null);
    setError(null);
    setConfirmId(null);
    setDeleteError(false);
  };

  const save = async () => {
    if (!draft || busy) return;
    const { time, ...rest } = draft;
    const event: AgendaEvent = time ? { ...rest, time } : rest;
    const problem = validateEvent(event);
    if (problem) return setError(problem);
    const saveYear = year;
    if (!event.date.startsWith(`${saveYear}-`)) return setError(OUT_OF_YEAR);
    setBusy(true);
    setError(null);
    const ok = await updateAgenda((f) => upsertEvent(f, event), { year: saveYear });
    setBusy(false);
    if (!ok) return setError(NOT_SAVED);
    select(event.date);
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setDeleteError(false);
    const ok = await updateAgenda((f) => removeEvent(f, id), { year });
    setBusy(false);
    if (!ok) return setDeleteError(true);
    setConfirmId(null);
    // An open edit form of the deleted event would bring it back on «Guardar».
    setDraft((d) => (d?.id === id ? null : d));
  };

  const dayEvents = eventsOn(agenda, day);
  const soon = upcoming(agenda, todayISO());
  const today = todayISO();
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Agenda" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn min-h-11 rounded-md border border-border px-4 font-medium" disabled={atFirst} onClick={() => shift(-1)}>
          ‹ Mes anterior
        </button>
        <h2 className="text-lg font-semibold" aria-live="polite">{`${MONTHS[mm - 1]} ${my}`}</h2>
        <button type="button" className="btn min-h-11 rounded-md border border-border px-4 font-medium" onClick={() => select(defaultDay(year))}>
          Hoy
        </button>
        <button type="button" className="btn min-h-11 rounded-md border border-border px-4 font-medium" disabled={atLast} onClick={() => shift(1)}>
          Mes siguiente ›
        </button>
      </div>

      <table role="grid" aria-label="Calendario" className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" className="py-1 text-sm font-medium text-muted">{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((n, ci) => {
                if (n === null) return <td key={ci} />;
                const iso = `${month}-${pad(n)}`;
                const c = counts[iso] ?? 0;
                return (
                  <td key={ci} className="p-0.5">
                    <button
                      type="button"
                      aria-pressed={iso === day}
                      aria-current={iso === today ? "date" : undefined}
                      title={dayLabel(iso)}
                      className={`flex min-h-11 w-full flex-col items-center justify-center rounded-md border border-border ${iso === day ? "bg-accent-soft ring-2 ring-current" : ""}`}
                      onClick={() => select(iso)}
                    >
                      <span>{n}</span>
                      {c > 0 && (
                        <>
                          <span aria-hidden="true" className="text-xs leading-none">●</span>
                          <span className="sr-only">{`, ${countLabel(c)}`}</span>
                        </>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="space-y-3" aria-label="Eventos del día">
        <h2 className="text-lg font-semibold">{dayLabel(day)}</h2>
        {dayEvents.length === 0 && !draft && <p className="text-muted">No hay eventos este día.</p>}
        <ul className="space-y-2">
          {dayEvents.map((e) => (
            <li key={e.id} className="card space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted">{[e.time, e.type].filter(Boolean).join(" · ")}</p>
                  {e.note && <p className="text-sm">{e.note}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Editar ${e.title}`}
                    className="btn min-h-11 rounded-md border border-border px-4 font-medium"
                    onClick={() => {
                      setDraft(toDraft(e));
                      setError(null);
                      setConfirmId(null);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar ${e.title}`}
                    className="btn min-h-11 rounded-md border border-border px-4 font-medium"
                    onClick={() => {
                      setConfirmId(e.id);
                      setDeleteError(false);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              {confirmId === e.id && (
                <div className="space-y-2">
                  <p>{`¿Eliminar «${e.title}»?`}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} className="btn min-h-11 rounded-md border border-border px-4 font-medium" onClick={() => void remove(e.id)}>
                      Sí, eliminar
                    </button>
                    <button type="button" className="btn min-h-11 rounded-md border border-border px-4 font-medium" onClick={() => setConfirmId(null)}>
                      Cancelar
                    </button>
                  </div>
                  {deleteError && <p role="alert" className="text-sm">{NOT_SAVED}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>

        {draft ? (
          <form
            className="card grid gap-3 p-4 sm:grid-cols-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void save();
            }}
          >
            <label className="sm:col-span-2">
              Título
              <input className="field" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label>
              Fecha
              <input type="date" className="field" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label>
              Tipo
              <select className="field" value={draft.type} onChange={(e) => set({ type: e.target.value as EventType })}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Hora
              <input type="time" className="field" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              Nota
              <textarea className="field" rows={3} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
            </label>
            {error && <p role="alert" className="text-sm sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-primary min-h-11">Guardar</button>
              <button
                type="button"
                className="btn min-h-11 rounded-md border border-border px-4 font-medium"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn min-h-11 rounded-md border border-border px-4 font-medium"
            onClick={() => {
              setDraft(toDraft(newEvent(day)));
              setError(null);
              setConfirmId(null);
            }}
          >
            Agregar evento
          </button>
        )}
      </section>

      <section className="space-y-2" aria-label="Próximas actividades">
        <h2 className="text-lg font-semibold">Próximas actividades</h2>
        {soon.length === 0 ? (
          <p className="text-muted">No hay actividades en los próximos 14 días.</p>
        ) : (
          <ul className="space-y-1">
            {soon.map((e) => (
              <li key={e.id}>
                <button type="button" className="min-h-11 w-full rounded-md border border-border px-3 text-left" onClick={() => select(e.date)}>
                  {`${dayLabel(e.date)}${e.time ? ` · ${e.time}` : ""} — ${e.title}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
