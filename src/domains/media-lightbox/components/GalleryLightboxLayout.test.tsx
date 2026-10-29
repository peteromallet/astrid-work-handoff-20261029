// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import type { GenerationRow } from '@/domains/generation/types';

const mocks = vi.hoisted(() => ({
  usePaneLockPolicyState: vi.fn(),
  useGenerationsPaneController: vi.fn(),
}));

vi.mock('@/shared/contexts/usePaneLockPolicyState', () => ({
  usePaneLockPolicyState: () => mocks.usePaneLockPolicyState(),
}));

vi.mock('@/features/gallery/components/GenerationsPane/hooks/useGenerationsPaneController', () => ({
  useGenerationsPaneController: () => mocks.useGenerationsPaneController(),
}));

vi.mock('@/shared/components/PaneControlTab', () => ({ PaneControlTab: () => null }));
vi.mock('@/features/gallery/components/GenerationsPane/components/GenerationsPaneControls', () => ({
  GenerationsPaneControls: () => null,
}));
vi.mock('@/features/gallery/components/GenerationsPane/components/GenerationsPaneGallery', () => ({
  GenerationsPaneGallery: () => <div data-testid="gallery-content" />,
}));
vi.mock('@/features/gallery/components/GenerationsPane/components/GenerationsDropChip', () => ({
  GenerationsDropChip: () => null,
}));
vi.mock('@/shared/components/modals/ImageGenerationModal', () => ({ ImageGenerationModal: () => null }));
vi.mock('@/shared/components/dialogs/DeleteGenerationConfirmDialog', () => ({ DeleteGenerationConfirmDialog: () => null }));
vi.mock('@/shared/state/dragOverlayStore', () => ({ useIsDraggingFiles: () => false, setDragging: vi.fn() }));
vi.mock('@/features/gallery/hooks/useDropToGeneration', () => ({ useDropToGeneration: () => vi.fn() }));
vi.mock('@/shared/components/MediaGalleryItem', async () => {
  const React = await import('react');
  return {
    MediaGalleryItem: ({ image, actions }: { image: GeneratedImageWithMetadata; actions: { onOpenLightbox: (item: GeneratedImageWithMetadata) => void } }) => React.createElement(
      'button',
      { type: 'button', onClick: () => actions.onOpenLightbox(image) },
      `Open ${image.id}`,
    ),
  };
});
vi.mock('@/shared/components/ProgressiveLoadingManager', async () => {
  const React = await import('react');
  return { ProgressiveLoadingManager: ({ children }: { children: (indices: Set<number>) => React.ReactNode }) => React.createElement(React.Fragment, {}, children(new Set([0, 1]))) };
});
vi.mock('@/shared/hooks/gallery/useAdjacentPagePreloader', () => ({ useAdjacentPagePreloader: vi.fn() }));

vi.mock('@/shared/media/localMediaResolver', () => ({
  useLocalMediaUrl: (media: GenerationRow | null) => ({ url: media?.location, state: 'ready' }),
}));
vi.mock('@/shared/hooks/shots/useLastAffectedShot', () => ({
  useLastAffectedShot: () => ({ setLastAffectedShotId: vi.fn() }),
}));
vi.mock('@/shared/components/TaskDetails/TaskDetailsModal', () => ({ TaskDetailsModal: () => null }));
vi.mock('@/domains/generation/components/GenerationDetails', () => ({ GenerationDetails: () => null }));

vi.mock('@/domains/media-lightbox/MediaLightbox', async () => {
  const React = await import('react');
  const { LightboxShell } = await import('./LightboxShell');
  return {
    MediaLightbox: ({ media, onClose }: { media: GenerationRow; onClose: () => void }) => React.createElement(
      LightboxShell,
      {
        onClose,
        isMobile: false,
        isTabletOrLarger: true,
        overlayViewport: {
          tasksPaneOpen: false,
          tasksPaneLocked: false,
          isTabletOrLarger: true,
          needsFullscreenLayout: true,
          needsTasksPaneOffset: false,
          tasksPaneWidth: 0,
        },
        contentRef: { current: null },
        accessibilityTitle: 'Image viewer',
        accessibilityDescription: 'Viewing a gallery image',
      },
      React.createElement('div', { 'data-testid': 'viewer-image' }, media.id),
      React.createElement('button', { type: 'button', onClick: onClose }, 'Close viewer'),
    ),
  };
});

