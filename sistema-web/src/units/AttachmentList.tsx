"use client";

import { useState } from "react";
import { openAttachment } from "@/domain/attachments";
import type { Attachment } from "@/domain/schema";
import type { Storage } from "@/storage/types";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Attachments with name, size, «Abrir» (download through an object URL) and «Quitar». */
export function AttachmentList({
  storage,
  items,
  onRemove,
  disabled = false,
}: {
  storage: Storage;
  items: Attachment[];
  onRemove: (a: Attachment) => void;
  /** Blocks «Quitar» while files are being written or the form is being saved. */
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.path} className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <span>
              <span className="font-medium">{a.name}</span> <span className="text-muted text-sm">{formatSize(a.size)}</span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                aria-label={`Abrir ${a.name}`}
                onClick={() => {
                  setError("");
                  openAttachment(storage, a).catch(() => setError("No se pudo abrir el archivo."));
                }}
              >
                Abrir
              </button>
              <button
                type="button"
                className="btn-secondary"
                aria-label={`Quitar ${a.name}`}
                disabled={disabled}
                onClick={() => onRemove(a)}
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3">
          {error}
        </p>
      )}
    </div>
  );
}
