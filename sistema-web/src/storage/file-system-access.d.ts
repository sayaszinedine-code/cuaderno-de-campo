// Minimal ambient types for File System Access API pieces missing from the TS DOM lib.
type FsPermissionMode = "read" | "readwrite";
type FsPermissionState = "granted" | "denied" | "prompt";

interface FileSystemHandle {
  queryPermission?(descriptor?: { mode?: FsPermissionMode }): Promise<FsPermissionState>;
  requestPermission?(descriptor?: { mode?: FsPermissionMode }): Promise<FsPermissionState>;
}

interface FileSystemFileHandle {
  /** Renames within the same directory, replacing an existing target. Not in every browser. */
  move?(newName: string): Promise<void>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: FsPermissionMode;
  startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
