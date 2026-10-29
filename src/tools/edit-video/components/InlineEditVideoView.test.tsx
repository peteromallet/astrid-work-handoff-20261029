// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireCloudBackend: vi.fn(),
}));

vi.mock('@/shared/lib/cloudBackend', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/cloudBackend')>('@/shared/lib/cloudBackend');
  return {
    ...actual,
    requireCloudBackend: (feature: string) => {
      mocks.requireCloudBackend(feature);
      return actual.requireCloudBackend(feature);
    },
  };
});

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('@/shared/hooks/variants/useVariants', () => ({
  useVariants: () => ({
    variants: [],
    activeVariant: null,
    isLoading: false,
    setActiveVariantId: vi.fn(),
    setPrimaryVariant: vi.fn(),
    deleteVariant: vi.fn(),
  }),
}));

vi.mock('@/shared/components/VariantSelector', () => ({
  VariantSelector: () => null,
}));

vi.mock('@/domains/media-lightbox/hooks/useVideoEnhance', () => ({
  useVideoEnhance: () => ({
    settings: {},
    updateSetting: vi.fn(),
    handleGenerate: vi.fn(),
    isGenerating: false,
    generateSuccess: false,
    canSubmit: false,
  }),
}));

vi.mock('@/domains/media-lightbox/components/VideoEnhanceForm', () => ({
  VideoEnhanceForm: () => null,
}));

vi.mock('@/domains/media-lightbox/components/VideoEditModeDisplay', () => ({
  VideoEditModeDisplay: () => null,
}));

vi.mock('@/domains/media-lightbox/components/MediaDisplayWithCanvas', () => ({
  MediaDisplayWithCanvas: () => null,
}));

vi.mock('@/domains/media-lightbox/components/ModeSelector', () => ({
  ModeSelector: ({ items }: { items: Array<{ id: string; label: string; onClick: () => void }> }) => (
    <div>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={item.onClick}>{item.label}</button>
      ))}
    </div>
  ),
}));

vi.mock('@/domains/media-lightbox/components/VideoTrimModeDisplay', () => ({
  VideoTrimModeDisplay: ({ onLoadedMetadata }: { onLoadedMetadata: (duration: number) => void }) => (
    <button type="button" onClick={() => onLoadedMetadata(10)}>load-video-metadata</button>
  ),
}));

vi.mock('@/shared/components/VideoTrimEditor/components/TrimTimelineDisplay', () => ({
  TrimTimelineDisplay: ({ onStartTrimChange }: { onStartTrimChange: (seconds: number) => void }) => (
    <button type="button" onClick={() => onStartTrimChange(2)}>trim-start-by-two-seconds</button>
  ),
}));

vi.mock('@/shared/components/VideoTrimEditor/components/TrimFramePreviews', () => ({
  TrimFramePreviews: () => null,
}));

vi.mock('@/shared/components/VideoTrimEditor/hooks/useVideoFrameExtraction', () => ({
  useVideoFrameExtraction: () => ({
    frameExtractionVideoElementRef: { current: null },
    canvasElementRef: { current: null },
    startFrame: null,
    endFrame: null,
    handleVideoLoaded: vi.fn(),
  }),
}));

vi.mock('./VideoReplaceMode', () => ({
  useReplaceMode: () => ({ selections: [] }),
  ReplacePanelContent: () => null,
}));

import { InlineEditVideoView } from './InlineEditVideoView';

const NOTICE = "Edit Videos needs an online account, which isn't available yet.";

describe('InlineEditVideoView trim mode', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderTrimMode() {
    render(
      <InlineEditVideoView
        media={{ id: 'generation-1', location: 'https://cdn.example/video.mp4' } as never}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trim' }));
    fireEvent.click(screen.getByRole('button', { name: 'load-video-metadata' }));
  }

  it('keeps the save button disabled until the trim removes something', () => {
    renderTrimMode();

    const save = screen.getByRole('button', { name: /save trimmed video/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'trim-start-by-two-seconds' }));

    expect(save.disabled).toBe(false);
  });

  it('shows the one plain line when the trim is saved, without sending a request', () => {
    renderTrimMode();
    fireEvent.click(screen.getByRole('button', { name: 'trim-start-by-two-seconds' }));
    expect(screen.queryByText(NOTICE)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save trimmed video/i }));

    expect(mocks.requireCloudBackend).toHaveBeenCalledWith('edit-video');
    expect(screen.getByTestId('cloud-backend-notice').textContent).toBe(NOTICE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
