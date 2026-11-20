export const PHOTO_MAX_SIZE = 800;
export const EVIDENCE_MAX_SIZE = 1600;
export const PHOTO_ERROR = "No se pudo procesar la foto.";

/** Resizes an image so its longest side is at most `maxSize` px and encodes it as JPEG. */
export async function compressPhoto(file: Blob, maxSize = PHOTO_MAX_SIZE): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("no blob");
    return blob;
  } catch {
    throw new Error(PHOTO_ERROR);
  }
}
