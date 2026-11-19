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
