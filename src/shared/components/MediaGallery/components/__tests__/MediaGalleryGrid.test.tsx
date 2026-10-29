// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaGalleryGrid } from '../MediaGalleryGrid';

const mocks = vi.hoisted(() => ({
  MediaGalleryItem: vi.fn(() => <div data-testid="media-gallery-item" />),
  ProgressiveLoadingManager: vi.fn(({ children }: { children: (visible: Set<number>) => React.ReactNode }) => (
    <>{children(new Set([0, 1]))}</>
  )),
  useAdjacentPagePreloader: vi.fn(),
}));

vi.mock('@/shared/components/MediaGalleryItem', () => ({
  MediaGalleryItem: (props: unknown) => mocks.MediaGalleryItem(props),
}));

vi.mock('@/shared/components/ProgressiveLoadingManager', () => ({
  ProgressiveLoadingManager: (props: unknown) => mocks.ProgressiveLoadingManager(props as never),
}));

vi.mock('@/shared/hooks/gallery/useAdjacentPagePreloader', () => ({
  useAdjacentPagePreloader: (...args: unknown[]) => mocks.useAdjacentPagePreloader(...args),
}));

vi.mock('@/shared/lib/media/imageLoadingPriority', () => ({
  getImageLoadingStrategy: () => ({
    shouldLoadInInitialBatch: true,
  }),
}));

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    images: [
      { id: 'img-1', url: 'https://example.com/1.png' },
      { id: 'img-2', url: 'https://example.com/2.png' },
    ],
    paginatedImages: [
      { id: 'img-1', url: 'https://example.com/1.png' },
      { id: 'img-2', url: 'https://example.com/2.png' },
    ],
    filteredImages: [
      { id: 'img-1', url: 'https://example.com/1.png' },
      { id: 'img-2', url: 'https://example.com/2.png' },
    ],
    reducedSpacing: false,
    darkSurface: false,
    gridColumnClasses: 'grid-cols-2',
    columnsPerRow: 2,
    projectAspectRatio: '16:9',
    selectedIds: undefined,
    isLoading: false,
    isGalleryLoading: false,
    isServerPagination: false,
    clearNavigation: vi.fn(),
    effectivePage: 1,
    isMobile: false,
    isLightboxOpen: false,
    enableAdjacentPagePreloading: false,
    page: 0,
    serverPage: undefined,
    totalFilteredItems: 2,
    itemsPerPage: 2,
    selectedProjectId: undefined,
    generationFilters: undefined,
    hasFilters: false,
    isBackfillLoading: false,
    setIsBackfillLoading: vi.fn(),
    totalCount: 2,
    offset: 0,
    optimisticDeletedCount: 0,
    hideBottomPagination: false,
    itemShotWorkflow: {
      selectedShotIdLocal: 'shot-1',
      simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
      setSelectedShotIdLocal: vi.fn(),
      setLastAffectedShotId: vi.fn(),
      showTickForImageId: null,
      onShowTick: vi.fn(),
      addingToShotImageId: null,
      setAddingToShotImageId: vi.fn(),
    },
    itemMobileInteraction: {
      mobileActiveImageId: null,
      mobilePopoverOpenImageId: null,
      onMobileTap: vi.fn(),
      setMobilePopoverOpenImageId: vi.fn(),
    },
    itemFeatures: {},
    itemActions: {
      onOpenLightbox: vi.fn(),
      onDownloadImage: vi.fn(),
    },
    itemLoading: {
      downloadingImageId: null,
    },
    ...overrides,
  };
}

describe('MediaGalleryGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes selection state to each rendered gallery item', () => {
    render(
      <MediaGalleryGrid
        {...buildProps({
          selectedIds: new Set(['img-2']),
        })}
      />,
    );

    expect(mocks.MediaGalleryItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        image: expect.objectContaining({ id: 'img-1' }),
        isSelected: false,
      }),
    );
    expect(mocks.MediaGalleryItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        image: expect.objectContaining({ id: 'img-2' }),
        isSelected: true,
      }),
    );
  });

  it('defaults items to unselected when selectedIds is omitted', () => {
    render(<MediaGalleryGrid {...buildProps()} />);

    expect(mocks.MediaGalleryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        isSelected: false,
      }),
    );
  });
});
