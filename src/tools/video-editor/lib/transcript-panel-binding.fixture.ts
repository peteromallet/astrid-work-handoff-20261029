import {
  transcriptDocumentId,
  type ProjectTranscriptDocument,
  type ProjectTranscriptRepository,
} from '../data/typed/projectTranscript.ts';
import { vi } from 'vitest';
import { createTimelineStore } from '../hooks/timelineStore.ts';
import { buildTimelineData, type TimelineData } from './timeline-data.ts';
import { createTimelineViewStore } from './timeline-view-store.ts';
import { createTranscriptPanelHost } from './transcript-panel-host.ts';
import { bindTranscriptPanelVideo } from './transcript-panel-binding.ts';
import type { TimelineConfig } from '../types/index.ts';

export async function setupTranscriptHost() {
  const config: TimelineConfig = {
    output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
    tracks: [{ id: 'v', kind: 'visual', label: 'Video', muted: false }],
    clips: [
      { id: 'clip', asset: 'media', at: 0, from: 0, to: 10, track: 'v' },
      { id: 'repeat', asset: 'media', at: 20, from: 0, to: 10, track: 'v' },
      { id: 'sound', asset: 'audio', at: 0, from: 0, to: 10, track: 'v' },
      { id: 'picture', asset: 'image', at: 0, from: 0, to: 10, track: 'v' },
    ],
  };
  const data = await buildTimelineData(
    config,
    {
      assets: {
        media: {
          media_id: 'sha256:' + 'a'.repeat(64),
          file: 'Interview.mp4',
          type: 'video/mp4',
          duration: 10,
        },
        audio: {
          media_id: 'sha256:' + 'b'.repeat(64),
          file: 'Audio.wav',
          type: 'audio/wav',
          duration: 10,
        },
        image: { file: 'Photo.png', type: 'image/png' },
        unused: { file: 'Other.mp4', type: 'video/mp4', duration: 10 },
      },
    },
    (file) => file,
    1,
  );
  const store = createTimelineStore();
  const dataRef: { current: TimelineData | null } = { current: data };
  const commitData = vi.fn((next: TimelineData) => {
    dataRef.current = next;
    const current = store.getState().data;
    store.getState().syncDataSlice({ ...current, data: next, dataRef });
  });
  let allowed = true;
  const documents = new Map<string, ProjectTranscriptDocument>();
  const repository: ProjectTranscriptRepository = {
    projectId: 'fixture-project',
    listAll: async () => [...documents.values()],
    get: async (id) => {
      const d = documents.get(id);
      if (!d) throw Object.assign(new Error('missing'), { status: 404 });
      return structuredClone(d);
    },
    listForMedia: async (media) =>
      [...documents.values()].filter((d) => d.content.media_id === media),
    create: async (content) => {
      const id = await transcriptDocumentId(
        'fixture-project',
        content.media_id,
        content.source_id,
      );
      const d: ProjectTranscriptDocument = {
        document_id: id,
        project_id: 'fixture-project',
        kind: 'media.transcript',
        content,
        version: 1,
        created_at: 'now',
        updated_at: 'now',
      };
      documents.set(id, d);
      return structuredClone(d);
    },
    update: async (id, content, version) => {
      const old = documents.get(id)!;
      if (old.version !== version)
        throw Object.assign(new Error('conflict'), { status: 409 });
      const d = { ...old, content, version: version + 1 };
      documents.set(id, d);
      return structuredClone(d);
    },
  };
  const host = createTranscriptPanelHost({
    dataRef,
    commitData,
    repository,
    flushPendingSave: async () => undefined,
    editability: {
      check: () => ({ allowed }),
      checkTimeline: () => ({ allowed }),
    },
  });
  store.getState().syncDataSlice({ ...store.getState().data, data, dataRef });
  store
    .getState()
    .syncOpsSlice({ ...store.getState().ops, transcriptHost: host });
  const view = createTimelineViewStore();
  const seek = vi.fn();
  const video = bindTranscriptPanelVideo(store, { view, seek });
  return {
    store,
    view,
    seek,
    video,
    host,
    commitData,
    dataRef,
    lock: () => {
      allowed = false;
    },
  };
}
