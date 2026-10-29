import { describe, expect, it, vi } from 'vitest';
import { LIBRARY_KIND, libraryDocumentId, loadLibrary, updateLibrary } from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/library';
import { upsertEntry, worldKey, type LibraryEntry } from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/model';
import { fakeDocuments, type FakeDocuments } from './world_explorer_documents';

function entry(objectId: string, revision = 'r1', name = objectId): LibraryEntry {
  return { objectId, revision, name, duration: 4, authoredFps: 24, events: [], shots: [] };
}

const stored = (fake: FakeDocuments, projectId = 'p1') => fake.docs.get(libraryDocumentId(projectId));

describe('library document', () => {
  it('loadLibrary is empty when the project has no library document yet', async () => {
    const fake = fakeDocuments();
    await expect(loadLibrary(fake, 'p1')).resolves.toEqual([]);
    expect(fake.docs.size).toBe(0);
  });

  it('loadLibrary reads the stored worlds', async () => {
    const fake = fakeDocuments({ library: [entry('A'), entry('B')] });
    expect((await loadLibrary(fake, 'p1')).map(worldKey)).toEqual(['A@r1', 'B@r1']);
  });

  it('updateLibrary creates the document under the library kind and id, then updates it with the version it read', async () => {
    const fake = fakeDocuments();
    const create = vi.spyOn(fake, 'create');
    const update = vi.spyOn(fake, 'update');

    const first = await updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('A')));
    expect(first.map(worldKey)).toEqual(['A@r1']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(LIBRARY_KIND, { version: 1, worlds: [entry('A')] }, libraryDocumentId('p1'));
    expect(update).not.toHaveBeenCalled();
    expect(stored(fake)).toMatchObject({ kind: LIBRARY_KIND, version: 1 });

    await updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('B')));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(libraryDocumentId('p1'), { version: 1, worlds: [entry('A'), entry('B')] }, 1);
    expect(stored(fake)).toMatchObject({ version: 2 });
    expect((await loadLibrary(fake, 'p1')).map(worldKey)).toEqual(['A@r1', 'B@r1']);
  });

  it('two projects keep separate documents', async () => {
    const fake = fakeDocuments();
    await updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('A')));
    await updateLibrary(fake, 'p2', (list) => upsertEntry(list, entry('B')));
    expect(fake.docs.has(libraryDocumentId('p1'))).toBe(true);
    expect(fake.docs.has(libraryDocumentId('p2'))).toBe(true);
    expect((await loadLibrary(fake, 'p1')).map(worldKey)).toEqual(['A@r1']);
    expect((await loadLibrary(fake, 'p2')).map(worldKey)).toEqual(['B@r1']);
  });

  it('a 409 is retried on the newer list, so both writers entries survive', async () => {
    const fake = fakeDocuments({ library: [entry('A')] });
    const realUpdate = fake.update.bind(fake);
    let concurrent = true;
    const update = vi.spyOn(fake, 'update').mockImplementation(async (id, content, expectedVersion) => {
      if (concurrent) {
        concurrent = false;
        // Another viewer adds C after this one read the document; the stale update below then gets a 409.
        fake.externalWrite(id, { version: 1, worlds: [entry('A'), entry('C')] });
      }
      return realUpdate(id, content, expectedVersion);
    });

    const saved = await updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('B')));

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][2]).toBe(1);
    expect(update.mock.calls[1][2]).toBe(2);
    expect(saved.map(worldKey)).toEqual(['A@r1', 'C@r1', 'B@r1']);
    expect((await loadLibrary(fake, 'p1')).map(worldKey)).toEqual(['A@r1', 'C@r1', 'B@r1']);
  });

  it('gives up and throws after four consecutive 409s', async () => {
    const fake = fakeDocuments({ library: [entry('A')] });
    const update = vi.spyOn(fake, 'update').mockRejectedValue(Object.assign(new Error('stale'), { status: 409 }));
    await expect(updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('B')))).rejects.toMatchObject({ status: 409 });
    expect(update).toHaveBeenCalledTimes(4);
  });

  it('rethrows a non-409 error without retrying', async () => {
    const fake = fakeDocuments({ library: [entry('A')] });
    const update = vi.spyOn(fake, 'update').mockRejectedValue(Object.assign(new Error('server down'), { status: 500 }));
    await expect(updateLibrary(fake, 'p1', (list) => upsertEntry(list, entry('B')))).rejects.toThrow('server down');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('an unchanged change performs no write', async () => {
    const fake = fakeDocuments({ library: [entry('A')] });
    const create = vi.spyOn(fake, 'create');
    const update = vi.spyOn(fake, 'update');
    const result = await updateLibrary(fake, 'p1', (list) => list);
    expect(result.map(worldKey)).toEqual(['A@r1']);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(stored(fake)).toMatchObject({ version: 1 });
  });

  it('writes nothing when the change leaves the stored content the same, whatever its key order or invalid extras', async () => {
    const fake = fakeDocuments({ library: [{ ...entry('A'), events: [{ start: 1, name: 'hit' }], shots: [{ end: 1, start: 0, name: 'bad-order' }, { name: 'dropped', start: 2, end: 1 }] }] });
    const update = vi.spyOn(fake, 'update');
    const create = vi.spyOn(fake, 'create');
    const reordered = { ...entry('A'), events: [{ name: 'hit', start: 1 }], shots: [{ name: 'bad-order', start: 0, end: 1 }] };
    await updateLibrary(fake, 'p1', (list) => upsertEntry(list, reordered));
    await updateLibrary(fake, 'p1', (list) => list.map((e) => ({ ...e, shots: [...e.shots, { name: 'dropped', start: 2, end: 1 }] })));
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(stored(fake)).toMatchObject({ version: 1 });
  });
});
