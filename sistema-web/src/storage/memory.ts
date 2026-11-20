import type { FileWriter, Storage, StorageEntry } from "./types";
import { blobToText, splitPath } from "./path";

/** In-memory backend for tests and as a last-resort fallback. Keys are normalized paths. */
export class MemoryStorage implements Storage {
  readonly kind = "memory" as const;
  readonly label = "Memoria (temporal)";
  private files = new Map<string, Blob>();

  private key(path: string): string {
    return splitPath(path).join("/");
  }

  async readFile(path: string): Promise<Blob | null> {
    return this.files.get(this.key(path)) ?? null;
  }

  async readText(path: string): Promise<string | null> {
    const blob = await this.readFile(path);
    return blob ? blobToText(blob) : null;
  }

  async writeFile(path: string, data: Blob): Promise<void> {
    this.files.set(this.key(path), data);
  }

  async writeTextAtomic(path: string, text: string): Promise<void> {
    await this.writeFile(path, new Blob([text], { type: "application/json" }));
  }

  async createWriter(path: string): Promise<FileWriter> {
    const key = this.key(path);
    const chunks: BlobPart[] = [];
    let open = true;
    return {
      write: async (chunk) => {
        if (!open) throw new Error("Writer closed");
        chunks.push(chunk.slice());
      },
      close: async () => {
        if (!open) throw new Error("Writer closed");
        open = false;
        this.files.set(key, new Blob(chunks));
      },
      abort: async () => {
        open = false;
        chunks.length = 0;
      },
    };
  }

  async list(dir: string): Promise<StorageEntry[]> {
    const prefix = splitPath(dir, true).join("/");
    const base = prefix ? `${prefix}/` : "";
    const found = new Map<string, "file" | "dir">();
    for (const k of this.files.keys()) {
      if (!k.startsWith(base)) continue;
      const rest = k.slice(base.length).split("/");
      found.set(rest[0], rest.length > 1 ? "dir" : "file");
    }
    return [...found].map(([name, kind]) => ({ name, kind })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async remove(path: string): Promise<void> {
    const k = this.key(path);
    this.files.delete(k);
    for (const key of [...this.files.keys()]) if (key.startsWith(`${k}/`)) this.files.delete(key);
  }
}
