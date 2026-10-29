// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationsPane } from './GenerationsPane';
import { LightboxShell } from '@/domains/media-lightbox/components/LightboxShell';
import { PanesStoreBootstrapBoundary, __resetPanesStoreForTests, usePanesStore } from '@/shared/state/panesStore';
import { PANE_CONFIG } from '@/shared/config/panes';

const savePaneLocks = vi.fn();
const persistedPaneLocks = { shots: false, tasks: false, gens: true, editor: false };

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
}));
vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: () => ({
    value: persistedPaneLocks,
    update: savePaneLocks,
    isLoading: false,
  }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/home', search: '' }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/shared/hooks/projects/useProjectGenerations', () => ({
  useProjectGenerations: () => ({ data: { total: 1 }, isLoading: false, isFetching: false, error: null }),
}));
vi.mock('@/shared/lib/debug/debugRendering', () => ({ useRenderLogger: vi.fn() }));
vi.mock('@/app/hooks/useVideoEditorRouteState', () => ({ isVideoEditorShellActiveForLocation: () => false }));
vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectCrudContext: () => ({ projects: [] }),
  useProjectSelectionContext: () => ({ selectedProjectId: null }),
}));
vi.mock('@/shared/contexts/ShotsContext', () => ({ useShots: () => ({ shots: [] }) }));
vi.mock('@/shared/contexts/AgentChatContext', () => ({ useOptionalAgentChatBridge: () => null }));
vi.mock('@/shared/state/selectionStore', () => ({ useCurrentShot: () => ({ currentShotId: null }) }));
vi.mock('@/shared/hooks/shotCreation/useShotCreation', () => ({ useShotCreation: () => ({ createShot: vi.fn() }) }));
vi.mock('@/shared/components/MediaGallery/hooks/useContainerWidth', () => ({
  useContainerWidth: () => [{ current: null }, 640],
}));
vi.mock('@/shared/components/MediaGallery/utils', () => ({
  calculateGalleryLayout: () => ({ columns: 4, itemsPerPage: 8, gridColumnClasses: 'grid-cols-4' }),
}));
vi.mock('@/features/gallery/hooks/useGalleryPageState', () => ({
  useGalleryPageState: () => ({
    selectedShotFilter: 'all', excludePositioned: false, starredOnly: false, searchTerm: '',
    setSelectedShotFilter: vi.fn(), setExcludePositioned: vi.fn(), setStarredOnly: vi.fn(), setSearchTerm: vi.fn(),
    shotsData: [], confirmDialogProps: { isOpen: false, onClose: vi.fn() }, error: null,
    expectedItemCount: 0, handleAddToShot: vi.fn(), handleAddToShotWithoutPosition: vi.fn(),
    handleDeleteGeneration: vi.fn(), handleServerPageChange: vi.fn(), handleToggleStar: vi.fn(),
    isDeleting: false, isLoading: false, lastAffectedShotId: null, page: 1,
    paginatedData: { items: [] }, totalCount: 0,
  }),
}));
vi.mock('@/app/runtime/useResolvedGalleryProject', () => ({
  useResolvedGalleryProject: () => ({ projectId: null, runtimeAuthority: false }),
}));
vi.mock('@/shared/state/dragOverlayStore', () => ({
  useIsDraggingFiles: () => false,
  setDragging: vi.fn(),
}));
vi.mock('@/features/gallery/hooks/useDropToGeneration', () => ({ useDropToGeneration: () => vi.fn() }));
vi.mock('./components/GenerationsPaneControls', () => ({ GenerationsPaneControls: () => null }));
vi.mock('./components/GenerationsPaneGallery', () => ({ GenerationsPaneGallery: () => <div data-testid="gallery-content" /> }));
vi.mock('@/shared/components/modals/ImageGenerationModal', () => ({ ImageGenerationModal: () => null }));
vi.mock('@/shared/components/dialogs/DeleteGenerationConfirmDialog', () => ({ DeleteGenerationConfirmDialog: () => null }));

