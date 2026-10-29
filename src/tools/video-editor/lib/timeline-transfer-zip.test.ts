import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  __zipTestUtils,
  readStoredZip,
  verifyStoredZipEntry,
  writeStoredZip,
  type StoredZipEntrySource,
} from "./timeline-transfer-zip";

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function makeZip(entries: StoredZipEntrySource[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const destination = new WritableStream<Uint8Array>({ write(chunk) { chunks.push(chunk.slice()); } });
  await writeStoredZip(entries, destination);
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function entry(name: string, text: string): StoredZipEntrySource {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, stream: () => byteStream(bytes) };
}

function blobFromBytes(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes);
  return new Blob([copy.buffer]);
}

describe("stored ZIP64 timeline transport", () => {
  it("streams stored entries and returns File.slice-backed blobs with CRC metadata", async () => {
    const source = [entry("manifest.json", "{\"format\":\"astrid.timeline/1\"}"), entry(`media/${"a".repeat(64)}`, "media payload")];
    const archive = await makeZip(source);
    const file = blobFromBytes(archive);
    const entries = await readStoredZip(file);

    expect(entries.map(({ name, size }) => ({ name, size }))).toEqual([
      { name: "manifest.json", size: 30 },
      { name: `media/${"a".repeat(64)}`, size: 13 },
    ]);
    expect(await entries[0]!.blob.text()).toBe("{\"format\":\"astrid.timeline/1\"}");
    expect(await entries[1]!.blob.text()).toBe("media payload");
    await expect(verifyStoredZipEntry(entries[0]!)).resolves.toBeUndefined();
    await expect(verifyStoredZipEntry(entries[1]!)).resolves.toBeUndefined();
    const corrupted = { ...entries[1]!, blob: blobFromBytes(new TextEncoder().encode("media change")) };
    await expect(verifyStoredZipEntry(corrupted)).rejects.toThrow("failed CRC validation");
    expect(entries[1]!.blob.size).toBe(entries[1]!.size);
  });

  it("reads Python zipfile stored output with a force_zip64 local header", async () => {
    const base64 = "UEsDBC0AAAAAAAAAIQCu5Zek//////////8NABQAbWFuaWZlc3QuanNvbgEAEAAeAAAAAAAAAB4AAAAAAAAAeyJmb3JtYXQiOiJhc3RyaWQudGltZWxpbmUvMSJ9UEsDBBQAAAAAAENrWl3JBhckDAAAAAwAAABGAAAAbWVkaWEvYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYXNhbXBsZS1tZWRpYVBLAQItAy0AAAAAAAAAIQCu5ZekHgAAAB4AAAANAAAAAAAAAAAAAACAAQAAAABtYW5pZmVzdC5qc29uUEsBAhQDFAAAAAAAQ2taXckGFyQMAAAADAAAAEYAAAAAAAAAAAAAAIABXQAAAG1lZGlhL2FhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFQSwUGAAAAAAIAAgCvAAAAzQAAAAAA";
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const entries = await readStoredZip(blobFromBytes(bytes));

    expect(await entries[0]!.blob.text()).toBe("{\"format\":\"astrid.timeline/1\"}");
    expect(await entries[1]!.blob.text()).toBe("sample-media");
    expect(entries[0]!.size).toBe(30);
    expect(entries[1]!.size).toBe(12);
    await expect(verifyStoredZipEntry(entries[0]!)).resolves.toBeUndefined();
    await expect(verifyStoredZipEntry(entries[1]!)).resolves.toBeUndefined();
  });

  it("writes an archive accepted by Python zipfile, including Unicode names", async () => {
    const archive = await makeZip([
      entry("manifest.json", "{\"format\":\"astrid.timeline/1\"}"),
      entry("transcripts/媒体.source.json", "{\"text\":\"hello\"}"),
    ]);
    const directory = await mkdtemp(join(tmpdir(), "astrid-zip64-test-"));
    const archivePath = join(directory, "timeline.astrid");
    try {
      await writeFile(archivePath, archive);
      const result = execFileSync("python3", ["-c", [
        "import json,sys,zipfile",
        "z=zipfile.ZipFile(sys.argv[1])",
        "assert z.testzip() is None",
        "assert z.namelist()==['manifest.json','transcripts/媒体.source.json']",
        "assert json.loads(z.read('manifest.json'))['format']=='astrid.timeline/1'",
        "assert z.read('transcripts/媒体.source.json')==b'{\\\"text\\\":\\\"hello\\\"}'",
      ].join(";"), archivePath], { encoding: "utf8" });
      expect(result.trim()).toBe("");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsafe and duplicate names before writing", async () => {
    const destination = new WritableStream<Uint8Array>();
    await expect(writeStoredZip([entry("../manifest.json", "x")], destination)).rejects.toThrow("Unsafe ZIP entry name");
    await expect(writeStoredZip([entry("same", "a"), entry("same", "b")], destination)).rejects.toThrow("Duplicate ZIP entry name");
  });

  it("rejects mismatched entry sizes and unsupported compression", async () => {
    await expect(makeZip([{ name: "x", size: 2, stream: () => byteStream(new Uint8Array([1])) }])).rejects.toThrow("size did not match");
    const archive = await makeZip([entry("x", "payload")]);
    const damaged = archive.slice();
    const centralAt = damaged.findIndex((byte, index) => byte === 0x50 && damaged[index + 1] === 0x4b && damaged[index + 2] === 0x01 && damaged[index + 3] === 0x02);
    expect(centralAt).toBeGreaterThan(0);
    new DataView(damaged.buffer).setUint16(centralAt + 10, 8, true);
      await expect(readStoredZip(blobFromBytes(damaged))).rejects.toThrow("Only stored ZIP entries are supported");
  });

  it("cancels a live entry source when the destination rejects a write", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelled = true; },
    });
    let writeCount = 0;
    const destination = new WritableStream<Uint8Array>({ write() { if (++writeCount > 1) throw new Error("disk full"); } });
    await expect(writeStoredZip([{ name: "media/x", size: 1, stream: () => source }], destination)).rejects.toThrow("disk full");
    expect(cancelled).toBe(true);
  });

  it("encodes ZIP64 offsets and sizes beyond 4 GiB without allocating that payload", () => {
    const offset = 5n * 1024n * 1024n * 1024n;
    const descriptor = __zipTestUtils.dataDescriptor(0x12345678, offset);
    const view = new DataView(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
    expect(view.getBigUint64(8, true)).toBe(offset);
    expect(view.getBigUint64(16, true)).toBe(offset);

    const end = __zipTestUtils.zip64End(1, offset, offset + 123n);
    const endView = new DataView(end.buffer, end.byteOffset, end.byteLength);
    expect(endView.getBigUint64(40, true)).toBe(offset);
    expect(endView.getBigUint64(48, true)).toBe(offset + 123n);
    expect(__zipTestUtils.crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("uses File.slice offsets above 4 GiB with a sparse ZIP64 fixture", async () => {
    const payload = new TextEncoder().encode("sparse");
    const nameBytes = new TextEncoder().encode("manifest.json");
    const name = "manifest.json";
    const localOffset = 5 * 1024 * 1024 * 1024;
    const local = __zipTestUtils.localHeader(nameBytes);
    const crc = __zipTestUtils.crc32(payload);
    const descriptor = __zipTestUtils.dataDescriptor(crc, BigInt(payload.length));
    const centralOffset = localOffset + local.length + payload.length + descriptor.length;
    const central = __zipTestUtils.centralHeader({
      name,
      nameBytes,
      flags: 0x0808,
      crc32: crc,
      size: payload.length,
      localOffset,
    });
    const zip64EndOffset = centralOffset + central.length;
    const zip64End = __zipTestUtils.zip64End(1, BigInt(central.length), BigInt(centralOffset));
    const locator = __zipTestUtils.zip64Locator(BigInt(zip64EndOffset));
    const classic = new Uint8Array(22);
    const classicView = new DataView(classic.buffer);
    classicView.setUint32(0, 0x06054b50, true);
    classicView.setUint16(4, 0, true);
    classicView.setUint16(6, 0, true);
    classicView.setUint16(8, 0xffff, true);
    classicView.setUint16(10, 0xffff, true);
    classicView.setUint32(12, 0xffffffff, true);
    classicView.setUint32(16, 0xffffffff, true);
    const segments = [
      { offset: localOffset, bytes: local },
      { offset: localOffset + local.length, bytes: payload },
      { offset: localOffset + local.length + payload.length, bytes: descriptor },
      { offset: centralOffset, bytes: central },
      { offset: zip64EndOffset, bytes: zip64End },
      { offset: zip64EndOffset + zip64End.length, bytes: locator },
      { offset: zip64EndOffset + zip64End.length + locator.length, bytes: classic },
    ];
    const fileSize = zip64EndOffset + zip64End.length + locator.length + classic.length;
    const sparseFile = {
      size: fileSize,
      slice(start = 0, end = fileSize) {
        const length = end - start;
        return {
          size: length,
          async arrayBuffer() {
            const result = new Uint8Array(length);
            for (const segment of segments) {
              const overlapStart = Math.max(start, segment.offset);
              const overlapEnd = Math.min(end, segment.offset + segment.bytes.length);
              if (overlapStart < overlapEnd) {
                result.set(segment.bytes.subarray(overlapStart - segment.offset, overlapEnd - segment.offset), overlapStart - start);
              }
            }
            return result.buffer;
          },
        };
      },
    } as Blob;

    const [parsed] = await readStoredZip(sparseFile);
    expect(parsed?.name).toBe("manifest.json");
    expect(parsed?.size).toBe(payload.length);
    expect(parsed?.blob.size).toBe(payload.length);
    expect(parsed?.blob).toBeDefined();
  });
});
