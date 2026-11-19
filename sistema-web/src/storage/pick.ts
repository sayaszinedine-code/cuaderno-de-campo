import { get, set } from "idb-keyval";
import type { Storage, StorageState } from "./types";
import { FsAccessStorage } from "./fs-access";
import { OpfsStorage } from "./opfs";

const KEY = "workspace-dir";

export function supportsFolderAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function savedHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await get<FileSystemDirectoryHandle>(KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Never throws: a missing, moved, deleted or revoked folder maps to a state the UI can handle. */
export async function restoreStorage(): Promise<StorageState> {
  const handle = await savedHandle();
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
export async function chooseFolder(): Promise<Storage> {
  if (!window.showDirectoryPicker) throw new Error("Folder access not supported");
  const handle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
  await set(KEY, handle);
  return new FsAccessStorage(handle);
}

/** Re-requests permission on the saved folder (needs a user gesture). Null if unavailable or refused. */
export async function grantPermission(): Promise<Storage | null> {
  const handle = await savedHandle();
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

/** OPFS fallback for browsers without folder access. Null when unsupported: never silently use volatile storage. */
export async function openFallbackStorage(): Promise<Storage | null> {
  if (!OpfsStorage.isSupported()) return null;
  try {
    return await OpfsStorage.open();
  } catch {
    return null;
  }
}
