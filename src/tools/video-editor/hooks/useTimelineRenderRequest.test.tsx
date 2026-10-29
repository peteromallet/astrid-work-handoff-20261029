import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTimelineRenderRequest } from '@/tools/video-editor/hooks/useTimelineState.ts';

describe('useTimelineRenderRequest', () => {
  it('keeps request identity stable when only the playhead changes', () => {
    const assetRegistry = {} as Parameters<typeof useTimelineRenderRequest>[1];
    const resolvedConfig = {} as Parameters<typeof useTimelineRenderRequest>[2];
    const renderMetadata = {} as Parameters<typeof useTimelineRenderRequest>[3];
    const { result, rerender } = renderHook(({ playhead }) => {
      void playhead;
      return useTimelineRenderRequest('timeline-1', assetRegistry, resolvedConfig, renderMetadata, 'project-1');
    }, { initialProps: { playhead: 0 } });
    const firstRequest = result.current;

    rerender({ playhead: 2.5 });

    expect(result.current).toBe(firstRequest);
    expect(result.current.renderRuntime).toBe(firstRequest.renderRuntime);
  });
});
