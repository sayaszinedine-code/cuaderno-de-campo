import { FsAccessStorage } from "./fs-access";

/** Origin-private file system backend; same logic as FsAccessStorage over the OPFS root. */
export class OpfsStorage extends FsAccessStorage {
  override readonly kind = "opfs" as const;
  override readonly label = "Almacenamiento del navegador";

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
  }

  static async open(): Promise<OpfsStorage> {
    return new OpfsStorage(await navigator.storage.getDirectory());
  }
}
