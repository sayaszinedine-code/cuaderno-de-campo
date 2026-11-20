"use client";

import { useRef, useState } from "react";
import { saveAttachment, validateAttachment } from "@/domain/attachments";
import type { Attachment } from "@/domain/schema";
import type { Storage } from "@/storage/types";

export const ATTACHMENT_FAILED = "No se pudo guardar uno de los archivos.";
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/**
 * Attachments of a unit or session, with the same rules as the evidence photos of a note:
 * the file is written before its record enters the state; existing files are deleted only after a
 * successful save (`commit`); files added in this session are deleted on `discard`; a name is freed
 * only after its removal settles; callers block their buttons while `busy`.
 */
export function useAttachments(storage: Storage, initial: Attachment[], dirFor: () => string) {
  const [attachments, setAttachments] = useState<Attachment[]>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const pendingRef = useRef<Promise<void>[]>([]);
  /** Files written during this session (deleted on cancel). */
  const addedRef = useRef<string[]>([]);
  /** Existing attachments taken out of the form; deleted after a successful save. */
  const removedRef = useRef<string[]>([]);
  /** Names in use: current attachments, names already on disk and in-flight writes. */
  const takenRef = useRef<string[]>(initial.map((a) => basename(a.path)));
  /** Names on disk per folder (listed once per folder). */
  const diskRef = useRef(new Map<string, Promise<void>>());
  const dirRef = useRef(dirFor);
  dirRef.current = dirFor;

  const listDir = (dir: string): Promise<void> => {
    let p = diskRef.current.get(dir);
    if (!p) {
      p = storage
        .list(dir)
        .then((entries) => {
          for (const e of entries) if (e.kind === "file") takenRef.current.push(e.name);
        })
        .catch(() => undefined);
      diskRef.current.set(dir, p);
    }
    return p;
  };

  async function upload(files: File[]) {
    for (const file of files) {
      const dir = dirRef.current();
      await listDir(dir);
      try {
        const att = await saveAttachment(storage, dir, file, takenRef.current);
        addedRef.current.push(att.path);
        setAttachments((a) => [...a, att]);
      } catch {
        setError(ATTACHMENT_FAILED);
      }
    }
  }

  function add(files: File[]) {
    const ok: File[] = [];
    const problems: string[] = [];
    for (const f of files) {
      const msg = validateAttachment(f);
      if (msg === null) ok.push(f);
      else if (!problems.includes(msg)) problems.push(msg);
    }
    setError(problems.join(" "));
    if (ok.length === 0) return;
    setPending((c) => c + 1);
    const job = upload(ok).finally(() => {
      pendingRef.current = pendingRef.current.filter((p) => p !== job);
      setPending((c) => c - 1);
    });
    pendingRef.current.push(job);
  }

  function remove(att: Attachment) {
    if (pending > 0) return;
    setAttachments((a) => a.filter((x) => x.path !== att.path));
    if (addedRef.current.includes(att.path)) {
      addedRef.current = addedRef.current.filter((p) => p !== att.path);
      void storage
        .remove(att.path)
        .catch(() => undefined)
        .finally(() => {
          const i = takenRef.current.lastIndexOf(basename(att.path));
          if (i >= 0) takenRef.current.splice(i, 1);
        });
    } else {
      removedRef.current.push(att.path);
    }
  }

  const removeFiles = (paths: string[]) => Promise.all(paths.map((p) => storage.remove(p).catch(() => undefined)));

  return {
    attachments,
    busy: pending > 0,
    error,
    clearError: () => setError(""),
    add,
    remove,
    /** Resolves when every in-flight write has settled. */
    settle: async () => {
      await Promise.all(pendingRef.current);
    },
    /** After a successful save: delete the removed existing files that are no longer referenced. */
    commit: async (kept: Attachment[]) => {
      await removeFiles(removedRef.current.filter((p) => !kept.some((a) => a.path === p)));
      removedRef.current = [];
      addedRef.current = [];
    },
    /** Cancel/back: delete what this session added. */
    discard: async () => {
      await removeFiles(addedRef.current);
      addedRef.current = [];
    },
    /** Files added in this session (still on disk). */
    addedPaths: () => [...addedRef.current],
    removeFiles,
  };
}