import { GenerationsPane } from '@/features/gallery/components/GenerationsPane/GenerationsPane';
import { MediaGalleryLightbox, type MediaGalleryLightboxSession } from '@/shared/components/MediaGallery/components/MediaGalleryLightbox';
import { MediaGalleryGrid } from '@/shared/components/MediaGallery/components/MediaGalleryGrid';
import { useMediaGalleryState } from '@/shared/components/MediaGallery/hooks/useMediaGalleryState';
import { useMediaGalleryActions } from '@/shared/components/MediaGallery/hooks/useMediaGalleryActions';
import { PanesStoreBootstrapBoundary, __resetPanesStoreForTests, usePanesStore } from '@/shared/state/panesStore';

const images: GeneratedImageWithMetadata[] = [
  { id: 'image-one', url: 'https://example.com/one.png', metadata: {}, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'image-two', url: 'https://example.com/two.png', metadata: {}, createdAt: '2025-01-02T00:00:00Z' },
];

function toGenerationRow(image: GeneratedImageWithMetadata): GenerationRow {
  return { id: image.id, location: image.url, metadata: {}, starred: false } as GenerationRow;
}

function buildSession(image: GeneratedImageWithMetadata | null, onClose: () => void): MediaGalleryLightboxSession {
  return {
    activeLightboxMedia: image,
    lightboxMedia: image ? toGenerationRow(image) : null,
    onClose,
    filteredImages: images,
    isServerPagination: false,
    totalPages: 1,
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    hasNext: true,
    hasPrevious: false,
    handleNavigateToGeneration: vi.fn(),
    handleOpenExternalGeneration: vi.fn().mockResolvedValue(undefined),
    simplifiedShotOptions: [],
    selectedShotIdLocal: 'all',
    onShotChange: vi.fn(),
    showTickForImageId: null,
    setShowTickForImageId: vi.fn(),
    isMobile: false,
    showTaskDetailsModal: false,
    setShowTaskDetailsModal: vi.fn(),
    selectedImageForDetails: null,
    setSelectedImageForDetails: vi.fn(),
    taskDetailsData: null,
  };
}

function buildController() {
  const noop = vi.fn();
  return {
    pane: {
      isOnImageGenerationPage: false, isShotsPaneLocked: false, shotsPaneWidth: 0,
      isTasksPaneLocked: false, tasksPaneWidth: 0, isLocked: true, paneIsOpen: true,
      paneProps: {}, transformClass: 'translate-y-0', toggleLock: noop, openPane: noop,
      handlePaneEnter: noop, handlePaneLeave: noop, showBackdrop: false, closePane: noop,
      isPointerEventsEnabled: true, isInteractionDisabled: false,
    },
    navigation: { isVideoEditorShellActive: true, handleNavigateToImageGeneration: noop },
    modal: { isGenerationModalOpen: false, setIsGenerationModalOpen: noop },
    filters: {
      shotsForFilter: [], selectedShotFilter: 'all', setSelectedShotFilter: noop,
      excludePositioned: false, setExcludePositioned: noop, shotFilterContentRef: { current: null },
      mediaTypeContentRef: { current: null }, shotFilterOpen: false, setShotFilterOpen: noop,
      mediaTypeFilter: 'all', setMediaTypeFilter: noop, mediaTypeFilterOpen: false,
      setMediaTypeFilterOpen: noop, searchTerm: '', setSearchTerm: noop, isSearchOpen: false,
      setIsSearchOpen: noop, searchInputRef: { current: null }, starredOnly: false,
      setStarredOnly: noop, currentShotId: null, isSpecialFilterSelected: false,
      galleryFilters: { status: 'all' }, handleGalleryFiltersChange: noop, generationFilters: undefined,
    },
    gallery: {
      totalCount: 0, page: 1, handleServerPageChange: noop, isLoading: false,
      expectedItemCount: 0, error: null, paginatedData: { items: images }, handleDeleteGeneration: noop,
      handleToggleStar: noop, isDeleting: false, shotsData: [], lastAffectedShotId: null,
      handleAddToShot: noop, handleAddToShotWithoutPosition: noop, handleCreateShot: noop,
      confirmDialogProps: {}, config: {}, readOnly: false,
    },
    layout: { isMobile: false, paneLayout: { columns: 4, itemsPerPage: 20 }, galleryContainerRef: { current: null }, projectAspectRatio: '1:1' },
  };
}

