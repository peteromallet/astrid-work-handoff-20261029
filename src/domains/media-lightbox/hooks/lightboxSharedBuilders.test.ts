import { describe, expect, it, vi } from 'vitest';

import {
  buildImageSharedLightboxInput,
  buildVideoSharedLightboxInput,
} from './lightboxSharedBuilders';

describe('lightboxSharedBuilders', () => {
  it('builds image shared-lightbox input from the neutral task-details boundary', () => {
    const result = buildImageSharedLightboxInput({
      props: {
        media: { id: 'img-1', location: 'https://image.test/full.png' } as never,
        onClose: vi.fn(),
        readOnly: true,
        shotId: 'shot-1',
        initialVariantId: 'variant-1',
        navigation: { hasNext: true, hasPrevious: false },
        shotWorkflow: { selectedShotId: 'shot-1' },
        features: { showTaskDetails: true, showDownload: true },
        actions: { onDelete: vi.fn(), isDeleting: 'img-1' },
      },
      env: {
        selectedProjectId: 'project-1',
        isMobile: false,
        variantFetchGenerationId: 'img-1',
        isCloudMode: false,
        isDownloading: false,
        setIsDownloading: vi.fn(),
        imageDimensions: { width: 1024, height: 1024 },
        projectAspectRatio: '1:1',
      } as never,
      handleSlotNavNext: vi.fn(),
      handleSlotNavPrev: vi.fn(),
    });

    expect(result.layout.showTaskDetails).toBe(true);
    expect(result.navigation.swipeDisabled).toBe(true);
    expect(result.media.effectiveImageUrl).toBe('https://image.test/full.png');
  });

  it('builds video shared-lightbox input and keeps video-specific navigation ownership', () => {
    const result = buildVideoSharedLightboxInput({
      props: {
        media: { id: 'video-1' },
        onClose: vi.fn(),
        navigation: { showNavigation: true },
        features: { showTaskDetails: true, showDownload: true },
        actions: { onDelete: vi.fn(), isDeleting: 'video-1' },
      } as never,
      modeModel: {
        isFormOnlyMode: false,
        hasNext: true,
        hasPrevious: true,
        handleSlotNavNext: vi.fn(),
        handleSlotNavPrev: vi.fn(),
      } as never,
      env: {
        selectedProjectId: 'project-1',
        isMobile: false,
        variantFetchGenerationId: 'video-1',
        isCloudMode: false,
        isDownloading: false,
        setIsDownloading: vi.fn(),
        effectiveImageUrl: 'https://video.test/poster.png',
        imageDimensions: { width: 1920, height: 1080 },
        projectAspectRatio: '16:9',
      } as never,
    });

    expect(result.core.isVideo).toBe(true);
    expect(result.navigation.hasNext).toBe(true);
    expect(result.navigation.swipeDisabled).toBe(false);
  });
});
