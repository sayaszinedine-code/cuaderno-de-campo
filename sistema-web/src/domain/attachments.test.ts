import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { attachmentName, openAttachment, saveAttachment, validateAttachment } from "./attachments";

const file = (name: string, size = 10, type = "") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

afterEach(() => vi.useRealTimers());

describe("validateAttachment", () => {
  it("accepts allowed extensions case-insensitively", () => {
    expect(validateAttachment(file("Plan.DOCX"))).toBeNull();
    expect(validateAttachment(file("foto.JPeG"))).toBeNull();
  });
  it("rejects files over 25 MB", () => {
    expect(validateAttachment(file("a.pdf", 30 * 1024 * 1024))).toBe("El archivo pesa más de 25 MB.");
  });
  it("rejects disallowed or missing extensions", () => {
    expect(validateAttachment(file("virus.exe"))).toBe("Ese tipo de archivo no está permitido.");
    expect(validateAttachment(file("sinext"))).toBe("Ese tipo de archivo no está permitido.");
  });
});

describe("attachmentName", () => {
  it("keeps free names and sanitizes them", () => {
    expect(attachmentName([], "Plan.docx")).toBe("Plan.docx");
    expect(attachmentName([], "a/b.pdf")).toBe("a b.pdf");
  });
  it("numbers duplicates before the extension, ignoring case", () => {
    expect(attachmentName(["Plan.docx"], "Plan.docx")).toBe("Plan (2).docx");
    expect(attachmentName(["Plan.docx", "Plan (2).docx"], "plan.DOCX")).toBe("plan (3).DOCX");
  });
  it("appends the suffix at the end when there is no extension", () => {
    expect(attachmentName(["Notas"], "Notas")).toBe("Notas (2)");
  });
});

describe("saveAttachment", () => {
  it("writes the file, reserves the name and returns the record", async () => {
    const storage = new MemoryStorage();
    const taken = ["Plan.docx"];
    const a = await saveAttachment(storage, "dir/", file("Plan.docx", 10, "application/msword"), taken);
    expect(a.name).toBe("Plan (2).docx");
    expect(a.path).toBe("dir/Plan (2).docx");
    expect(a.size).toBe(10);
    expect(a.type).toBe("application/msword");
    expect(taken).toContain("Plan (2).docx");
    expect(await storage.readFile(a.path)).not.toBeNull();
  });
  it("releases the name when the write fails", async () => {
    const storage = new MemoryStorage();
    storage.writeFile = async () => {
      throw new Error("disk");
    };
    const taken: string[] = [];
    await expect(saveAttachment(storage, "dir/", file("a.pdf"), taken)).rejects.toThrow("disk");
    expect(taken).toEqual([]);
  });
});

describe("openAttachment", () => {
  it("downloads through an object URL and revokes it afterwards", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const a = await saveAttachment(storage, "d/", file("a.pdf"), []);
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await openAttachment(storage, a);
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
    vi.unstubAllGlobals();
  });
  it("throws when the file is missing", async () => {
    await expect(
      openAttachment(new MemoryStorage(), { name: "a", path: "x/a", size: 1, type: "", addedAt: "" }),
    ).rejects.toThrow();
  });
});
