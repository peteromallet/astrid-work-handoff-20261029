import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoEditorAssetPanelSurface } from './VideoEditorAssetPanelSurface';

const state = vi.hoisted(() => ({ panels: [] as unknown[], visible: [] as unknown[] }));
vi.mock('./AssetPanel.tsx', () => ({ default: () => null }));
vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({ useOptionalVideoEditorRuntime: () => null }));
vi.mock('@/tools/video-editor/hooks/timelineStore.ts', () => ({
  useTimelineEditorData: () => ({ data: null, preferences: {} }),
  useTimelineStoreApiSafe: () => null,
  useTimelineEditorOps: () => ({}),
}));
vi.mock('@/tools/video-editor/runtime/useVideoEditorRenderContext.ts', () => ({
  useVideoEditorPanelRegistry: () => ({ panels: state.panels }),
  useVideoEditorAssetPanels: () => state.visible,
}));
afterEach(cleanup);

it('retains the registered panel while visibility changes and removes it when registration ends', () => {
  function Draft() {
    const [value, setValue] = useState('');
    return <input aria-label="draft" value={value} onChange={(event) => setValue(event.target.value)} />;
  }
  const panel = { id: 'draft', extensionId: 'com.test.panel', placement: 'asset-panel', render: () => <Draft /> };
  state.panels = [panel]; state.visible = [panel];
  const view = render(<VideoEditorAssetPanelSurface includeBuiltIn={false} />);
  const input = view.getByRole('textbox') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'still here' } });
  state.visible = [];
  view.rerender(<VideoEditorAssetPanelSurface includeBuiltIn={false} activePanelKey={null} />);
  expect(input).not.toBeVisible();
  expect(view.container.querySelector('input')).toBe(input);
  state.visible = [panel];
  view.rerender(<VideoEditorAssetPanelSurface includeBuiltIn={false} activePanelKey="com.test.panel:draft" />);
  expect(input).toBeVisible();
  expect(input.value).toBe('still here');
  state.panels = []; state.visible = [];
  view.rerender(<VideoEditorAssetPanelSurface includeBuiltIn={false} />);
  expect(view.container.querySelector('input')).toBeNull();
});
