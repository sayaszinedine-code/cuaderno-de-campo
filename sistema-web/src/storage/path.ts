/** Splits a relative "/" path into segments; rejects traversal and absolute paths. */
export function splitPath(path: string, allowEmpty = false): string[] {
  if (path.startsWith("/") || path.includes("\\")) throw new Error("Invalid path");
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) throw new Error("Invalid path");
  if (segments.length === 0 && !allowEmpty) throw new Error("Invalid path");
  return segments;
}

export async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}
