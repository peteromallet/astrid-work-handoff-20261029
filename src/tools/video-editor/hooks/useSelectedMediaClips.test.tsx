// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ editorData: {} as Record<string, unknown> }));

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineEditorData: () => mocks.editorData,
}));
vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useVideoEditorRuntime: () => ({ shots: { shots: [] } }),
}));

import { useSelectedMediaClips } from './useSelectedMediaClips.ts';
import { useTimelineClipsForAttachments } from './useTimelineClipsForAttachments.ts';

function setEditor(selected: string[]) {
  mocks.editorData = {
    data: { config: { pinnedShotGroups: [] } },
    selectedClipIds: new Set(selected),
    resolvedConfig: {
      registry: {
        img: { src: 'https://x.test/a.png', type: 'image/png' },
        scene: { src: 'https://x.test/scene.png', type: 'image/png' },
      },
      clips: [
        { id: 'image-clip', asset: 'img', track: 'V1', at: 0, from: 0, to: 2 },
        { id: 'scene-clip', asset: 'scene', clipType: 'haus.astrid.liveScene', track: 'V2', at: 0, from: 0, to: 2 },
      ],
    },
  };
}

describe('attachment clips', () => {
  beforeEach(() => setEditor(['image-clip', 'scene-clip']));

  it('attaches a real image clip but not a live-scene clip', () => {
    const { result } = renderHook(() => useSelectedMediaClips());
    expect(result.current.clips.map((c) => c.clipId)).toEqual(['image-clip']);
    expect(result.current.summary).toBe('attaching 1 image');
  });

  it('gives a live-scene-only selection no attachment', () => {
    setEditor(['scene-clip']);
    const { result } = renderHook(() => useSelectedMediaClips());
    expect(result.current.clips).toEqual([]);
    expect(result.current.summary).toBe('');
  });

  it('catalogs the image clip as media and the live-scene clip as non-media', () => {
    const { result } = renderHook(() => useTimelineClipsForAttachments());
    const byId = new Map(result.current.map((c) => [c.clipId, c]));
    expect(byId.get('image-clip')).toMatchObject({ mediaType: 'image', url: 'https://x.test/a.png' });
    expect(byId.get('image-clip')?.isNonMedia).toBeUndefined();
    expect(byId.get('scene-clip')?.isNonMedia).toBe(true);
  });
});
