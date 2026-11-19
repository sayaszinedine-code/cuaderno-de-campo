import { del, get, set } from "idb-keyval";
import type { Storage, StorageState } from "./types";
import { FsAccessStorage } from "./fs-access";
import { OpfsStorage } from "./opfs";

/** The remembered folder is per account, so another teacher on the same browser never reopens it. */
function keyFor(userId: string): string {
  if (!userId) throw new Error("Falta el usuario para abrir la carpeta.");
  return `workspace-dir:${userId}`;
}

export function supportsFolderAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function savedHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await get<FileSystemDirectoryHandle>(key)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Never throws for folder problems: a missing, moved, deleted or revoked folder maps to a state the UI can
 * handle. (An empty userId is a programming error and rejects.)
 */
export async function restoreStorage(userId: string): Promise<StorageState> {
  const handle = await savedHandle(keyFor(userId));
  if (!handle) return { status: "needs-folder" };
  try {
    const perm = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "prompt";
    if (perm !== "granted") return { status: "needs-permission", folderName: handle.name };
    // Probe: a deleted/moved folder passes the permission query but fails on access.
    await handle.entries().next();
    return { status: "ready", storage: new FsAccessStorage(handle) };
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") return { status: "needs-permission", folderName: handle.name };
    return { status: "needs-folder" };
  }
}

/** Opens the picker (needs a user gesture) and remembers the handle. Rejects with AbortError if cancelled. */
export async function chooseFolder(userId: string): Promise<Storage> {
  const key = keyFor(userId);
  if (!window.showDirectoryPicker) throw new Error("Folder access not supported");
  const handle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
  await set(key, handle);
  return new FsAccessStorage(handle);
}

/** Re-requests permission on the saved folder (needs a user gesture). Null if unavailable or refused. */
export async function grantPermission(userId: string): Promise<Storage | null> {
  const handle = await savedHandle(keyFor(userId));
  if (!handle) return null;
  try {
    const perm = await handle.requestPermission?.({ mode: "readwrite" });
    if (perm !== "granted") return null;
    await handle.entries().next();
    return new FsAccessStorage(handle);
  } catch {
    return null;
  }
}

/**
 * OPFS fallback for browsers without folder access, inside a per-account subdirectory.
 * Null when unsupported: never silently use volatile storage.
 */
export async function openFallbackStorage(userId: string): Promise<Storage | null> {
  if (!userId || !OpfsStorage.isSupported()) return null;
  try {
    return await OpfsStorage.open(userId);
  } catch {
    return null;
  }
}

/** Forgets the account's remembered folder (on sign-out). Never deletes any data. Never throws. */
export async function forgetFolder(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await del(keyFor(userId));
  } catch {
    // IndexedDB unavailable: nothing was remembered.
  }
}
