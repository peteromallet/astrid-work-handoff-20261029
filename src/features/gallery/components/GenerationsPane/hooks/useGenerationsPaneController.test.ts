import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useGenerationsPaneController } from './useGenerationsPaneController';

const mocks = vi.hoisted(() => ({
  useRenderLogger: vi.fn(),
  useSlidingPane: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  useContainerWidth: vi.fn(),
  calculateGalleryLayout: vi.fn(),
  panesState: {} as Record<string, unknown>,
  useGalleryPageState: vi.fn(),
  useProjectGenerations: vi.fn(),
  useIsMobile: vi.fn(),
  useCurrentShot: vi.fn(),
  useShots: vi.fn(),
  useProjectCrudContext: vi.fn(),
  useProjectSelectionContext: vi.fn(),
  useStableObject: vi.fn(),
  usePaneInteractionLifecycle: vi.fn(),
  isSpecialFilter: vi.fn(),
  useAppEventListener: vi.fn(),
  useResolvedGalleryProject: vi.fn(),
  selectedEditor: null as { projectId: string; timelineId: string } | null,
  eventHandlers: {} as Record<string, () => void>,
}));

vi.mock('@/shared/lib/debug/debugRendering', () => ({
  useRenderLogger: (...args: unknown[]) => mocks.useRenderLogger(...args),
}));

vi.mock('@/shared/hooks/useSlidingPane', () => ({
  useSlidingPane: (...args: unknown[]) => mocks.useSlidingPane(...args),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: (...args: unknown[]) => mocks.useNavigate(...args),
  useLocation: (...args: unknown[]) => mocks.useLocation(...args),
}));

vi.mock('@/shared/lib/tooling/toolRoutes', () => ({
  TOOL_ROUTES: {
    IMAGE_GENERATION: '/tools/image-generation',
  },
}));

vi.mock('@/shared/components/MediaGallery/hooks/useContainerWidth', () => ({
  useContainerWidth: (...args: unknown[]) => mocks.useContainerWidth(...args),
}));

vi.mock('@/shared/components/MediaGallery/utils', () => ({
  calculateGalleryLayout: (...args: unknown[]) => mocks.calculateGalleryLayout(...args),
}));

vi.mock('@/shared/state/panesStore', () => ({
  usePanesStore: (selector: (state: typeof mocks.panesState) => unknown) => selector(mocks.panesState),
}));

vi.mock('@/features/gallery/hooks/useGalleryPageState', () => ({
  useGalleryPageState: (...args: unknown[]) => mocks.useGalleryPageState(...args),
}));