function GalleryViewerHarness() {
  const stateHook = useMediaGalleryState({ images, simplifiedShotOptions: [] });
  const viewerOpen = Boolean(stateHook.state.activeLightboxMedia);
  const actionsHook = useMediaGalleryActions({
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    setActiveLightboxMedia: stateHook.setActiveLightboxMedia,
    markOptimisticDeleted: stateHook.markOptimisticDeleted,
    markOptimisticDeletedWithBackfill: stateHook.markOptimisticDeletedWithBackfill,
    removeOptimisticDeleted: stateHook.removeOptimisticDeleted,
    setDownloadingImageId: stateHook.setDownloadingImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    mainTickTimeoutRef: stateHook.mainTickTimeoutRef,
    secondaryTickTimeoutRef: stateHook.secondaryTickTimeoutRef,
    itemsPerPage: 20,
    isServerPagination: false,
    setIsBackfillLoading: stateHook.setIsBackfillLoading,
    filteredImages: images,
    setIsDownloadingStarred: stateHook.setIsDownloadingStarred,
    setSelectedShotIdLocal: stateHook.setSelectedShotIdLocal,
    optimisticDeletedCount: 0,
  });
  const preferredHeight = usePanesStore((state) => state.generationsPaneHeight);
  const setPaneHeight = usePanesStore((state) => state.setGenerationsPaneHeight);

  return (
    <>
      <GenerationsPane />
      <div>
        <span data-testid="preferred-height">{preferredHeight}</span>
        <button type="button" onClick={() => setPaneHeight(420)}>Set drawer height</button>
      </div>
      <MediaGalleryGrid
        images={images}
        paginatedImages={images}
        filteredImages={images}
        gridColumnClasses="grid-cols-2"
        columnsPerRow={2}
        isGalleryLoading={false}
        isServerPagination={false}
        clearNavigation={vi.fn()}
        effectivePage={1}
        isMobile={false}
        isLightboxOpen={viewerOpen}
        enableAdjacentPagePreloading={false}
        page={1}
        totalFilteredItems={images.length}
        itemsPerPage={images.length}
        hasFilters={false}
        itemShotWorkflow={{ selectedShotIdLocal: 'all', simplifiedShotOptions: [], setSelectedShotIdLocal: vi.fn(), setLastAffectedShotId: vi.fn(), showTickForImageId: null, onShowTick: vi.fn(), addingToShotImageId: null, setAddingToShotImageId: vi.fn() }}
        itemMobileInteraction={{ isMobile: false, mobileActiveImageId: null, mobilePopoverOpenImageId: null, onMobileTap: vi.fn(), setMobilePopoverOpenImageId: vi.fn() }}
        itemFeatures={{}}
        itemActions={{ onOpenLightbox: actionsHook.handleOpenLightbox, onDownloadImage: vi.fn() }}
        itemLoading={{ downloadingImageId: null }}
      />
      <MediaGalleryLightbox
        session={buildSession(
          stateHook.state.activeLightboxMedia,
          actionsHook.handleCloseLightbox,
        )}
      />
    </>
  );
}

describe('gallery and image viewer layout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    __resetPanesStoreForTests();
    mocks.usePaneLockPolicyState.mockReturnValue({
      locks: { shots: false, tasks: false, gens: false, editor: false },
      isGenerationsPaneOpenState: true,
      isEditorPaneOpenState: false,
      isTasksPaneOpenState: false,
      setIsGenerationsPaneLocked: vi.fn(),
      setIsEditorPaneLocked: vi.fn(),
      setIsShotsPaneLocked: vi.fn(),
      setIsTasksPaneLocked: vi.fn(),
      setIsGenerationsPaneOpen: vi.fn(),
      setIsEditorPaneOpen: vi.fn(),
      setIsTasksPaneOpen: vi.fn(),
      resetAllPaneLocks: vi.fn(),
    });
    mocks.useGenerationsPaneController.mockReturnValue(buildController());
  });

  it('keeps the viewer above a compact gallery, switches thumbnails, and restores the drawer height on close', async () => {
    render(
      <PanesStoreBootstrapBoundary>
        <GalleryViewerHarness />
      </PanesStoreBootstrapBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set drawer height' }));
    expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '420px' });

    fireEvent.click(screen.getByRole('button', { name: 'Open image-one' }));
    expect(await screen.findByTestId('viewer-image')).toHaveTextContent('image-one');
    expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '240px' });

    const backdrop = document.querySelector('[data-dialog-backdrop]');
    const popup = document.querySelector('[data-lightbox-popup]');
    expect(popup).toHaveClass('inset-0', 'w-full', 'h-full');
    expect(backdrop).toHaveStyle({ bottom: '240px' });
    expect(popup).toHaveStyle({
      top: '0px',
      bottom: '240px',
      height: 'calc(100dvh - 240px)',
      transform: 'none',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open image-two' }));
    expect(screen.getByTestId('viewer-image')).toHaveTextContent('image-two');

    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    expect(screen.queryByTestId('viewer-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '420px' });
  });
});
