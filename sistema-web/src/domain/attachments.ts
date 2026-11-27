import { deliverFile } from "@/apk/saveFile";
import type { Storage } from "@/storage/types";
import { safeName } from "./paths";
import type { Attachment } from "./schema";

export const ATTACHMENT_EXTENSIONS = [
  ".doc", ".docx", ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".odp", ".ods", ".txt", ".jpg", ".jpeg", ".png",
] as const;
export const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024;

const extensionOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i).toLowerCase();
};

export function validateAttachment(file: File): string | null {
  if (!(ATTACHMENT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return "Ese tipo de archivo no está permitido.";
  }
  if (file.size > ATTACHMENT_MAX_SIZE) return "El archivo pesa más de 25 MB.";
  return null;
}

/** `safeName(original)`, numbered « (2)», « (3)»… before the extension when `existing` already has it (case-insensitive). */
export function attachmentName(existing: string[], original: string): string {
  const name = safeName(original);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Copies the file into `dir` unmodified, then returns its record. The chosen name is pushed into
 * `existingNames` synchronously (before any await) so concurrent saves cannot pick the same one;
 * it is released again if the write fails.
 */
export async function saveAttachment(
  storage: Storage,
  dir: string,
  file: File,
  existingNames: string[],
): Promise<Attachment> {
  const name = attachmentName(existingNames, file.name);
  existingNames.push(name);
  const path = `${dir}${name}`;
  try {
    await storage.writeFile(path, file);
  } catch (e) {
    const i = existingNames.lastIndexOf(name);
    if (i >= 0) existingNames.splice(i, 1);
    throw e;
  }
  return { name, path, size: file.size, type: file.type, addedAt: new Date().toISOString() };
}

/** Reads the file and hands it to the browser as a download; the object URL is revoked afterwards. */
export async function openAttachment(storage: Storage, a: Attachment): Promise<void> {
  const blob = await storage.readFile(a.path);
  if (!blob) throw new Error("Attachment not found");
  await deliverFile(blob, a.name);
}
