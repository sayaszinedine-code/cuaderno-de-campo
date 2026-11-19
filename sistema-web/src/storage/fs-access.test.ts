import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDirectoryHandle, asDirHandle, domError } from "./test/fake-fs";

const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
}));

import { openFallbackStorage, restoreStorage, chooseFolder, grantPermission, supportsFolderAccess } from "./pick";

describe("restoreStorage", () => {
  beforeEach(() => store.clear());

  it("needs-folder when no handle is saved", async () => {
    expect(await restoreStorage()).toEqual({ status: "needs-folder" });
  });

  it("needs-permission with folderName when permission is prompt", async () => {
    const h = new FakeDirectoryHandle("Mis Datos");
    h.permission = "prompt";
    store.set("workspace-dir", h);
    expect(await restoreStorage()).toEqual({ status: "needs-permission", folderName: "Mis Datos" });
  });

  it("needs-permission when permission was revoked (denied)", async () => {
    const h = new FakeDirectoryHandle("Mis Datos");
    h.permission = "denied";
    store.set("workspace-dir", h);
    expect(await restoreStorage()).toEqual({ status: "needs-permission", folderName: "Mis Datos" });
  });

  it("ready when permission is granted and folder exists", async () => {
    store.set("workspace-dir", new FakeDirectoryHandle("ok"));
    const st = await restoreStorage();
    expect(st.status).toBe("ready");
    if (st.status === "ready") expect(st.storage.kind).toBe("fs-access");
  });

  it("needs-folder when the folder no longer exists", async () => {
    const h = new FakeDirectoryHandle("gone");
    h.gone = true;
    store.set("workspace-dir", h);
    expect(await restoreStorage()).toEqual({ status: "needs-folder" });
  });

  it("never throws: broken handle or idb failure yields needs-folder", async () => {
    store.set("workspace-dir", {
      name: "x",
      queryPermission: async () => {
        throw domError("UnknownError");
      },
    });
    expect(await restoreStorage()).toEqual({ status: "needs-folder" });
  });
});

describe("chooseFolder / grantPermission", () => {
  beforeEach(() => store.clear());

  it("chooseFolder saves the picked handle and returns storage", async () => {
    const h = new FakeDirectoryHandle("picked");
    const picker = vi.fn(async () => asDirHandle(h));
    window.showDirectoryPicker = picker;
    const s = await chooseFolder();
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite", startIn: "documents" });
    expect(s.kind).toBe("fs-access");
    expect(store.get("workspace-dir")).toBe(h);
    expect(supportsFolderAccess()).toBe(true);
  });

  it("grantPermission returns storage when granted, null otherwise", async () => {
    const h = new FakeDirectoryHandle("g");
    store.set("workspace-dir", h);
    expect(await grantPermission()).not.toBeNull();
    h.permission = "denied";
    expect(await grantPermission()).toBeNull();
    store.clear();
    expect(await grantPermission()).toBeNull();
  });
});

describe("openFallbackStorage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when OPFS is unsupported (no volatile fallback)", async () => {
    vi.stubGlobal("navigator", {});
    expect(await openFallbackStorage()).toBeNull();
  });

  it("returns OpfsStorage when supported", async () => {
    const root = new FakeDirectoryHandle("opfs");
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => asDirHandle(root) } });
    expect((await openFallbackStorage())?.kind).toBe("opfs");
  });

  it("returns null when getDirectory rejects", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => { throw new Error("denied"); } } });
    expect(await openFallbackStorage()).toBeNull();
  });
});
