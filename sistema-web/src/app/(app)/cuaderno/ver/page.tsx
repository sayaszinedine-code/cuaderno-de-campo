"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { useThumbs } from "@/components/NoteCard";
import { Avatar } from "@/components/ui/Avatar";
import { getCompetencies } from "@/curriculum";
import { areaName } from "@/domain/areas";
import { todayISO } from "@/domain/classrooms";
import { dayLabel, isPending } from "@/domain/notes";
import { NOTE_KIND_LABELS, type FieldNote } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const LIST = "/cuaderno/";

/** Read-only view of one record: everything at a glance, «Editar» to change it. */
export default function VerPage() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  const { notes } = useWorkspace();

  if (id === undefined) return null;
  const note = id ? notes.find((n) => n.id === id) : undefined;
  if (!note) {
    return (
      <div className="space-y-3">
        <p>No encontramos este registro.</p>
        <Link href={LIST} className="text-primary underline">
          Volver al cuaderno
        </Link>
      </div>
    );
  }
  return <NoteView note={note} />;
}

function NoteView({ note }: { note: FieldNote }) {
  const { storage, yearData } = useWorkspace();
  const thumbs = useThumbs(storage, note.evidence, note.evidence.length);
  const [zoom, setZoom] = useState<string | null>(null);
  const area = areaName(note.areaId);
  const comp = (["I", "II"] as const)
    .flatMap((c) => getCompetencies(c))
    .find((c) => c.id === note.competencyId)?.name;
  const children = note.studentIds.flatMap((sid) => {
    const s = yearData.students.find((x) => x.id === sid);
    return s ? [`${s.firstNames} ${s.lastNames}`.trim()] : [];
  });
  const classroom = yearData.classrooms.find((c) => c.id === note.classroomId);

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={LIST} className="text-primary inline-flex items-center gap-1 font-semibold underline">
          ‹ Volver al cuaderno
        </Link>
        <Link href={`/cuaderno/registro/?id=${encodeURIComponent(note.id)}`} className="btn-primary">
          Editar
        </Link>
      </div>

      <header className="space-y-2">
        <p className="text-muted text-sm font-semibold">
          {[dayLabel(note.date, todayISO()), classroom?.name, note.moment].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="chip !min-h-0 !px-2 !py-0.5">{NOTE_KIND_LABELS[note.kind]}</span>
          {area && <span className="chip !min-h-0 !px-2 !py-0.5 bg-success-soft">{area}</span>}
          {isPending(note) && (
            <span className="chip !min-h-0 !px-2 !py-0.5 bg-warning-soft text-warning-foreground">Por completar</span>
          )}
        </div>
        {comp && <p className="text-muted">{comp}</p>}
      </header>

      <ul className="flex flex-wrap gap-2">
        {note.wholeGroup ? (
          <li className="chip">Todo el grupo</li>
        ) : (
          children.map((name) => (
            <li key={name} className="chip !pl-1">
              <Avatar name={name} size="sm" />
              {name}
            </li>
          ))
        )}
      </ul>

      <section className="card space-y-2 p-5">
        <h2 className="font-display text-sm font-semibold text-[var(--c-rosa)]">Qué hizo o dijo</h2>
        <p className="text-lg whitespace-pre-line">{note.evidenceText}</p>
      </section>

      {note.evidence.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {note.evidence.map((p, i) =>
            thumbs[i] ? (
              <button key={p} type="button" className="overflow-hidden rounded-2xl" onClick={() => setZoom(thumbs[i])}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbs[i] ?? ""} alt={`Foto ${i + 1} del registro`} className="aspect-square w-full object-cover" />
              </button>
            ) : (
              <span key={p} className="bg-accent-soft text-muted flex aspect-square items-center justify-center rounded-2xl text-sm">
                {thumbs.length === 0 ? "…" : "Foto no disponible"}
              </span>
            ),
          )}
        </section>
      )}

      {note.performances.length > 0 && (
        <section className="card space-y-2 p-5">
          <h2 className="font-display text-sm font-semibold text-[var(--c-rosa)]">Desempeños</h2>
          <ul className="list-disc space-y-1 pl-5">
            {note.performances.map((p) => (
              <li key={`${p.competencyId}-${p.band}-${p.text}`}>{p.text}</li>
            ))}
          </ul>
        </section>
      )}

      {(note.interpretation || note.reflection || note.level) && (
        <section className="card space-y-4 p-5">
          {note.interpretation && (
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--c-rosa)]">Interpretación</h2>
              <p className="whitespace-pre-line">{note.interpretation}</p>
            </div>
          )}
          {note.reflection && (
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--c-rosa)]">Reflexión docente</h2>
              <p className="whitespace-pre-line">{note.reflection}</p>
            </div>
          )}
          {note.level && (
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--c-rosa)]">Nivel de logro</h2>
              <p className="text-lg font-bold">{note.level}</p>
            </div>
          )}
        </section>
      )}

      {isPending(note) && (
        <Link
          href={`/cuaderno/registro/?id=${encodeURIComponent(note.id)}`}
          className="bg-warning-soft text-warning-foreground flex items-center gap-2 rounded-2xl p-4 font-semibold"
        >
          <Icon name="cuaderno" />
          Completar área, competencia e interpretación
        </Link>
      )}

      {zoom && <PhotoZoom src={zoom} onClose={() => setZoom(null)} />}
    </article>
  );
}

/**
 * Full-screen photo. Rendered into <body> so it covers the app header and the phone navigation
 * (page content is its own stacking context); Escape or a tap closes it and focus returns to the photo.
 */
function PhotoZoom({ src, onClose }: { src: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-xl" />
      <button
        ref={closeRef}
        type="button"
        aria-label="Cerrar foto"
        className="absolute top-4 right-4 flex size-12 items-center justify-center rounded-full bg-white/15 text-white"
        onClick={onClose}
      >
        <Icon name="cerrar" className="size-7" />
      </button>
    </div>,
    document.body,
  );
}
