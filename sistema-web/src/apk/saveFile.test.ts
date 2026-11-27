import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverFile } from "./saveFile";

type Call = { id: string; name: string; mime: string; parts: string[]; mode?: string };

function fakeBridge() {
  const calls: Call[] = [];
  const bridge = {
    begin(name: string, mime: string) {
      calls.push({ id: `f${calls.length}`, name, mime, parts: [] });
      return calls[calls.length - 1].id;
    },
    append(id: string, base64: string) {
      calls.find((c) => c.id === id)!.parts.push(base64);
    },
    finish(id: string, mode: string) {
      calls.find((c) => c.id === id)!.mode = mode;
    },
  };
  Object.assign(window, { CuadernoAndroid: bridge });
  return calls;
}
const decode = (parts: string[]) => Uint8Array.from(parts.flatMap((p) => [...atob(p)].map((c) => c.charCodeAt(0))));

afterEach(() => {
  delete (window as { CuadernoAndroid?: unknown }).CuadernoAndroid;
  vi.restoreAllMocks();
});

describe("deliverFile inside the Android app", () => {
  it("hands the whole file to Android in chunks and asks to share it", async () => {
    const calls = fakeBridge();
    const bytes = Uint8Array.from({ length: 1_000_003 }, (_, i) => i % 251);
    await deliverFile(new Blob([bytes], { type: "application/zip" }), "respaldo.zip");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "respaldo.zip", mime: "application/zip", mode: "share" });
    expect(calls[0].parts.length).toBeGreaterThan(1);
    expect(decode(calls[0].parts)).toEqual(bytes);
  });

  it("asks Android to open the file when viewing", async () => {
    const calls = fakeBridge();
    await deliverFile(new Blob(["%PDF"], { type: "application/pdf" }), "informe.pdf", "view");
    expect(calls[0].mode).toBe("view");
  });

  it("uses a generic type when the blob has none", async () => {
    const calls = fakeBridge();
    await deliverFile(new Blob(["x"]), "archivo.bin");
    expect(calls[0].mime).toBe("application/octet-stream");
  });
});

describe("deliverFile in the browser", () => {
  it("downloads through a link", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:1"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await deliverFile(new Blob(["x"]), "a.txt");
    expect(click).toHaveBeenCalledOnce();
  });

  it("opens in a new tab when viewing", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:2"), revokeObjectURL: vi.fn() });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await deliverFile(new Blob(["x"]), "a.pdf", "view");
    expect(open).toHaveBeenCalledWith("blob:2", "_blank");
  });
});
