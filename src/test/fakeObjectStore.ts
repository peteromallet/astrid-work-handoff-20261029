/**
 * The one content-addressed object store the fake Runtime shares between `runtimeFixture`
 * (ingest, media import, location, GET/HEAD) and `createFakeRuntimeRouter` (the project object list).
 *
 * Keys are the object id, which is always the sha256 of the bytes (`sha256:<hex>`), exactly as the real
 * daemon mints them. The vitest defaults of the two fakes (constant and sequence ids) apply only when no
 * store is passed.
 */
export type FakeStoredObject = {
  projectId: string;
  bytes: Uint8Array;
  digest: string;
  mediaType: string;
  filename?: string;
};

export type FakeObjectStore = Map<string, FakeStoredObject>;

export async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Store bytes under their own digest. Re-storing identical bytes is a no-op that returns the existing record. */
export async function putContentAddressedObject(
  store: FakeObjectStore,
  input: { projectId: string; bytes: Uint8Array; mediaType: string; filename?: string },
): Promise<FakeStoredObject & { objectId: string }> {
  const digest = await sha256Digest(input.bytes);
  const existing = store.get(digest);
  if (existing) return { ...existing, objectId: digest };
  const object: FakeStoredObject = {
    projectId: input.projectId,
    bytes: input.bytes,
    digest,
    mediaType: input.mediaType,
    ...(input.filename ? { filename: input.filename } : {}),
  };
  store.set(digest, object);
  return { ...object, objectId: digest };
}
