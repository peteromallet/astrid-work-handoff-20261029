import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { GenerationRow } from '@/domains/generation/types';
import { MediaGalleryLightbox } from '../MediaGalleryLightbox';

const mediaLightboxSpy = vi.fn();
const useLocalMediaUrlMock = vi.fn();

vi.mock('@/domains/media-lightbox/MediaLightbox', () => ({
  MediaLightbox: (props: unknown) => {
    mediaLightboxSpy(props);
    return null;
  },
}));

vi.mock('@/shared/media/localMediaResolver', () => ({
  useLocalMediaUrl: (media: unknown) => useLocalMediaUrlMock(media),
}));

vi.mock('@/shared/components/TaskDetails/TaskDetailsModal', () => ({
  TaskDetailsModal: () => null,
}));

vi.mock('@/domains/generation/components/GenerationDetails', () => ({
  GenerationDetails: () => null,
}));

function buildLightboxMedia(overrides: Partial<GenerationRow>): GenerationRow {
  return {
    id: 'gen-1',
    location: 'https://example.com/image.png',
    metadata: {},
    starred: false,
    ...overrides,
  };
}

function renderLightbox(lightboxMedia: GenerationRow | null) {
  return render(
    <MediaGalleryLightbox
      session={{
        lightboxMedia,
        onClose: vi.fn(),
        filteredImages: [],
        isServerPagination: false,
        totalPages: 1,
        onNext: vi.fn(),
        onPrevious: vi.fn(),
        hasNext: false,
        hasPrevious: false,
        handleNavigateToGeneration: vi.fn(),
        handleOpenExternalGeneration: vi.fn(),
        simplifiedShotOptions: [],
        selectedShotIdLocal: 'all',
        onShotChange: vi.fn(),
        showTickForImageId: null,
        setShowTickForImageId: vi.fn(),
        showTaskDetailsModal: false,
        setShowTaskDetailsModal: vi.fn(),
        selectedImageForDetails: null,
        setSelectedImageForDetails: vi.fn(),
        taskDetailsData: null,
      }}
    />
  );
}

describe('MediaGalleryLightbox', () => {
  beforeEach(() => {
    mediaLightboxSpy.mockClear();
    useLocalMediaUrlMock.mockReturnValue({
      url: 'https://example.com/resolved.png',
      state: 'ready',
    });
  });

  it('uses session media and omits viewer edit props', () => {
    const lightboxMedia = buildLightboxMedia({
      id: 'gen-1',
      starred: true,
      metadata: { source: 'session' },
    });

    renderLightbox(lightboxMedia);

    const props = mediaLightboxSpy.mock.calls[0]?.[0] as {
      actions?: Record<string, unknown>;
      features?: Record<string, unknown>;
      media?: GenerationRow;
    };
    expect(props.features).not.toHaveProperty('showImageEditTools');
    expect(props.features).not.toHaveProperty('showMagicEdit');
    expect(props.actions).not.toHaveProperty('onApplySettings');
    expect(props.media?.metadata).toEqual({ source: 'session' });
    expect(props.media?.location).toBe('https://example.com/resolved.png');
  });

  it('keeps video viewers info-only on mobile', () => {
    const lightboxMedia = buildLightboxMedia({ id: 'gen-video', starred: false, metadata: { source: 'video' } });

    renderLightbox(lightboxMedia);

    const props = mediaLightboxSpy.mock.calls[0]?.[0] as {
      features?: Record<string, unknown>;
    };
    expect(props.features).not.toHaveProperty('showImageEditTools');
    expect(props.features).not.toHaveProperty('showMagicEdit');
  });
});
