export type StorageKind = "fs-access" | "opfs" | "memory";

export interface StorageEntry {
  name: string;
  kind: "file" | "dir";
}

/** Relative paths use "/"; intermediate folders are created on write. */
export interface Storage {
  kind: StorageKind;
  label: string;
  readText(path: string): Promise<string | null>;
  writeTextAtomic(path: string, text: string): Promise<void>;
  readFile(path: string): Promise<Blob | null>;
  writeFile(path: string, data: Blob): Promise<void>;
  list(dir: string): Promise<StorageEntry[]>;
  remove(path: string): Promise<void>;
}

export type StorageState =
  | { status: "ready"; storage: Storage }
  | { status: "needs-folder" }
  | { status: "needs-permission"; folderName: string };
