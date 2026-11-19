import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDirectoryHandle, asDirHandle, domError } from "./test/fake-fs";

const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  del: vi.fn(async (k: string) => void store.delete(k)),
}));

import {
  chooseFolder,
  forgetFolder,
  grantPermission,
  openFallbackStorage,
  restoreStorage,
  supportsFolderAccess,
} from "./pick";

const U = "user-a";
const KEY = `workspace-dir:${U}`;

describe("restoreStorage", () => {
  beforeEach(() => store.clear());

  it("needs-folder when no handle is saved", async () => {
    expect(await restoreStorage(U)).toEqual({ status: "needs-folder" });
  });

  it("needs-permission with folderName when permission is prompt", async () => {
    const h = new FakeDirectoryHandle("Mis Datos");
    h.permission = "prompt";
    store.set(KEY, h);
    expect(await restoreStorage(U)).toEqual({ status: "needs-permission", folderName: "Mis Datos" });
  });

  it("needs-permission when permission was revoked (denied)", async () => {
    const h = new FakeDirectoryHandle("Mis Datos");
    h.permission = "denied";
    store.set(KEY, h);
    expect(await restoreStorage(U)).toEqual({ status: "needs-permission", folderName: "Mis Datos" });
  });

  it("ready when permission is granted and folder exists", async () => {
    store.set(KEY, new FakeDirectoryHandle("ok"));
    const st = await restoreStorage(U);
    expect(st.status).toBe("ready");
    if (st.status === "ready") expect(st.storage.kind).toBe("fs-access");
  });

  it("needs-folder when the folder no longer exists", async () => {
    const h = new FakeDirectoryHandle("gone");
    h.gone = true;
    store.set(KEY, h);
    expect(await restoreStorage(U)).toEqual({ status: "needs-folder" });
  });

  it("never throws: broken handle or idb failure yields needs-folder", async () => {
    store.set(KEY, {
      name: "x",
      queryPermission: async () => {
        throw domError("UnknownError");
      },
    });
    expect(await restoreStorage(U)).toEqual({ status: "needs-folder" });
  });
});

describe("chooseFolder / grantPermission", () => {
  beforeEach(() => store.clear());

  it("chooseFolder saves the picked handle and returns storage", async () => {
    const h = new FakeDirectoryHandle("picked");
    const picker = vi.fn(async () => asDirHandle(h));
    window.showDirectoryPicker = picker;
    const s = await chooseFolder(U);
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite", startIn: "documents" });
    expect(s.kind).toBe("fs-access");
    expect(store.get(KEY)).toBe(h);
    expect(supportsFolderAccess()).toBe(true);
  });

  it("grantPermission returns storage when granted, null otherwise", async () => {
    const h = new FakeDirectoryHandle("g");
    store.set(KEY, h);
    expect(await grantPermission(U)).not.toBeNull();
    h.permission = "denied";
    expect(await grantPermission(U)).toBeNull();
    store.clear();
    expect(await grantPermission(U)).toBeNull();
  });
});

describe("openFallbackStorage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when OPFS is unsupported (no volatile fallback)", async () => {
    vi.stubGlobal("navigator", {});
    expect(await openFallbackStorage(U)).toBeNull();
  });

  it("returns OpfsStorage rooted at a per-user subdirectory", async () => {
    const root = new FakeDirectoryHandle("opfs");
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => asDirHandle(root) } });
    const st = await openFallbackStorage(U);
    expect(st?.kind).toBe("opfs");
    await st?.writeTextAtomic("datos/perfil.json", "{}");
    expect(root.entriesMap.get(U)).toBeInstanceOf(FakeDirectoryHandle);
    expect([...root.entriesMap.keys()]).toEqual([U]);
  });

  it("returns null when getDirectory rejects", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => { throw new Error("denied"); } } });
    expect(await openFallbackStorage(U)).toBeNull();
  });
});

describe("per-account isolation", () => {
  beforeEach(() => store.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an empty user id", async () => {
    await expect(restoreStorage("")).rejects.toThrow();
  });

  it("user B does not get user A's folder, and forgetFolder only drops A's handle", async () => {
    window.showDirectoryPicker = vi.fn(async () => asDirHandle(new FakeDirectoryHandle("Carpeta de A")));
    await chooseFolder("user-a");
    expect((await restoreStorage("user-a")).status).toBe("ready");
    expect(await restoreStorage("user-b")).toEqual({ status: "needs-folder" });
    expect(await grantPermission("user-b")).toBeNull();

    store.set("workspace-dir:user-c", new FakeDirectoryHandle("Carpeta de C"));
    await forgetFolder("user-a");
    expect(store.has("workspace-dir:user-a")).toBe(false);
    expect(store.has("workspace-dir:user-c")).toBe(true);
    expect(await restoreStorage("user-a")).toEqual({ status: "needs-folder" });
  });

  it("user B after user A signs out gets needs-folder and an empty OPFS subtree", async () => {
    const root = new FakeDirectoryHandle("opfs");
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => asDirHandle(root) } });
    window.showDirectoryPicker = vi.fn(async () => asDirHandle(new FakeDirectoryHandle("Carpeta de A")));
    await chooseFolder("user-a");
    const a = await openFallbackStorage("user-a");
    await a?.writeTextAtomic("2026/datos/anio.json", "{}");
    await forgetFolder("user-a");

    expect(await restoreStorage("user-b")).toEqual({ status: "needs-folder" });
    const b = await openFallbackStorage("user-b");
    expect(await b?.list("")).toEqual([]);
    expect(await b?.readText("2026/datos/anio.json")).toBeNull();
    // A's browser data is not destroyed, only not opened for B.
    const again = await openFallbackStorage("user-a");
    expect(await again?.readText("2026/datos/anio.json")).toBe("{}");
  });
});
