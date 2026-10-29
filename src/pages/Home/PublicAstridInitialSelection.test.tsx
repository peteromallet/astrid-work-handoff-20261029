import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicAstridInitialSelection } from './PublicAstridEditorParts.tsx';

const mocks = vi.hoisted(() => ({
  data: { resolvedConfig: { clips: [{ id: 'clip-1' }] } as { clips: { id: string }[] } | null, selectedClipId: null as string | null },
  selectClip: vi.fn(),
  userSelect: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineEditorData: () => mocks.data,
  useTimelineOpsSelector: (select: (ops: { selectClip: typeof mocks.selectClip }) => unknown) => select({ selectClip: mocks.selectClip }),
  useTimelinePlaybackContext: () => ({}),
}));
vi.mock('@/shared/state/selectionStore.ts', () => ({ userSelectTimelineClip: mocks.userSelect }));
vi.mock('@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx', () => ({ RemotionPreview: () => null }));
vi.mock('@/tools/video-editor/components/TimelineEditor/TimelineEditorCoreBody.tsx', () => ({ TimelineEditorCoreBody: () => null }));
vi.mock('./publicAstridExample.tsx', () => ({ usePublicAstridExample: () => ({}) }));

describe('PublicAstridInitialSelection', () => {
  afterEach(() => {
    mocks.selectClip.mockReset();
    mocks.userSelect.mockReset();
    mocks.data = { resolvedConfig: { clips: [{ id: 'clip-1' }] }, selectedClipId: null };
  });

  it('selects the first clip through the editor-owned op, with no click, so the inspector (and the Effects callout target) is populated', async () => {
    render(<PublicAstridInitialSelection />);
    await vi.waitFor(() => expect(mocks.selectClip).toHaveBeenCalledWith('clip-1'));
    expect(mocks.userSelect).not.toHaveBeenCalled();
  });

  it('leaves an existing selection alone', async () => {
    mocks.data = { resolvedConfig: { clips: [{ id: 'clip-1' }] }, selectedClipId: 'clip-2' };
    render(<PublicAstridInitialSelection />);
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    expect(mocks.selectClip).not.toHaveBeenCalled();
  });
});
