/* In-memory fake of the File System Access API, covering what FsAccessStorage uses. */
type Perm = "granted" | "denied" | "prompt";

export function domError(name: string, message = name): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

type FileBox = { data: Blob };

class FakeFileHandle {
  readonly kind = "file" as const;
  move?: (newName: string) => Promise<void>;
  constructor(
    public name: string,
    private dir: FakeDirectoryHandle,
    private box: FileBox,
    withMove: boolean,
  ) {
    if (withMove) {
      this.move = async (newName) => {
        if (dir.moveError) throw domError(dir.moveError);
        dir.entriesMap.delete(this.name);
        dir.entriesMap.set(newName, this.box);
        this.name = newName;
      };
    }
  }
  async getFile(): Promise<Blob> {
    return this.box.data;
  }
  async createWritable() {
    const chunks: BlobPart[] = [];
    return {
      write: async (d: BlobPart) => {
        if (this.dir.failWrite?.(this.name)) throw domError("QuotaExceededError");
        chunks.push(d);
      },
      close: async () => {
        this.box.data = new Blob(chunks);
      },
      abort: async () => {
        chunks.length = 0;
      },
    };
  }
}

export class FakeDirectoryHandle {
  readonly kind = "directory" as const;
  entriesMap = new Map<string, FakeDirectoryHandle | FileBox>();
  permission: Perm = "granted";
  gone = false;
  /** Failure injection: move() rejects with this error name. */
  moveError?: string;
  /** Failure injection: write() rejects for files whose name matches. */
  failWrite?: (fileName: string) => boolean;
  constructor(
    public name = "root",
    private withMove = true,
  ) {}

  private check() {
    if (this.gone) throw domError("NotFoundError");
  }
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    this.check();
    const e = this.entriesMap.get(name);
    if (e instanceof FakeDirectoryHandle) return e;
    if (e) throw domError("TypeMismatchError");
    if (!opts?.create) throw domError("NotFoundError");
    const d = new FakeDirectoryHandle(name, this.withMove);
    d.moveError = this.moveError;
    d.failWrite = this.failWrite;
    this.entriesMap.set(name, d);
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    this.check();
    let e = this.entriesMap.get(name);
    if (e instanceof FakeDirectoryHandle) throw domError("TypeMismatchError");
    if (!e) {
      if (!opts?.create) throw domError("NotFoundError");
      e = { data: new Blob([]) };
      this.entriesMap.set(name, e);
    }
    return new FakeFileHandle(name, this, e, this.withMove);
  }
  async removeEntry(name: string) {
    this.check();
    if (!this.entriesMap.delete(name)) throw domError("NotFoundError");
  }
  async *entries(): AsyncGenerator<[string, { kind: "file" | "directory"; name: string }]> {
    this.check();
    for (const [name, e] of [...this.entriesMap]) {
      yield [name, { kind: e instanceof FakeDirectoryHandle ? "directory" : "file", name }];
    }
  }
}

export function asDirHandle(d: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return d as unknown as FileSystemDirectoryHandle;
}
