import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelRenderProps, PanelVideoAdapter } from '@astrid/editor-sdk';
import { VideoEditorAssetPanelSurface } from './VideoEditorAssetPanelSurface';

const state = vi.hoisted(() => ({
  store: null as unknown,
  captured: [] as Array<PanelRenderProps['video']>,
}));
vi.mock('./AssetPanel.tsx', () => ({ default: () => null }));
vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useOptionalVideoEditorRuntime: () => ({ timelineViewStore: {} }),
}));
vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineEditorData: () => ({ data: null, preferences: {} }),
  useTimelineStoreApiSafe: () => state.store,
  useTimelineEditorOps: () => ({}),
}));
vi.mock('@/tools/video-editor/runtime/useVideoEditorRenderContext.ts', () => {
  const panel = {
    id: 'probe',
    extensionId: 'com.test.panel',
    placement: 'asset-panel',
    render: (props: PanelRenderProps) => {
      state.captured.push(props.video);
      return null;
    },
  };
  return { useVideoEditorPanelRegistry: () => ({ panels: [panel] }), useVideoEditorAssetPanels: () => [panel] };
});

const selectClips = vi.fn();
const onClickTimeArea = vi.fn();

beforeEach(() => {
  state.captured = [];
  selectClips.mockClear();
  state.store = {
    getState: () => ({ ops: { selectClips, onClickTimeArea }, data: { data: null, dataRef: { current: null } } }),
    subscribe: () => () => undefined,
  };
});
afterEach(cleanup);

function lastVideo() {
  const video = state.captured[state.captured.length - 1];
  expect(video).toBeDefined();
  return video as PanelVideoAdapter;
}

describe('VideoEditorAssetPanelSurface video.select', () => {
  it('gives panels a select that forwards a fresh array to ops.selectClips', () => {
    render(<VideoEditorAssetPanelSurface includeBuiltIn={false} activePanelKey="com.test.panel:probe" />);
    const video = lastVideo();
    expect(typeof video.select).toBe('function');

    const input = ['a', 'b'];
    video.select!(input);

    expect(selectClips).toHaveBeenCalledTimes(1);
    const passed = selectClips.mock.calls[0][0];
    expect(passed).toEqual(['a', 'b']);
    expect(passed).not.toBe(input);
  });

  it('keeps a caller-supplied select instead of replacing it', () => {
    const ownSelect = vi.fn();
    const supplied = { view: {}, seek: vi.fn(), select: ownSelect } as unknown as PanelVideoAdapter;
    render(<VideoEditorAssetPanelSurface includeBuiltIn={false} activePanelKey="com.test.panel:probe" video={supplied} />);
    const video = lastVideo();

    expect(video.select).toBe(ownSelect);
    video.select!(['x']);
    expect(ownSelect).toHaveBeenCalledWith(['x']);
    expect(selectClips).not.toHaveBeenCalled();
  });
});
