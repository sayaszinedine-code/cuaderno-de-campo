"use client";

import { useEffect, useState } from "react";
import type { Storage } from "@/storage/types";

/** Thumbnails of the evidence photos; object URLs are revoked on change and unmount. */
export function EvidencePhotos({
  storage,
  paths,
  onRemove,
  disabled = false,
}: {
  storage: Storage;
  paths: string[];
  onRemove: (path: string) => void;
  /** Blocks «Quitar foto» while photos are being written or the note is being saved. */
  disabled?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("\n");

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    const list = key ? key.split("\n") : [];
    void Promise.all(
      list.map(async (p) => {
        try {
          const blob = await storage.readFile(p);
          if (!live || !blob) return;
          const url = URL.createObjectURL(blob);
          made.push(url);
          return [p, url] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((res) => {
      if (live) setUrls(Object.fromEntries(res.filter((r): r is readonly [string, string] => r !== undefined)));
    });
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
      setUrls({});
    };
  }, [storage, key]);

  if (paths.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {paths.map((p, i) => (
        <li key={p} className="space-y-1">
          {urls[p] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[p]} alt={`Foto ${i + 1}`} className="h-24 w-24 rounded-xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-danger-soft text-xs">Sin vista previa</div>
          )}
          <button type="button" className="btn-secondary w-full text-sm" disabled={disabled} onClick={() => onRemove(p)}>
            Quitar foto {i + 1}
          </button>
        </li>
      ))}
    </ul>
  );
}
