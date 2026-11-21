import type { Storage } from "@/storage/types";

/** Photos printed per record at most. */
export const MAX_PHOTOS = 4;

export type PdfPhoto = { src: string };

/** The PDF renderer only embeds JPEG and PNG; the format is read from the file content, not its name. */
function mimeOf(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/**
 * Reads the evidence photos of a record, in order, until `max` usable ones are loaded (later files are not
 * read). Missing, unreadable and non-JPEG/PNG files are skipped and counted.
 */
export async function loadPhotos(
  storage: Pick<Storage, "readFile">,
  paths: readonly string[],
  max = MAX_PHOTOS,
): Promise<{ photos: PdfPhoto[]; skipped: number }> {
  const photos: PdfPhoto[] = [];
  let skipped = 0;
  for (const path of paths) {
    if (photos.length >= max) break;
    try {
      const blob = await storage.readFile(path);
      const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      const mime = bytes ? mimeOf(bytes) : null;
      if (!bytes || !mime) {
        skipped++;
        continue;
      }
      photos.push({ src: `data:${mime};base64,${toBase64(bytes)}` });
    } catch {
      skipped++;
    }
  }
  return { photos, skipped };
}