function TestLightbox({ onClose }: { onClose: () => void }) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  return (
    <LightboxShell
      onClose={onClose}
      isMobile={false}
      isTabletOrLarger
      overlayViewport={{
        tasksPaneOpen: false,
        tasksPaneLocked: false,
        isTabletOrLarger: true,
        needsFullscreenLayout: true,
        needsTasksPaneOffset: false,
        tasksPaneWidth: 0,
      }}
      contentRef={contentRef}
      accessibilityTitle="Image viewer"
      accessibilityDescription="Viewing a gallery image"
    >
      <div>Viewing image</div>
      <button type="button" onClick={onClose}>Close viewer</button>
    </LightboxShell>
  );
}

function GalleryViewerHarness() {
  const [viewerOpen, setViewerOpen] = useState(true);
  const isGenerationsPaneLocked = usePanesStore((state) => state.isGenerationsPaneLocked);
  const isGenerationsPaneOpen = usePanesStore((state) => state.isGenerationsPaneOpen);
  const effectiveHeight = usePanesStore((state) => state.effectiveGenerationsPaneHeight);
  return (
    <PanesStoreBootstrapBoundary>
      <GenerationsPane />
      <output data-testid="pane-state" data-locked={isGenerationsPaneLocked} data-open={isGenerationsPaneOpen} data-height={effectiveHeight} />
      {viewerOpen && <TestLightbox onClose={() => setViewerOpen(false)} />}
    </PanesStoreBootstrapBoundary>
  );
}

describe('GenerationsPane with an open lightbox', () => {
  beforeEach(() => {
    window.innerHeight = 900;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    __resetPanesStoreForTests();
  });

  afterEach(() => {
    cleanup();
    __resetPanesStoreForTests();
  });

  it('unlocks by closing the gallery and restoring fullscreen viewer space', async () => {
    render(<GalleryViewerHarness />);

    await waitFor(() => expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '240px' }));
    const popup = document.querySelector('[data-lightbox-popup]');
    expect(popup).not.toBeNull();
    expect(popup).toHaveStyle({ bottom: '240px', height: 'calc(100dvh - 240px)' });
    expect(screen.getByText('Viewing image')).toBeInTheDocument();

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Unlock pane' }));

    await waitFor(() => {
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-open', 'false');
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-height', '321');
    });
    expect(screen.getByTestId('generations-pane')).toHaveClass('translate-y-full');
    expect(popup).toHaveClass('inset-0', 'w-full', 'h-full');
    const backdrop = document.querySelector('[data-dialog-backdrop]');
    expect(backdrop).toHaveStyle({ bottom: '0px' });
    expect(popup).toHaveStyle({ '--lightbox-available-height': 'calc(100dvh - 0px)' });
    expect((popup as HTMLElement).style.bottom).toBe('');
    expect((popup as HTMLElement).style.height).toBe('');
    expect(screen.getByText('Viewing image')).toBeInTheDocument();
  });

  it('recompacts when the unlocked gallery is explicitly opened during viewing', async () => {
    render(<GalleryViewerHarness />);
    await waitFor(() => expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '240px' }));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Unlock pane' }));
    await waitFor(() => expect(screen.getByTestId('pane-state')).toHaveAttribute('data-open', 'false'));

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Open Gallery' }));
    await waitFor(() => {
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-open', 'true');
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-height', '240');
    });
    expect(document.querySelector('[data-lightbox-popup]')).toHaveStyle({ bottom: '240px', height: 'calc(100dvh - 240px)' });
    expect(screen.getByText('Viewing image')).toBeInTheDocument();
  });

  it('recompacts when the user locks the gallery while the viewer is open', async () => {
    render(<GalleryViewerHarness />);
    await waitFor(() => expect(screen.getByTestId('generations-pane')).toHaveStyle({ height: '240px' }));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Unlock pane' }));
    await waitFor(() => expect(screen.getByTestId('pane-state')).toHaveAttribute('data-open', 'false'));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Lock pane' }));

    await waitFor(() => {
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-locked', 'true');
      expect(screen.getByTestId('pane-state')).toHaveAttribute('data-height', '240');
    });
    expect(document.querySelector('[data-lightbox-popup]')).toHaveStyle({ bottom: '240px', height: 'calc(100dvh - 240px)' });
    expect(screen.getByText('Viewing image')).toBeInTheDocument();
  });
});
