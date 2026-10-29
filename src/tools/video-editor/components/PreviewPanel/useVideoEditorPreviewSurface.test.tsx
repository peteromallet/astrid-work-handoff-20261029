// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { useVideoEditorPreviewSurface } from './useVideoEditorPreviewSurface.tsx';

const mocks = vi.hoisted(() => ({
  runtime: null as unknown,
  timeline: null as unknown,
  playback: null as unknown,
}));

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineDataSelector: (selector: (timeline: unknown) => unknown) => selector(mocks.timeline),
  useTimelinePlaybackSelector: (selector: (playback: unknown) => unknown) => selector(mocks.playback),
}));

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => mocks.runtime,
}));

vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({
  RemotionPreview: () => React.createElement('div'),
}));

function graphWithClipStart(atMs: number, head: string) {
  const graph = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  graph.primary_timeline.head.revision_id = head;
  graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a')!
    .internal_timeline_revision.timeline.clips[0]!.at_ms = atMs;
  return graph;
}

describe('useVideoEditorPreviewSurface', () => {
  it('previews the active shot draft before canonical publication is acknowledged', () => {
    const adapter = createShotCompositionAdapter({ load: vi.fn(), publish: vi.fn() });
    const canonical = adapter.prepare(fixture);
    const draft = adapter.prepare(graphWithClipStart(700, 'draft-head'));
    const parentConfig = projectCanonicalComposition(canonical).config!;
    const expectedDraftConfig = projectCanonicalComposition(draft, parentConfig).config!;
    mocks.timeline = { resolvedConfig: parentConfig };
    mocks.playback = {
      currentTime: 0,
      previewRef: { current: null },
      playerContainerRef: { current: null },
      onPreviewTimeUpdate: vi.fn(),
    };
    mocks.runtime = {
      userId: null,
      shots: {
        shotComposition: adapter,
        canonicalComposition: canonical,
        canonicalDraft: { composition: draft },
        canonicalCompositionError: null,
      },
    };

    const { result } = renderHook(() => useVideoEditorPreviewSurface());
    const slot = document.createElement('div');
    act(() => result.current.slotRef(slot));
    const previewElement = (result.current.portal as unknown as { children: React.ReactElement }).children;

    expect(previewElement.props.config).toEqual(expectedDraftConfig);
    expect(previewElement.props.currentTime).toBeUndefined();
  });

  it('retains the preview key across config updates and physical slot moves', () => {
    mocks.timeline = {
      resolvedConfig: {
        output: {resolution: '1280x720', fps: 30, file: 'preview.mp4'},
        tracks: [],
        clips: [],
        registry: {},
      },
    };
    mocks.playback = {
      currentTime: 4,
      previewRef: {current: null},
      playerContainerRef: {current: null},
      onPreviewTimeUpdate: vi.fn(),
    };
    mocks.runtime = null;

    const {result, rerender} = renderHook(() => useVideoEditorPreviewSurface());
    const firstSlot = document.createElement('div');
    act(() => result.current.slotRef(firstSlot));
    const firstPortal = result.current.portal as unknown as {children: React.ReactElement};
    const firstKey = firstPortal.children.key;

    mocks.timeline = {
      resolvedConfig: {
        output: {resolution: '1280x720', fps: 30, file: 'preview-edited.mp4'},
        tracks: [],
        clips: [],
        registry: {},
      },
    };
    rerender();
    const configPortal = result.current.portal as unknown as {children: React.ReactElement};
    expect(configPortal.children.key).toBe(firstKey);

    const secondSlot = document.createElement('div');
    act(() => result.current.slotRef(null));
    expect(result.current.portal).not.toBeNull();
    act(() => result.current.slotRef(secondSlot));
    const movedPortal = result.current.portal as unknown as {children: React.ReactElement};
    expect(movedPortal.children.key).toBe(firstKey);
    expect(firstSlot).toBeEmptyDOMElement();
    expect(secondSlot.childElementCount).toBe(1);
  });

  it('remounts the preview across project or timeline scopes so deferred footage cannot leak', () => {
    mocks.timeline={resolvedConfig:{output:{resolution:'1280x720',fps:30,file:'preview.mp4'},tracks:[],clips:[],registry:{}}};
    mocks.playback={currentTime:0,previewRef:{current:null},playerContainerRef:{current:null},onPreviewTimeUpdate:vi.fn()};
    mocks.runtime={project:{projectId:'one'},timelineId:'timeline-one'};
    const {result,rerender}=renderHook(()=>useVideoEditorPreviewSurface());
    act(()=>result.current.slotRef(document.createElement('div')));
    const key=()=> (result.current.portal as unknown as {children:React.ReactElement}).children.key;
    const first=key();
    mocks.runtime={project:{projectId:'two'},timelineId:'timeline-one'};
    rerender();
    expect(key()).not.toBe(first);
    const second=key();
    mocks.runtime={project:{projectId:'two'},timelineId:'timeline-two'};
    rerender();
    expect(key()).not.toBe(second);
  });
});
