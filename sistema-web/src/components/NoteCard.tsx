"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAreas, getCompetencies } from "@/curriculum";
import { NOTE_KIND_LABELS, type FieldNote, type Student } from "@/domain/schema";
import type { Storage } from "@/storage/types";

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
  const area = cycles.flatMap((c) => getAreas(c)).find((a) => a.id === note.areaId)?.name;
  const comp = cycles.flatMap((c) => getCompetencies(c)).find((c) => c.id === note.competencyId)?.name;
  const names = note.studentIds.flatMap((id) => {
    const s = students.find((x) => x.id === id);
    return s ? [`${s.firstNames} ${s.lastNames}`.trim()] : [];
  });
  const who = note.wholeGroup ? ["Todo el grupo"] : names;
  const shown = compact ? note.evidence.slice(0, 0) : note.evidence.slice(0, 4);

  return (
    <article className="card flex gap-3 p-4">
      <time dateTime={note.date} className="w-14 shrink-0 text-center text-sm font-semibold capitalize">
        {stamp(note.date)}
      </time>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-muted">
          {NOTE_KIND_LABELS[note.kind]}
          {area ? ` · ${area}` : ""}
          {comp ? ` · ${comp}` : ""}
        </p>
        {who.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 text-sm">
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
        <Link href={`/cuaderno/registro/?id=${encodeURIComponent(note.id)}`} className="inline-block text-sm underline">
          Abrir
        </Link>
      </div>
    </article>
  );
}
