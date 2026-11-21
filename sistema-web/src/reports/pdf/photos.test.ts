import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTOS, loadPhotos } from "./photos";
import { PNG_1PX } from "./test-fixtures";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF = new TextEncoder().encode("GIF89a....");

function storageWith(files: Record<string, Uint8Array | "throw">) {
  const readFile = vi.fn(async (path: string) => {
    const f = files[path];
    if (f === "throw") throw new Error("gone");
    return f ? new Blob([f.slice()]) : null;
  });
  return { readFile };
}

describe("loadPhotos", () => {
  it("allows up to four photos per record", () => {
    expect(MAX_PHOTOS).toBe(4);
  });

  it("turns PNG and JPEG files into data URIs, detected by content", async () => {
    const storage = storageWith({ "a/1.png": PNG_1PX, "a/2.jpg": JPEG });
    const r = await loadPhotos(storage, ["a/1.png", "a/2.jpg"]);
    expect(r.skipped).toBe(0);
    expect(r.photos.map((p) => p.src.slice(0, 22))).toEqual(["data:image/png;base64,", "data:image/jpeg;base64"]);
    expect(r.photos[1].src).toBe(`data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG))}`);
  });

  it("skips missing, unreadable and unsupported files and counts them", async () => {
    const storage = storageWith({ "a/ok.jpg": JPEG, "a/bad": "throw", "a/anim.gif": GIF });
    const r = await loadPhotos(storage, ["a/missing.jpg", "a/bad", "a/anim.gif", "a/ok.jpg"]);
    expect(r.photos).toHaveLength(1);
    expect(r.skipped).toBe(3);
  });

  it("stops reading once four photos are loaded", async () => {
    const files = Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((n) => [`a/${n}.jpg`, JPEG]));
    const storage = storageWith(files);
    const r = await loadPhotos(storage, Object.keys(files));
    expect(r.photos).toHaveLength(4);
    expect(storage.readFile).toHaveBeenCalledTimes(4);
  });
});
