import type { Storage, StorageEntry, StorageKind } from "./types";
import { blobToText, splitPath } from "./path";

const MISSING = new Set(["NotFoundError", "TypeMismatchError"]);

function isMissing(e: unknown): boolean {
  return e instanceof Error && MISSING.has(e.name);
}

export class FsAccessStorage implements Storage {
  readonly kind: StorageKind = "fs-access";
  readonly label: string;

  constructor(protected readonly root: FileSystemDirectoryHandle) {
    this.label = root.name;
  }

  private async dirFor(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.root;
    try {
      for (const s of segments) dir = await dir.getDirectoryHandle(s, { create });
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
    return dir;
  }

  private async fileFor(path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    const segments = splitPath(path);
    const name = segments.pop() as string;
    const dir = await this.dirFor(segments, create);
    return dir ? { dir, name } : null;
  }

  async readFile(path: string): Promise<Blob | null> {
    const loc = await this.fileFor(path, false);
    if (!loc) return null;
    try {
      const handle = await loc.dir.getFileHandle(loc.name);
      return await handle.getFile();
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  async readText(path: string): Promise<string | null> {
    const blob = await this.readFile(path);
    return blob ? blobToText(blob) : null;
  }

  private async put(dir: FileSystemDirectoryHandle, name: string, data: Blob): Promise<void> {
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    try {
      await w.write(data);
    } finally {
      await w.close();
    }
  }

  async writeFile(path: string, data: Blob): Promise<void> {
    const loc = await this.fileFor(path, true);
    if (!loc) throw new Error("Cannot create folder");
    await this.put(loc.dir, loc.name, data);
  }

  async writeTextAtomic(path: string, text: string): Promise<void> {
    const loc = await this.fileFor(path, true);
    if (!loc) throw new Error("Cannot create folder");
    const { dir, name } = loc;
    const tmpName = `${name}.tmp`;
    const blob = new Blob([text], { type: "application/json" });
    try {
      await this.put(dir, tmpName, blob);
      const tmp = await dir.getFileHandle(tmpName);
      if (typeof tmp.move === "function") {
        await tmp.move(name);
      } else {
        await this.put(dir, name, blob);
        await dir.removeEntry(tmpName);
      }
    } catch (e) {
      // Best-effort cleanup; the original destination is never touched before the tmp is complete.
      await dir.removeEntry(tmpName).catch(() => undefined);
      throw e;
    }
  }

  async list(dir: string): Promise<StorageEntry[]> {
    const handle = await this.dirFor(splitPath(dir, true), false);
    if (!handle) return [];
    const out: StorageEntry[] = [];
    try {
      for await (const [name, entry] of handle.entries()) {
        out.push({ name, kind: entry.kind === "directory" ? "dir" : "file" });
      }
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async remove(path: string): Promise<void> {
    const loc = await this.fileFor(path, false);
    if (!loc) return;
    try {
      await loc.dir.removeEntry(loc.name, { recursive: true });
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
  }
}
