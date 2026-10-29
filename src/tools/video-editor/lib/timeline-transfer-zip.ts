const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const STREAM_CHUNK_BYTES = 1024 * 1024;

export type StoredZipEntrySource = {
  name: string;
  size: number;
  stream: () => ReadableStream<Uint8Array>;
};

export type StoredZipProgress = (progress: {
  entry: string;
  entryBytes: number;
  entrySize: number;
  totalBytes: number;
  totalSize: number;
}) => void;

export type StoredZipEntry = {
  name: string;
  size: number;
  crc32: number;
  blob: Blob;
};

type CentralRecord = {
  name: string;
  nameBytes: Uint8Array;
  flags: number;
  crc32: number;
  size: number;
  localOffset: number;
};

const utf8 = new TextEncoder();
const utf8Fatal = new TextDecoder("utf-8", { fatal: true });

function assertSafeName(name: string): void {
  if (!name || name.startsWith("/") || name.startsWith("\\") || name.includes("\\") || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
  const segments = name.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
  if (name.includes("\0")) throw new Error("ZIP entry names cannot contain NUL");
}

function set16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function set32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function set64(view: DataView, offset: number, value: bigint): void {
  view.setBigUint64(offset, value, true);
}

function get16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function get32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function get64(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}

function asSafeNumber(value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the supported safe file size`);
  }
  return Number(value);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let result = crc;
  for (const byte of bytes) result = CRC_TABLE[(result ^ byte) & 0xff]! ^ (result >>> 8);
  return result >>> 0;
}

function crc32(bytes: Uint8Array): number {
  return (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}

function localHeader(name: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(30 + 20 + name.length);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x04034b50);
  set16(view, 4, 45);
  set16(view, 6, 0x0808); // UTF-8 names and data descriptor follows.
  set16(view, 8, 0); // Stored.
  set16(view, 10, 0); // DOS time.
  set16(view, 12, 0x0021); // DOS date: 1980-01-01.
  set32(view, 14, 0);
  set32(view, 18, U32_MAX);
  set32(view, 22, U32_MAX);
  set16(view, 26, name.length);
  set16(view, 28, 20);
  bytes.set(name, 30);
  set16(view, 30 + name.length, 0x0001);
  set16(view, 32 + name.length, 16);
  return bytes;
}

function dataDescriptor(crc: number, size: bigint): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x08074b50);
  set32(view, 4, crc);
  set64(view, 8, size);
  set64(view, 16, size);
  return bytes;
}

function centralHeader(record: CentralRecord): Uint8Array {
  const bytes = new Uint8Array(46 + record.nameBytes.length + 28);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x02014b50);
  set16(view, 4, 45);
  set16(view, 6, 45);
  set16(view, 8, record.flags);
  set16(view, 10, 0);
  set16(view, 12, 0);
  set16(view, 14, 0x0021);
  set32(view, 16, record.crc32);
  set32(view, 20, U32_MAX);
  set32(view, 24, U32_MAX);
  set16(view, 28, record.nameBytes.length);
  set16(view, 30, 28);
  set16(view, 32, 0);
  set16(view, 34, 0);
  set16(view, 36, 0);
  set32(view, 38, 0);
  set32(view, 42, U32_MAX);
  bytes.set(record.nameBytes, 46);
  const extraAt = 46 + record.nameBytes.length;
  set16(view, extraAt, 0x0001);
  set16(view, extraAt + 2, 24);
  set64(view, extraAt + 4, BigInt(record.size));
  set64(view, extraAt + 12, BigInt(record.size));
  set64(view, extraAt + 20, BigInt(record.localOffset));
  return bytes;
}

function zip64End(count: number, directorySize: bigint, directoryOffset: bigint): Uint8Array {
  const bytes = new Uint8Array(56);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x06064b50);
  set64(view, 4, 44n);
  set16(view, 12, 45);
  set16(view, 14, 45);
  set32(view, 16, 0);
  set32(view, 20, 0);
  set64(view, 24, BigInt(count));
  set64(view, 32, BigInt(count));
  set64(view, 40, directorySize);
  set64(view, 48, directoryOffset);
  return bytes;
}

function zip64Locator(endOffset: bigint): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x07064b50);
  set32(view, 4, 0);
  set64(view, 8, endOffset);
  set32(view, 16, 1);
  return bytes;
}

function classicEnd(): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x06054b50);
  set16(view, 4, 0);
  set16(view, 6, 0);
  set16(view, 8, U16_MAX);
  set16(view, 10, U16_MAX);
  set32(view, 12, U32_MAX);
  set32(view, 16, U32_MAX);
  set16(view, 20, 0);
  return bytes;
}

function assertWritable(value: unknown): asserts value is WritableStream<Uint8Array> {
  if (!value || typeof (value as WritableStream<Uint8Array>).getWriter !== "function") {
    throw new TypeError("destination must be a WritableStream");
  }
}

export async function writeStoredZip(
  entries: StoredZipEntrySource[],
  destination: WritableStream<Uint8Array>,
  onProgress?: StoredZipProgress,
): Promise<void> {
  assertWritable(destination);
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error("Invalid or excessive ZIP entry list");
  const names = new Set<string>();
  let totalSize = 0;
  let directorySizeEstimate = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.stream !== "function") {
      throw new Error("Each ZIP entry requires a name, safe non-negative size, and stream factory");
    }
    assertSafeName(entry.name);
    const nameByteLength = utf8.encode(entry.name).byteLength;
    if (nameByteLength > U16_MAX) throw new Error(`ZIP entry name is too long: ${entry.name}`);
    directorySizeEstimate += 74 + nameByteLength;
    if (directorySizeEstimate > MAX_DIRECTORY_BYTES) throw new Error("ZIP central directory exceeds 64 MiB");
    if (names.has(entry.name)) throw new Error(`Duplicate ZIP entry name: ${entry.name}`);
    names.add(entry.name);
    totalSize += entry.size;
    if (!Number.isSafeInteger(totalSize)) throw new Error("Total ZIP content exceeds the supported safe size");
  }

  const writer = destination.getWriter();
  const records: CentralRecord[] = [];
  let offset = 0n;
  let completedBytes = 0;
  const write = async (bytes: Uint8Array) => {
    await writer.write(bytes);
    offset += BigInt(bytes.byteLength);
  };

  try {
    for (const entry of entries) {
      const nameBytes = utf8.encode(entry.name);
      if (nameBytes.length > U16_MAX) throw new Error(`ZIP entry name is too long: ${entry.name}`);
      const localOffset = asSafeNumber(offset, "ZIP offset");
      await write(localHeader(nameBytes));
      let actualSize = 0;
      let crc = 0xffffffff;
      const reader = entry.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (Object.prototype.toString.call(value) !== "[object Uint8Array]") throw new Error(`ZIP entry stream yielded a non-byte chunk: ${entry.name}`);
          const bytes = value as Uint8Array;
          for (let start = 0; start < bytes.byteLength; start += STREAM_CHUNK_BYTES) {
            const chunk = bytes.subarray(start, Math.min(start + STREAM_CHUNK_BYTES, bytes.byteLength));
            actualSize += chunk.byteLength;
            if (actualSize > entry.size) throw new Error(`ZIP entry exceeded its declared size: ${entry.name}`);
            crc = updateCrc32(crc, chunk);
            await write(chunk);
            onProgress?.({ entry: entry.name, entryBytes: actualSize, entrySize: entry.size, totalBytes: completedBytes + actualSize, totalSize });
          }
        }
      } catch (error) {
        try { await reader.cancel(error); } catch { /* Preserve the write or source error. */ }
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (actualSize !== entry.size) throw new Error(`ZIP entry size did not match its declaration: ${entry.name}`);
      const finalCrc = (crc ^ 0xffffffff) >>> 0;
      await write(dataDescriptor(finalCrc, BigInt(actualSize)));
      records.push({ name: entry.name, nameBytes, flags: 0x0808, crc32: finalCrc, size: actualSize, localOffset });
      completedBytes += actualSize;
    }

    const directoryOffset = offset;
    for (const record of records) await write(centralHeader(record));
    const directorySize = offset - directoryOffset;
    const endOffset = offset;
    await write(zip64End(records.length, directorySize, directoryOffset));
    await write(zip64Locator(endOffset));
    await write(classicEnd());
    asSafeNumber(offset, "ZIP archive size");
    await writer.close();
  } catch (error) {
    try { await writer.abort(error); } catch { /* Keep the original error. */ }
    throw error;
  } finally {
    writer.releaseLock();
  }
}

function findSignature(bytes: Uint8Array, signature: number, from: number, to: number): number {
  for (let at = from; at >= to; at -= 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, 4);
    if (get32(view, 0) === signature) return at;
  }
  return -1;
}

async function readRange(file: Blob, start: number, length: number, label: string): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || !Number.isSafeInteger(start + length) || start < 0 || length < 0 || start + length > file.size) {
    throw new Error(`${label} is outside the ZIP file bounds`);
  }
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

function readZip64Extra(extra: Uint8Array, needUncompressed: boolean, needCompressed: boolean, needOffset: boolean, needDisk: boolean): { uncompressed?: bigint; compressed?: bigint; offset?: bigint; disk?: number } {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = get16(view, cursor);
    const size = get16(view, cursor + 2);
    cursor += 4;
    if (cursor + size > extra.length) throw new Error("Malformed ZIP extra field");
    if (id === 0x0001) {
      let at = cursor;
      const end = cursor + size;
      const result: { uncompressed?: bigint; compressed?: bigint; offset?: bigint; disk?: number } = {};
      if (needUncompressed) { if (at + 8 > end) throw new Error("Missing ZIP64 uncompressed size"); result.uncompressed = get64(view, at); at += 8; }
      if (needCompressed) { if (at + 8 > end) throw new Error("Missing ZIP64 compressed size"); result.compressed = get64(view, at); at += 8; }
      if (needOffset) { if (at + 8 > end) throw new Error("Missing ZIP64 local offset"); result.offset = get64(view, at); at += 8; }
      if (needDisk) { if (at + 4 > end) throw new Error("Missing ZIP64 disk number"); result.disk = get32(view, at); }
      return result;
    }
    cursor += size;
  }
  if (cursor !== extra.length) throw new Error("Malformed ZIP extra field padding");
  if (needUncompressed || needCompressed || needOffset || needDisk) throw new Error("Missing ZIP64 metadata");
  return {};
}

function assertSafeEntryName(name: string): void {
  assertSafeName(name);
}

async function readDirectory(file: Blob): Promise<{ records: CentralRecord[]; directoryOffset: number; directorySize: number }> {
  if (!Number.isSafeInteger(file.size)) throw new Error("ZIP file size exceeds the supported safe integer range");
  if (file.size < 22) throw new Error("This file isn't an Astrid timeline, or it's damaged.");
  const tailLength = Math.min(file.size, 22 + U16_MAX);
  const tailStart = file.size - tailLength;
  const tail = await readRange(file, tailStart, tailLength, "ZIP end records");
  const eocdAt = findSignature(tail, 0x06054b50, tail.length - 22, Math.max(0, tail.length - 22 - U16_MAX));
  if (eocdAt < 0) throw new Error("This file isn't an Astrid timeline, or it's damaged.");
  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdAt, tail.length - eocdAt);
  const commentLength = get16(eocd, 20);
  if (eocdAt + 22 + commentLength !== tail.length) throw new Error("Malformed ZIP end comment bounds");
  const disk = get16(eocd, 4);
  const directoryDisk = get16(eocd, 6);
  const entriesOnDisk = get16(eocd, 8);
  const entryCount16 = get16(eocd, 10);
  const directorySize32 = get32(eocd, 12);
  const directoryOffset32 = get32(eocd, 16);
  if (disk !== 0 || directoryDisk !== 0 || (entriesOnDisk !== U16_MAX && entryCount16 !== U16_MAX && entriesOnDisk !== entryCount16)) {
    throw new Error("Multi-disk ZIP archives are unsupported");
  }

  let entryCount = entryCount16;
  let directorySize = directorySize32;
  let directoryOffset = directoryOffset32;
  const zip64Needed = entryCount16 === U16_MAX || entriesOnDisk === U16_MAX || directorySize32 === U32_MAX || directoryOffset32 === U32_MAX;
  if (zip64Needed) {
    const locatorAbsolute = tailStart + eocdAt - 20;
    const locatorBytes = await readRange(file, locatorAbsolute, 20, "ZIP64 locator");
    const locator = new DataView(locatorBytes.buffer, locatorBytes.byteOffset, locatorBytes.byteLength);
    if (get32(locator, 0) !== 0x07064b50 || get32(locator, 4) !== 0 || get32(locator, 16) !== 1) throw new Error("Invalid ZIP64 locator or multi-disk archive");
    const end64Offset = asSafeNumber(get64(locator, 8), "ZIP64 end offset");
    const endBytes = await readRange(file, end64Offset, 56, "ZIP64 end record");
    const end = new DataView(endBytes.buffer, endBytes.byteOffset, endBytes.byteLength);
    if (get32(end, 0) !== 0x06064b50 || get64(end, 4) < 44n || get32(end, 16) !== 0 || get32(end, 20) !== 0) throw new Error("Invalid ZIP64 end record");
    const entriesOnDisk64 = get64(end, 24);
    const entries64 = get64(end, 32);
    if (entriesOnDisk64 !== entries64) throw new Error("Multi-disk ZIP archives are unsupported");
    entryCount = asSafeNumber(entries64, "ZIP entry count");
    directorySize = asSafeNumber(get64(end, 40), "ZIP directory size");
    directoryOffset = asSafeNumber(get64(end, 48), "ZIP directory offset");
    if (BigInt(end64Offset) + 56n !== BigInt(locatorAbsolute)) throw new Error("ZIP64 end record does not meet its locator");
  }
  if (entryCount > MAX_ENTRIES) throw new Error("ZIP contains too many entries");
  if (directorySize > MAX_DIRECTORY_BYTES) throw new Error("ZIP central directory exceeds 64 MiB");
  if (directoryOffset + directorySize > file.size || directoryOffset + directorySize > tailStart + eocdAt) throw new Error("ZIP central directory is outside the file bounds");
  const bytes = await readRange(file, directoryOffset, directorySize, "ZIP central directory");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: CentralRecord[] = [];
  const names = new Set<string>();
  let cursor = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || get32(view, cursor) !== 0x02014b50) throw new Error("Malformed ZIP central directory entry");
    const flags = get16(view, cursor + 8);
    const method = get16(view, cursor + 10);
    if (flags & ~0x0808) throw new Error("Unsupported ZIP entry flags");
    if (method !== 0) throw new Error("Only stored ZIP entries are supported");
    const crc = get32(view, cursor + 16);
    const size32 = get32(view, cursor + 20);
    const compressed32 = get32(view, cursor + 24);
    const nameLength = get16(view, cursor + 28);
    const extraLength = get16(view, cursor + 30);
    const commentLengthInEntry = get16(view, cursor + 32);
    const diskStart16 = get16(view, cursor + 34);
    const localOffset32 = get32(view, cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLengthInEntry;
    if (end > bytes.length) throw new Error("ZIP central directory entry exceeds its bounds");
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    let name: string;
    try { name = (flags & 0x0800) ? utf8Fatal.decode(nameBytes) : utf8Fatal.decode(nameBytes); }
    catch { throw new Error("ZIP entry name is not valid UTF-8"); }
    assertSafeEntryName(name);
    if (names.has(name)) throw new Error(`Duplicate ZIP entry name: ${name}`);
    names.add(name);
    const extra = bytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    const zip64 = readZip64Extra(extra, size32 === U32_MAX, compressed32 === U32_MAX, localOffset32 === U32_MAX, diskStart16 === U16_MAX);
    const uncompressedSize = asSafeNumber(size32 === U32_MAX ? zip64.uncompressed! : BigInt(size32), `ZIP entry ${name} uncompressed size`);
    const compressedSize = asSafeNumber(compressed32 === U32_MAX ? zip64.compressed! : BigInt(compressed32), `ZIP entry ${name} compressed size`);
    const localOffset = asSafeNumber(localOffset32 === U32_MAX ? zip64.offset! : BigInt(localOffset32), `ZIP entry ${name} local offset`);
    const diskStart = diskStart16 === U16_MAX ? zip64.disk! : diskStart16;
    if (diskStart !== 0) throw new Error("Multi-disk ZIP entries are unsupported");
    if (uncompressedSize !== compressedSize) throw new Error(`Stored ZIP entry has mismatched sizes: ${name}`);
    records.push({ name, nameBytes, flags, crc32: crc, size: uncompressedSize, localOffset });
    cursor = end;
  }
  if (cursor !== bytes.length) throw new Error("Unexpected trailing bytes in ZIP central directory");
  return { records, directoryOffset, directorySize };
}

export async function readStoredZip(file: Blob): Promise<StoredZipEntry[]> {
  const { records, directoryOffset } = await readDirectory(file);
  const entries: StoredZipEntry[] = [];
  const intervals: Array<{ start: number; end: number; name: string }> = [];
  for (const record of records) {
    const localBytes = await readRange(file, record.localOffset, 30, `ZIP local header for ${record.name}`);
    const local = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (get32(local, 0) !== 0x04034b50) throw new Error(`Invalid ZIP local header for ${record.name}`);
    const flags = get16(local, 6);
    const method = get16(local, 8);
    if (flags & ~0x0808) throw new Error("Unsupported ZIP entry flags");
    if (flags !== record.flags) throw new Error(`ZIP local/central flags differ: ${record.name}`);
    if (method !== 0) throw new Error("Only stored ZIP entries are supported");
    const nameLength = get16(local, 26);
    const extraLength = get16(local, 28);
    const variable = await readRange(file, record.localOffset + 30, nameLength + extraLength, `ZIP local fields for ${record.name}`);
    const localName = variable.subarray(0, nameLength);
    if (localName.length !== record.nameBytes.length || localName.some((byte, index) => byte !== record.nameBytes[index])) {
      throw new Error(`ZIP local/central entry names differ: ${record.name}`);
    }
    const localExtra = variable.subarray(nameLength);
    const localSize32 = get32(local, 22);
    const localCompressed32 = get32(local, 18);
    const localZip64 = readZip64Extra(localExtra, localSize32 === U32_MAX, localCompressed32 === U32_MAX, false, false);
    const localSize = localSize32 === U32_MAX ? asSafeNumber(localZip64.uncompressed!, `ZIP local size for ${record.name}`) : localSize32;
    const localCompressed = localCompressed32 === U32_MAX ? asSafeNumber(localZip64.compressed!, `ZIP local compressed size for ${record.name}`) : localCompressed32;
    const hasDescriptor = Boolean(flags & 0x0008);
    if (!hasDescriptor && (localSize !== record.size || localCompressed !== record.size || get32(local, 14) !== record.crc32)) {
      throw new Error(`ZIP local/central metadata differs: ${record.name}`);
    }
    if (hasDescriptor && get32(local, 14) !== 0 && get32(local, 14) !== record.crc32) {
      throw new Error(`ZIP local/central CRC differs: ${record.name}`);
    }
    if (hasDescriptor && ((localSize !== 0 && localSize !== record.size) || (localCompressed !== 0 && localCompressed !== record.size))) {
      throw new Error(`ZIP local/central sizes differ: ${record.name}`);
    }
    const dataStart = record.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + record.size;
    if (!Number.isSafeInteger(dataStart) || !Number.isSafeInteger(dataEnd) || dataEnd > directoryOffset) throw new Error(`ZIP entry overlaps its central directory: ${record.name}`);
    let recordEnd = dataEnd;
    if (hasDescriptor) {
      const zip64Descriptor = localSize32 === U32_MAX || localCompressed32 === U32_MAX;
      const leading = await readRange(file, dataEnd, 4, `ZIP data descriptor for ${record.name}`);
      const hasSignature = get32(new DataView(leading.buffer, leading.byteOffset, leading.byteLength), 0) === 0x08074b50;
      const descriptorLength = (hasSignature ? 4 : 0) + 4 + (zip64Descriptor ? 16 : 8);
      const descriptor = await readRange(file, dataEnd, descriptorLength, `ZIP data descriptor for ${record.name}`);
      const descriptorView = new DataView(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
      const signatureOffset = hasSignature ? 4 : 0;
      if (get32(descriptorView, signatureOffset) !== record.crc32) throw new Error(`ZIP data descriptor CRC differs: ${record.name}`);
      const descriptorSize = zip64Descriptor ? get64(descriptorView, signatureOffset + 4) : BigInt(get32(descriptorView, signatureOffset + 4));
      const descriptorCompressed = zip64Descriptor ? get64(descriptorView, signatureOffset + 12) : BigInt(get32(descriptorView, signatureOffset + 8));
      if (descriptorSize !== BigInt(record.size) || descriptorCompressed !== BigInt(record.size)) {
        throw new Error(`ZIP data descriptor sizes differ: ${record.name}`);
      }
      recordEnd += descriptorLength;
      if (!Number.isSafeInteger(recordEnd) || recordEnd > directoryOffset) throw new Error(`ZIP descriptor overlaps its central directory: ${record.name}`);
    }
    intervals.push({ start: record.localOffset, end: recordEnd, name: record.name });
    entries.push({ name: record.name, size: record.size, crc32: record.crc32, blob: file.slice(dataStart, dataEnd, "application/octet-stream") });
  }
  intervals.sort((left, right) => left.start - right.start);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index]!.start < intervals[index - 1]!.end) throw new Error(`ZIP entries overlap: ${intervals[index - 1]!.name} and ${intervals[index]!.name}`);
  }
  return entries;
}

export async function verifyStoredZipEntry(entry: StoredZipEntry): Promise<void> {
  let crc = 0xffffffff;
  let size = 0;
  for (let offset = 0; offset < entry.blob.size; offset += STREAM_CHUNK_BYTES) {
    const chunk = new Uint8Array(await entry.blob.slice(offset, Math.min(offset + STREAM_CHUNK_BYTES, entry.blob.size)).arrayBuffer());
    crc = updateCrc32(crc, chunk);
    size += chunk.byteLength;
  }
  if (size !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error(`ZIP entry data failed CRC validation: ${entry.name}`);
}

export const __zipTestUtils = { crc32, zip64End, zip64Locator, centralHeader, localHeader, dataDescriptor };
