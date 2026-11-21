import {
  blobToBytes,
  forEachChunk,
  crc32,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
} from "./manifest";

/** Random-access zip reader over a Blob: central directory first, then each entry streamed on demand. */
export interface ZipEntry {
  name: string;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const MAX_CD_BYTES = 64 * 1024 * 1024;
const COMPRESSED_CHUNK = 64 * 1024; // small, so a hostile deflate stream cannot balloon memory in one push
const STORED_CHUNK = 1024 * 1024;

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

/** Reads and validates the central directory. Throws on anything malformed, encrypted, zip64 or over the limits. */
export async function readCentralDirectory(file: Blob): Promise<ZipEntry[]> {
  if (file.size < 22) throw new Error("not a zip");
  const tailLen = Math.min(file.size, 22 + 65535);
  const tail = await blobToBytes(file.slice(file.size - tailLen));
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tv, i) === 0x06054b50 && i + 22 + u16(tv, i + 20) === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end of central directory");
  const count = u16(tv, eocd + 10);
  const cdSize = u32(tv, eocd + 12);
  const cdOffset = u32(tv, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw new Error("zip64 not supported");
  if (count > MAX_FILE_COUNT + 1) throw new Error("too many files");
  if (cdSize > MAX_CD_BYTES || cdOffset + cdSize > file.size)
    throw new Error("bad central directory");

  const cd = await blobToBytes(file.slice(cdOffset, cdOffset + cdSize));
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let pos = 0;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > cd.length || u32(v, pos) !== 0x02014b50)
      throw new Error("bad central entry");
    const flags = u16(v, pos + 8);
    const method = u16(v, pos + 10);
    const crc = u32(v, pos + 16);
    const compressedSize = u32(v, pos + 20);
    const size = u32(v, pos + 24);
    const nameLen = u16(v, pos + 28);
    const extraLen = u16(v, pos + 30);
    const commentLen = u16(v, pos + 32);
    const offset = u32(v, pos + 42);
    if (pos + 46 + nameLen + extraLen + commentLen > cd.length)
      throw new Error("bad central entry");
    if (flags & 1) throw new Error("encrypted");
    if (method !== 0 && method !== 8)
      throw new Error("unsupported compression");
    if (
      compressedSize === 0xffffffff ||
      size === 0xffffffff ||
      offset === 0xffffffff
    )
      throw new Error("zip64 not supported");
    if (method === 0 && compressedSize !== size)
      throw new Error("bad stored size");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      cd.subarray(pos + 46, pos + 46 + nameLen),
    );
    if (names.has(name)) throw new Error("duplicate entry");
    names.add(name);
    total += size;
    if (total > MAX_TOTAL_BYTES + MAX_CD_BYTES) throw new Error("too big");
    if (offset + 30 + compressedSize > file.size)
      throw new Error("entry out of range");
    entries.push({ name, method, crc, compressedSize, size, offset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Streams the decompressed bytes of one entry to `onChunk`, verifying declared size and CRC-32.
 * Throws (after possibly having emitted partial data) if anything does not match.
 */
export async function readEntry(
  file: Blob,
  entry: ZipEntry,
  onChunk: (chunk: Uint8Array) => Promise<void> | void,
): Promise<void> {
  const head = await blobToBytes(file.slice(entry.offset, entry.offset + 30));
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (head.length < 30 || u32(hv, 0) !== 0x04034b50)
    throw new Error("bad local header");
  const start = entry.offset + 30 + u16(hv, 26) + u16(hv, 28);
  const end = start + entry.compressedSize;
  if (end > file.size) throw new Error("entry out of range");

  let crc = 0;
  let produced = 0;
  const emit = async (chunk: Uint8Array) => {
    produced += chunk.length;
    if (produced > entry.size) throw new Error("entry larger than declared");
    crc = crc32(crc, chunk);
    await onChunk(chunk);
  };

  if (entry.method === 0) {
    await forEachChunk(
      file,
      STORED_CHUNK,
      (c) => (c.length ? emit(c) : undefined),
      start,
      end,
    );
  } else {
    const { Inflate } = await import("fflate");
    const out: Uint8Array[] = [];
    const inf = new Inflate((chunk) => {
      if (chunk.length) out.push(chunk);
    });
    await forEachChunk(
      file,
      COMPRESSED_CHUNK,
      async (c, last) => {
        inf.push(c, last);
        while (out.length) await emit(out.shift() as Uint8Array);
      },
      start,
      end,
    );
  }
  if (produced !== entry.size) throw new Error("size mismatch");
  if (crc !== entry.crc) throw new Error("crc mismatch");
}
