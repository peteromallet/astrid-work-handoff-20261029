import type { PanelVideoAdapter } from '@/sdk/ui.ts';
import type { TimelineStoreApi } from '../hooks/timelineStore.ts';
import type { AssetRegistry } from '../types/index.ts';
import { createTranscriptPanelAdapter } from './transcript-panel-adapter.ts';
import { TRANSCRIPT_SCHEMA_REF } from '../data/typed/adaptTranscript.ts';
import { createEditorAssetSurface } from '@/tools/video-editor/runtime/editorAssetSurface.ts';
import { EMPTY_DATA_KIND_ITEMS } from '@/tools/video-editor/data-kinds/dataKindItems.ts';

const UNSUPPORTED = Object.freeze({
  supported: false,
  reason: 'Timeline is loading.',
  sources: Object.freeze([]),
});

/** Called once per existing host/store/video identity at the app panel boundary. */
export function bindTranscriptPanelVideo(
  store: TimelineStoreApi,
  video: PanelVideoAdapter,
  /** Registry of what the timeline plays, including media inside placed shots. */
  playedRegistry?: () => AssetRegistry | undefined,
): PanelVideoAdapter {
  const transcript = createTranscriptPanelAdapter({
    getData: () => store.getState().data.dataRef.current,
    getTransientItems: () => store.getState().dataKindItemsHost?.readTransient(TRANSCRIPT_SCHEMA_REF) ?? EMPTY_DATA_KIND_ITEMS,
    assets: createEditorAssetSurface(() => store.getState().data.dataRef.current, undefined, playedRegistry),
    subscribe: (listener) => {
      let host = store.getState().ops.transcriptHost;
      let stop = host?.subscribe(listener);
      const reader = store.getState().timelineReader;
      const stopReader = reader?.subscribe?.(listener);
      const unsubscribe = store.subscribe((next, previous) => {
        if (next.ops.transcriptHost !== host) {
          stop?.();
          host = next.ops.transcriptHost;
          stop = host?.subscribe(listener);
          listener();
        }
        if (!reader && next.data.data !== previous.data.data) listener();
      });
      const stopTransient = store.getState().dataKindItemsHost?.subscribe(listener);
      return {
        dispose: () => {
          unsubscribe();
          stopReader?.();
          stopTransient?.();
          stop?.();
        },
      };
    },
    video,
    project: {
      getTimelineLaneVisible: () =>
        store.getState().ops.transcriptHost?.getTimelineLaneVisible() ?? false,
      setTimelineLaneVisible: (visible) =>
        store.getState().ops.transcriptHost?.setTimelineLaneVisible(visible),
      stageTextDraft: (edit) =>
        store.getState().ops.transcriptHost?.stageTextDraft(edit) ?? {
          ok: false,
          code: 'timeline_unavailable',
          message: 'Timeline is loading.',
        },
      getProjectState: () =>
        store.getState().ops.transcriptHost?.getProjectState() ?? UNSUPPORTED,
      listProjectSources: async (assetId) =>
        store.getState().ops.transcriptHost?.listProjectSources(assetId, playedRegistry?.()) ?? [],
      selectProjectSource: async (input) => {
        const host = store.getState().ops.transcriptHost;
        if (!host) throw new Error('Timeline is loading.');
        return host.selectProjectSource(input);
      },
      promoteSource: async (input) => {
        const host = store.getState().ops.transcriptHost;
        if (!host) throw new Error('Timeline is loading.');
        return host.promoteSource(input);
      },
      undoSource: async (id) =>
        store.getState().ops.transcriptHost?.undoSource(id) ?? {
          ok: false,
          code: 'timeline_unavailable',
          message: 'Timeline is loading.',
        },
      redoSource: async (id) =>
        store.getState().ops.transcriptHost?.redoSource(id) ?? {
          ok: false,
          code: 'timeline_unavailable',
          message: 'Timeline is loading.',
        },
      resolveSourceConflict: async (id, choice) =>
        store
          .getState()
          .ops.transcriptHost?.resolveSourceConflict(id, choice) ?? {
          ok: false,
          code: 'timeline_unavailable',
          message: 'Timeline is loading.',
        },
      refreshSources: async () =>
        store.getState().ops.transcriptHost?.refreshSources(),
    },
    editText: (edit) =>
      store.getState().ops.transcriptHost?.editText(edit) ?? {
        ok: false,
        code: 'timeline_unavailable',
        message:
          'Wait for the timeline to finish loading before correcting text.',
      },
    importTranscript: (input) => {
      const host = store.getState().ops.transcriptHost;
      if (!host)
        throw Object.assign(
          new Error(
            'Wait for the timeline to finish loading before importing a transcript.',
          ),
          { code: 'timeline_not_loaded' },
        );
      return host.importTranscript(input);
    },
  });
  return { ...video, transcript };
}
