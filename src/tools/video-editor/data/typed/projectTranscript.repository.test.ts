import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocumentSurface } from '@/sdk/context.ts';
import { transcriptDocumentId, transcriptRepositoryFromDocuments, type ProjectTranscriptDocument } from './projectTranscript.ts';

const makeDocument = async (mediaId: string, sourceId: string): Promise<ProjectTranscriptDocument> => ({
  document_id: await transcriptDocumentId('project', mediaId, sourceId),
  project_id: 'project',
  kind: 'media.transcript',
  content: {
    schema: 'media.transcript/v1', media_id: mediaId, source_id: sourceId,
    segments: [{ id: sourceId, start: 0, end: 1, text: sourceId }],
  },
  version: 1,
  created_at: 'now',
  updated_at: 'now',
});

describe('project transcript document listing', () => {
  it('paginates the transcript kind and validates every document before returning it', async () => {
    const a = await makeDocument(`sha256:${'a'.repeat(64)}`, 'narration');
    const b = await makeDocument(`sha256:${'b'.repeat(64)}`, 'voice');
    const list = vi.fn(async (_kind: string, page?: { cursor?: string; limit?: number }) =>
      page?.cursor ? { items: [b], next_cursor: null } : { items: [a], next_cursor: 'next' });
    const documents = { list } as unknown as ProjectDocumentSurface;
    const repo = transcriptRepositoryFromDocuments(documents, 'project');
    expect(await repo.listAll()).toEqual([a, b]);
    expect(list.mock.calls).toEqual([
      ['media.transcript', { cursor: undefined, limit: 100 }],
      ['media.transcript', { cursor: 'next', limit: 100 }],
    ]);
    list.mockImplementationOnce(async () => ({ items: [{ ...a, document_id: 'wrong' }], next_cursor: null }));
    await expect(repo.listAll()).rejects.toThrow(/identity/);
  });
});