vi.mock('@/shared/hooks/projects/useProjectGenerations', () => ({
  useProjectGenerations: (...args: unknown[]) => mocks.useProjectGenerations(...args),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));

vi.mock('@/shared/state/selectionStore', () => ({
  useCurrentShot: (...args: unknown[]) => mocks.useCurrentShot(...args),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: (...args: unknown[]) => mocks.useShots(...args),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectCrudContext: (...args: unknown[]) => mocks.useProjectCrudContext(...args),
  useProjectSelectionContext: (...args: unknown[]) => mocks.useProjectSelectionContext(...args),
}));


vi.mock('@/shared/hooks/useStableObject', () => ({
  useStableObject: (...args: unknown[]) => mocks.useStableObject(...args),
}));

vi.mock('@/shared/components/panes/usePaneInteractionLifecycle', () => ({
  usePaneInteractionLifecycle: (...args: unknown[]) => mocks.usePaneInteractionLifecycle(...args),
}));

vi.mock('@/shared/constants/filterConstants', () => ({
  SHOT_FILTER: { ALL: 'all' },
  isSpecialFilter: (...args: unknown[]) => mocks.isSpecialFilter(...args),
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  useAppEventListener: (...args: unknown[]) => mocks.useAppEventListener(...args),
}));

vi.mock('@/app/runtime/useResolvedGalleryProject', () => ({
  useResolvedGalleryProject: (...args: unknown[]) => mocks.useResolvedGalleryProject(...args),
}));

vi.mock('@/shared/contexts/AgentChatContext', () => ({
  useOptionalAgentChatBridge: () => ({ editorContext: mocks.selectedEditor }),
}));

vi.mock('@/shared/lib/queryKeys/shots', () => ({
  shotQueryKeys: {
    all: ['shots'],
  },
}));

function buildGalleryPageState(overrides: Record<string, unknown> = {}) {
  return {
    selectedShotFilter: 'all',
    excludePositioned: false,
    starredOnly: false,
    searchTerm: '',
    setSelectedShotFilter: vi.fn(),
    setExcludePositioned: vi.fn(),
    setStarredOnly: vi.fn(),
    setSearchTerm: vi.fn(),
    shotsData: [],
    error: null,
    expectedItemCount: 8,
    handleAddToShot: vi.fn(),
    handleAddToShotWithoutPosition: vi.fn(),
    handleServerPageChange: vi.fn(),
    isLoading: false,
    lastAffectedShotId: null,
    page: 1,
    paginatedData: { items: [{ id: 'gen-1' }] },
    totalCount: 10,
    ...overrides,
  };
}

function buildSlidingPaneState(overrides: Record<string, unknown> = {}) {
  return {
    isLocked: false,
    isOpen: true,
    toggleLock: vi.fn(),
    openPane: vi.fn(),
    paneProps: { role: 'region' },
    transformClass: 'translate-y-0',
    handlePaneEnter: vi.fn(),
    handlePaneLeave: vi.fn(),
    showBackdrop: true,
    closePane: vi.fn(),
    ...overrides,
  };
}

function buildPanesState(overrides: Record<string, unknown> = {}) {
  return {
    isGenerationsPaneLocked: false,
    setIsGenerationsPaneLocked: vi.fn(),
    isGenerationsPaneOpen: true,
    setIsGenerationsPaneOpen: vi.fn(),
    generationsPaneHeight: 280,
    setGenerationsPaneContentHeight: vi.fn(),
    isShotsPaneLocked: true,
    shotsPaneWidth: 100,
    isTasksPaneLocked: false,
    tasksPaneWidth: 0,
    ...overrides,
  };
}

describe('useGenerationsPaneController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.eventHandlers = {};
    mocks.selectedEditor = null;

    mocks.useStableObject.mockImplementation((factory: () => unknown) => factory());
    mocks.useAppEventListener.mockImplementation((event: string, handler: () => void) => {
      mocks.eventHandlers[event] = handler;
    });
    mocks.useRenderLogger.mockReturnValue(undefined);
    mocks.useIsMobile.mockReturnValue(false);
    mocks.useContainerWidth.mockReturnValue([{ current: null }, 640]);
    mocks.calculateGalleryLayout.mockReturnValue({ columns: 3 });
    mocks.useLocation.mockReturnValue({ pathname: '/home', search: '' });
    mocks.useNavigate.mockReturnValue(vi.fn());
    mocks.isSpecialFilter.mockReturnValue(false);
    mocks.usePaneInteractionLifecycle.mockReturnValue({
      isPointerEventsEnabled: true,
      isInteractionDisabled: false,
    });
    mocks.useSlidingPane.mockReturnValue(buildSlidingPaneState());
    mocks.panesState = buildPanesState();
    mocks.useProjectSelectionContext.mockReturnValue({ selectedProjectId: 'project-1' });
    mocks.useProjectCrudContext.mockReturnValue({
      projects: [{ id: 'project-1', aspectRatio: 1.6 }],
    });
    mocks.useCurrentShot.mockReturnValue({ currentShotId: 'shot-abc' });
    mocks.useShots.mockReturnValue({ shots: [{ id: 'fallback-shot' }] });
    mocks.useGalleryPageState.mockReturnValue(buildGalleryPageState());
    mocks.useProjectGenerations.mockReturnValue({
      data: { total: 10 },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    mocks.useResolvedGalleryProject.mockReturnValue({
      projectId: null,
      runtimeAuthority: false,
      status: 'not-applicable',
      isResolving: false,
      error: null,
      selector: null,
    });
  });

  it('composes pane/filter/gallery state and wires event handlers plus navigation', () => {
    const navigate = vi.fn();
    const openPane = vi.fn();
    const setIsGenerationsPaneLocked = vi.fn();
    const setIsGenerationsPaneOpen = vi.fn();
    const galleryPageState = buildGalleryPageState({
      shotsData: [],
      selectedShotFilter: 'all',
    });

    mocks.useNavigate.mockReturnValue(navigate);
    mocks.useSlidingPane.mockReturnValue(buildSlidingPaneState({
      openPane,
      isOpen: true,
      isLocked: false,
    }));
    mocks.panesState = buildPanesState({
      isGenerationsPaneOpen: true,
      setIsGenerationsPaneOpen,
      setIsGenerationsPaneLocked,
    });
    mocks.useGalleryPageState.mockReturnValue(galleryPageState);

    const { result } = renderHook(() => useGenerationsPaneController());

    expect(mocks.useGalleryPageState).toHaveBeenCalledWith({
      itemsPerPage: 6,
      mediaType: 'all',
      enableDataLoading: true,
      runtimeAuthority: false,
    });
    expect(result.current.layout.paneLayout.itemsPerPage).toBe(6);
    expect(result.current.layout.projectAspectRatio).toBe(1.6);
    expect(result.current.filters.shotsForFilter).toEqual([{ id: 'fallback-shot' }]);
    expect(result.current.filters.generationFilters).toEqual({
      mediaType: 'all',
      shotId: undefined,
      excludePositioned: undefined,
      starredOnly: false,
    });
    expect(result.current.filters.isSpecialFilterSelected).toBe(false);
    expect(result.current.pane.generationsPaneHeight).toBe(280);
    expect(result.current.pane.isShotsPaneLocked).toBe(true);
    expect(result.current.modal.isGenerationModalOpen).toBe(false);

    act(() => {
      mocks.eventHandlers.openGenerationsPane();
    });
    expect(openPane).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.navigation.handleNavigateToImageGeneration();
    });
    expect(setIsGenerationsPaneLocked).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith('/tools/image-generation');
    expect(setIsGenerationsPaneOpen).toHaveBeenCalledWith(true);
  });

  it('keeps the Astrid project and timeline when the gallery shortcut changes tools', () => {
    const navigate = vi.fn();
    mocks.useNavigate.mockReturnValue(navigate);
    mocks.useLocation.mockReturnValue({
      pathname: '/tools/travel-between-images',
      search: '?project=desert-plant-growth&timeline=01KYPVKMW5STB4W6FE05ED8242',
    });

    const { result } = renderHook(() => useGenerationsPaneController());
    act(() => result.current.navigation.handleNavigateToImageGeneration());

    expect(navigate).toHaveBeenCalledWith(
      '/tools/image-generation?project=desert-plant-growth&timeline=01KYPVKMW5STB4W6FE05ED8242',
    );
  });

  it('forces unlock on image-generation route and prefers gallery shot data over fallback context', () => {
    const setIsGenerationsPaneLocked = vi.fn();
    const galleryPageState = buildGalleryPageState({
      shotsData: [{ id: 'from-gallery' }],
      selectedShotFilter: 'special',
      excludePositioned: true,
      starredOnly: true,
    });

    mocks.useLocation.mockReturnValue({ pathname: '/tools/image-generation', search: '' });
    mocks.panesState = buildPanesState({
      isGenerationsPaneOpen: false,
      isGenerationsPaneLocked: true,
      setIsGenerationsPaneLocked,
    });
    mocks.useSlidingPane.mockReturnValue(buildSlidingPaneState({
      isOpen: false,
      isLocked: true,
    }));
    mocks.useGalleryPageState.mockReturnValue(galleryPageState);
    mocks.isSpecialFilter.mockReturnValue(true);

    const { result } = renderHook(() => useGenerationsPaneController());

    expect(result.current.pane.isOnImageGenerationPage).toBe(true);
    expect(result.current.filters.shotsForFilter).toEqual([{ id: 'from-gallery' }]);
    expect(result.current.filters.isSpecialFilterSelected).toBe(true);
    expect(mocks.useGalleryPageState).toHaveBeenCalledWith(expect.objectContaining({
      enableDataLoading: false,
    }));
    expect(setIsGenerationsPaneLocked).toHaveBeenCalledWith(false);
  });

  it('loads the Runtime gallery as soon as the pane is locked', () => {
    mocks.useLocation.mockReturnValue({
      pathname: '/tools/video-editor',
      search: '?project=project-1&timeline=timeline-1',
    });
    mocks.panesState = buildPanesState({
      isGenerationsPaneOpen: false,
      isGenerationsPaneLocked: true,
    });
    mocks.useSlidingPane.mockReturnValue(buildSlidingPaneState({
      isOpen: true,
      isLocked: true,
    }));
    mocks.useResolvedGalleryProject.mockReturnValue({
      projectId: 'project-1',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: null,
    });

    renderHook(() => useGenerationsPaneController());

    expect(mocks.useGalleryPageState).toHaveBeenCalledWith(expect.objectContaining({
      enableDataLoading: true,
      runtimeProjectId: 'project-1',
      runtimeAuthority: true,
    }));
  });

  it('defaults the media type to all and stores nothing until the user picks one', () => {
    const { result } = renderHook(() => useGenerationsPaneController());

    expect(result.current.filters.mediaTypeFilter).toBe('all');
    expect(mocks.useGalleryPageState).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'all' }));
    expect(sessionStorage.getItem('astrid.generationsPane.mediaType')).toBeNull();
  });

  it('restores a saved all as the media type', () => {
    sessionStorage.setItem('astrid.generationsPane.mediaType', 'all');

    const { result } = renderHook(() => useGenerationsPaneController());

    expect(result.current.filters.mediaTypeFilter).toBe('all');
    expect(mocks.useGalleryPageState).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'all' }));
  });

  it('restores a saved video as the media type', () => {
    sessionStorage.setItem('astrid.generationsPane.mediaType', 'video');

    const { result } = renderHook(() => useGenerationsPaneController());

    expect(result.current.filters.mediaTypeFilter).toBe('video');
    expect(mocks.useGalleryPageState).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'video' }));
  });

  it('ignores an unrecognised saved media type and falls back to all', () => {
    sessionStorage.setItem('astrid.generationsPane.mediaType', 'documents');

    const { result } = renderHook(() => useGenerationsPaneController());

    expect(result.current.filters.mediaTypeFilter).toBe('all');
  });

  it('never switches media type on its own when a project has no images', async () => {
    mocks.useProjectGenerations.mockImplementation(() => ({
      data: { total: 0 },
      isLoading: false,
      isFetching: false,
      error: null,
    }));

    const { result } = renderHook(() => useGenerationsPaneController());

    await waitFor(() => expect(result.current.gallery.emptyState.message).toBe('No generations yet.'));
    expect(result.current.filters.mediaTypeFilter).toBe('all');
    expect([...new Set(mocks.useGalleryPageState.mock.calls.map(([args]) => args.mediaType))]).toEqual(['all']);
    expect(mocks.useProjectGenerations).not.toHaveBeenCalled();
  });

  it('remembers an explicit media tab for the rest of the session', () => {
    const first = renderHook(() => useGenerationsPaneController());
    act(() => first.result.current.filters.setMediaTypeFilter('audio'));
    first.unmount();

    const next = renderHook(() => useGenerationsPaneController());
    expect(next.result.current.filters.mediaTypeFilter).toBe('audio');
    expect(mocks.useGalleryPageState).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'audio' }));
  });

  it('captures the selected editor recipient without changing the primary route', () => {
    const navigate = vi.fn();
    mocks.selectedEditor = { projectId: 'project-B', timelineId: 'timeline-B' };
    mocks.useLocation.mockReturnValue({
      pathname: '/tools/video-editor',
      search: '?project=project-A&timeline=timeline-A&timeline=timeline-A',
    });
    mocks.useNavigate.mockReturnValue(navigate);

    const { result } = renderHook(() => useGenerationsPaneController());
    act(() => result.current.navigation.handleAddGenerationToTimeline('generation-B'));

    const target = navigate.mock.calls[0][0];
    const params = new URLSearchParams(target.search);
    expect(target.pathname).toBe('/tools/video-editor');
    expect(params.get('project')).toBe('project-A');
    expect(params.get('timeline')).toBe('timeline-A');
    expect(params.get('addGenerationProject')).toBe('project-B');
    expect(params.get('addGenerationTimeline')).toBe('timeline-B');
  });

  it('lays out with the measured content width, without subtracting the gallery padding again', () => {
    mocks.useContainerWidth.mockReturnValue([{ current: null }, 1200]);

    renderHook(() => useGenerationsPaneController());

    // useContainerWidth reports the content box; the gallery padding is already excluded.
    expect(mocks.calculateGalleryLayout).toHaveBeenCalledWith(1.6, false, 1200, undefined, true);
  });

  describe('published content height', () => {
    const publishedHeights = () => {
      const publish = mocks.panesState.setGenerationsPaneContentHeight as unknown as Mock;
      return publish.mock.calls.map(([height]) => height);
    };
    const lastPublishedHeight = () => publishedHeights().at(-1);

    function renderWithResponse(response: { total: number; hasMore: boolean }, page = 1) {
      mocks.useGalleryPageState.mockReturnValue(buildGalleryPageState({
        generationsResponse: response,
        totalCount: response.total,
        totalIsExact: response.hasMore === false,
        page,
      }));
      return renderHook(() => useGenerationsPaneController());
    }

    beforeEach(() => {
      // Six columns and an uncapped pane, so the height is the natural row count.
      mocks.calculateGalleryLayout.mockReturnValue({ columns: 6 });
      mocks.panesState = buildPanesState({ generationsPaneHeight: 10_000, setGenerationsPaneContentHeight: vi.fn() });
    });

    it('keeps the same height on page 1 and page 2 of one set', () => {
      // Page size is 12. Page 1 of a longer set reports a look-ahead total of 13, page 2 reports 25.
      renderWithResponse({ total: 13, hasMore: true }, 1);
      const page1Height = lastPublishedHeight();
      renderWithResponse({ total: 25, hasMore: true }, 2);
      const page2Height = lastPublishedHeight();

      expect(page1Height).toBeGreaterThan(0);
      expect(page2Height).toBe(page1Height);
    });

    it('gives a five-item set a smaller height than a full set', () => {
      renderWithResponse({ total: 13, hasMore: true }, 1);
      const fullHeight = lastPublishedHeight();
      renderWithResponse({ total: 5, hasMore: false }, 1);
      const shortHeight = lastPublishedHeight();

      expect(shortHeight).toBeLessThan(fullHeight as number);
    });

    it('gives an empty set a compact height', () => {
      renderWithResponse({ total: 13, hasMore: true }, 1);
      const fullHeight = lastPublishedHeight();
      renderWithResponse({ total: 0, hasMore: false }, 1);
      const emptyHeight = lastPublishedHeight();

      expect(emptyHeight).toBeLessThan(fullHeight as number);
    });

    it('publishes null when the pane is on the image generation page', () => {
      mocks.useLocation.mockReturnValue({ pathname: '/tools/image-generation', search: '' });
      renderWithResponse({ total: 13, hasMore: true }, 1);

      expect(lastPublishedHeight()).toBeNull();
    });
  });
});
