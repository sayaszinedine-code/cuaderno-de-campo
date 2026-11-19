import { FsAccessStorage } from "./fs-access";

/** Origin-private file system backend; same logic as FsAccessStorage over a per-account OPFS subdirectory. */
export class OpfsStorage extends FsAccessStorage {
  override readonly kind = "opfs" as const;
  override readonly label = "Almacenamiento del navegador";

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
  }

  static async open(userId: string): Promise<OpfsStorage> {
    const root = await navigator.storage.getDirectory();
    return new OpfsStorage(await root.getDirectoryHandle(userId, { create: true }));
  }
}
