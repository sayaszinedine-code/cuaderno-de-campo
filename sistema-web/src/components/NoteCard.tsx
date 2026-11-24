"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCompetencies } from "@/curriculum";
import { areaName } from "@/domain/areas";
import { NOTE_KIND_LABELS, type FieldNote, type Student } from "@/domain/schema";
import type { Storage } from "@/storage/types";
import { Avatar } from "@/components/ui/Avatar";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function stamp(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

/** Loads up to `max` photos as object URLs; revokes them on unmount or when paths change. `null` = missing. */
function useThumbs(storage: Storage, paths: string[], max: number): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const key = paths.slice(0, max).join("\n");
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    const list = key ? key.split("\n") : [];
    void Promise.all(
      list.map(async (p) => {
        try {
          const blob = await storage.readFile(p);
          if (!live || !blob) return null;
          const url = URL.createObjectURL(blob);
          made.push(url);
          return url;
        } catch {
          return null;
        }
      }),
    ).then((res) => {
      if (live) setUrls(res);
    });
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
      setUrls([]);
    };
  }, [storage, key]);
  return urls;
}

export function NoteCard({
  note,
  students,
  storage,
  compact = false,
}: {
  note: FieldNote;
  students: Student[];
  storage: Storage;
  compact?: boolean;
}) {
  const thumbs = useThumbs(storage, compact ? [] : note.evidence, 4);
  const cycles = ["I", "II"] as const;
  const area = areaName(note.areaId);
  const comp = cycles.flatMap((c) => getCompetencies(c)).find((c) => c.id === note.competencyId)?.name;
  const names = note.studentIds.flatMap((id) => {
    const s = students.find((x) => x.id === id);
    return s ? [`${s.firstNames} ${s.lastNames}`.trim()] : [];
  });
  const who = note.wholeGroup ? ["Todo el grupo"] : names;
  const shown = compact ? note.evidence.slice(0, 0) : note.evidence.slice(0, 4);

  return (
    <article className="card card-interactive flex gap-3 p-4">
      <div className="flex w-14 shrink-0 flex-col items-center gap-2">
        {note.wholeGroup || names.length === 0 ? (
          <span aria-hidden="true" className="avatar bg-accent-soft size-11 text-sm">
            ★
          </span>
        ) : (
          <Avatar name={names[0]} />
        )}
        <time dateTime={note.date} className="text-center text-sm font-semibold capitalize">
          {stamp(note.date)}
        </time>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="chip !min-h-0 !px-2 !py-0.5">{NOTE_KIND_LABELS[note.kind]}</span>
          {area && <span className="chip !min-h-0 !px-2 !py-0.5 bg-success-soft">{area}</span>}
          {comp && <span className="text-muted self-center font-normal">{comp}</span>}
        </p>
        {who.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 text-sm font-medium">
            {who.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <p className="line-clamp-3 whitespace-pre-line">{note.evidenceText}</p>
        {shown.length > 0 && (
          <div className="flex gap-2">
            {shown.map((p, i) =>
              thumbs[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={thumbs[i] ?? ""} alt={`Foto ${i + 1} del registro`} className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <span key={p} className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-soft p-1 text-center text-xs text-muted">
                  {thumbs.length === 0 ? "…" : "Foto no disponible"}
                </span>
              ),
            )}
          </div>
        )}
        <Link
          href={`/cuaderno/registro/?id=${encodeURIComponent(note.id)}`}
          className="text-primary inline-flex min-h-9 items-center text-sm font-semibold underline"
        >
          Abrir
        </Link>
      </div>
    </article>
  );
}
