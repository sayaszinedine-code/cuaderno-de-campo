import { describe, it, expect } from "vitest";
import type { Storage } from "./types";
import { MemoryStorage } from "./memory";
import { FsAccessStorage } from "./fs-access";
import { OpfsStorage } from "./opfs";
import { FakeDirectoryHandle, asDirHandle } from "./test/fake-fs";

function readBytes(b: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

export function storageContract(name: string, make: () => Storage) {
  describe(`Storage contract: ${name}`, () => {
    it("writes and reads text in nested folders", async () => {
      const s = make();
      await s.writeTextAtomic("a/b/c.json", '{"x":1}');
      expect(await s.readText("a/b/c.json")).toBe('{"x":1}');
    });

    it("overwrites existing text", async () => {
      const s = make();
      await s.writeTextAtomic("f.json", "one");
      await s.writeTextAtomic("f.json", "two");
      expect(await s.readText("f.json")).toBe("two");
    });

    it("leaves no .tmp file after an atomic write", async () => {
      const s = make();
      await s.writeTextAtomic("d/f.json", "x");
      const names = (await s.list("d")).map((e) => e.name);
      expect(names).toEqual(["f.json"]);
    });

    it("returns null for missing files", async () => {
      const s = make();
      expect(await s.readText("nope.json")).toBeNull();
      expect(await s.readText("x/y/nope.json")).toBeNull();
      expect(await s.readFile("nope.bin")).toBeNull();
    });

    it("lists sorted by name with kinds; missing dir is empty", async () => {
      const s = make();
      await s.writeTextAtomic("z.json", "1");
      await s.writeTextAtomic("sub/a.json", "1");
      await s.writeTextAtomic("b.json", "1");
      expect(await s.list("")).toEqual([
        { name: "b.json", kind: "file" },
        { name: "sub", kind: "dir" },
        { name: "z.json", kind: "file" },
      ]);
      expect(await s.list("missing")).toEqual([]);
    });

    it("remove deletes files and ignores missing ones", async () => {
      const s = make();
      await s.writeTextAtomic("a/f.json", "1");
      await s.remove("a/f.json");
      expect(await s.readText("a/f.json")).toBeNull();
      await expect(s.remove("a/nope.json")).resolves.toBeUndefined();
      await expect(s.remove("nodir/nope.json")).resolves.toBeUndefined();
    });

    it("preserves bytes with writeFile/readFile", async () => {
      const s = make();
      const bytes = new Uint8Array([0, 1, 2, 250, 255]);
      await s.writeFile("img/p.bin", new Blob([bytes]));
      const back = await s.readFile("img/p.bin");
      expect(back).not.toBeNull();
      const got = await readBytes(back as Blob);
      expect(Array.from(got)).toEqual(Array.from(bytes));
    });

    it("createWriter streams chunks and publishes the file on close", async () => {
      const s = make();
      const w = await s.createWriter("deep/dir/big.bin");
      await w.write(new Uint8Array([1, 2, 3]));
      await w.write(new Uint8Array([250, 255]));
      await w.close();
      const back = await s.readFile("deep/dir/big.bin");
      expect(Array.from(await readBytes(back as Blob))).toEqual([1, 2, 3, 250, 255]);
      expect((await s.list("deep/dir")).map((e) => e.name)).toEqual(["big.bin"]);
    });

    it("createWriter replaces an existing file only on close", async () => {
      const s = make();
      await s.writeFile("f.bin", new Blob([new Uint8Array([9])]));
      const w = await s.createWriter("f.bin");
      await w.write(new Uint8Array([1, 2]));
      expect(Array.from(await readBytes((await s.readFile("f.bin")) as Blob))).toEqual([9]);
      await w.close();
      expect(Array.from(await readBytes((await s.readFile("f.bin")) as Blob))).toEqual([1, 2]);
    });

    it("createWriter abort leaves no file and no temp file, and keeps the original", async () => {
      const s = make();
      await s.writeFile("keep.bin", new Blob([new Uint8Array([7])]));
      const w1 = await s.createWriter("keep.bin");
      await w1.write(new Uint8Array([1]));
      await w1.abort();
      const w2 = await s.createWriter("new.bin");
      await w2.write(new Uint8Array([1]));
      await w2.abort();
      expect((await s.list("")).map((e) => e.name)).toEqual(["keep.bin"]);
      expect(Array.from(await readBytes((await s.readFile("keep.bin")) as Blob))).toEqual([7]);
    });

    it("createWriter rejects invalid paths", async () => {
      const s = make();
      for (const p of ["../x.bin", "/abs.bin", ".."]) await expect(s.createWriter(p)).rejects.toThrow("Invalid path");
    });

    it("rejects path traversal and absolute paths", async () => {
      const s = make();
      for (const p of ["../x.json", "a/../../x.json", "/abs.json", "a/..", ".."]) {
        await expect(s.readText(p)).rejects.toThrow("Invalid path");
        await expect(s.writeTextAtomic(p, "x")).rejects.toThrow("Invalid path");
        await expect(s.readFile(p)).rejects.toThrow("Invalid path");
        await expect(s.writeFile(p, new Blob(["x"]))).rejects.toThrow("Invalid path");
        await expect(s.list(p)).rejects.toThrow("Invalid path");
        await expect(s.remove(p)).rejects.toThrow("Invalid path");
      }
    });
  });
}

storageContract("MemoryStorage", () => new MemoryStorage());
storageContract("FsAccessStorage (with move)", () => new FsAccessStorage(asDirHandle(new FakeDirectoryHandle("w", true))));
storageContract("FsAccessStorage (without move)", () => new FsAccessStorage(asDirHandle(new FakeDirectoryHandle("w", false))));
// OpfsStorage shares FsAccessStorage's implementation; contract run guards the wrapper.
storageContract("OpfsStorage", () => new OpfsStorage(asDirHandle(new FakeDirectoryHandle("opfs", true))));

describe("FsAccessStorage failure handling", () => {
  const mk = (withMove: boolean) => {
    const fake = new FakeDirectoryHandle("w", withMove);
    return { fake, s: new FsAccessStorage(asDirHandle(fake)) };
  };

  it("falls back to rewrite when move() throws NotSupportedError", async () => {
    const { fake, s } = mk(true);
    fake.moveError = "NotSupportedError";
    await s.writeTextAtomic("d/f.json", "hello");
    expect(await s.readText("d/f.json")).toBe("hello");
    expect((await s.list("d")).map((e) => e.name)).toEqual(["f.json"]);
  });

  it("failed destination write rejects, keeps original and leaves no .tmp", async () => {
    const { fake, s } = mk(false);
    await s.writeTextAtomic("f.json", "original");
    fake.failWrite = (n) => n === "f.json";
    await expect(s.writeTextAtomic("f.json", "new")).rejects.toThrow();
    fake.failWrite = undefined;
    expect(await s.readText("f.json")).toBe("original");
    expect((await s.list("")).map((e) => e.name)).toEqual(["f.json"]);
  });

  it("failed tmp write rejects without touching the original", async () => {
    const { fake, s } = mk(true);
    await s.writeTextAtomic("f.json", "original");
    fake.failWrite = () => true;
    await expect(s.writeTextAtomic("f.json", "new")).rejects.toThrow("QuotaExceededError");
    fake.failWrite = undefined;
    expect(await s.readText("f.json")).toBe("original");
    expect((await s.list("")).map((e) => e.name)).toEqual(["f.json"]);
  });
});
