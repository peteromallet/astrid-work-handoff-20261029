// @vitest-environment jsdom

import { isValidElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVideoLightboxRenderModel } from './useVideoLightboxRenderModel';

const routerWrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const mocks = vi.hoisted(() => ({
  handleDownload: vi.fn(),
  handleDelete: vi.fn(),
  handleNavigateToShotFromSelector: vi.fn(),
  buildVideoLightboxLayoutState: vi.fn(),
  MockInfoPanel: vi.fn(() => null),
}));

vi.mock('./useVideoLightboxActions', () => ({
  useVideoLightboxActions: () => ({
    handleDownload: mocks.handleDownload,
    handleDelete: mocks.handleDelete,
    handleNavigateToShotFromSelector: mocks.handleNavigateToShotFromSelector,
  }),
}));

vi.mock('../../model/buildVideoLightboxLayoutState', () => ({
  buildVideoLightboxLayoutState: (...args: unknown[]) => mocks.buildVideoLightboxLayoutState(...args),
}));

vi.mock('../../components/InfoPanel', () => ({
  InfoPanel: mocks.MockInfoPanel,
}));

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    media: { id: 'video-123456789', source_task_id: 'task-1', thumbUrl: 'thumb.jpg', timeline_frame: 0 },
    onClose: vi.fn(),
    readOnly: false,
    adjacentSegments: undefined,
    shotId: 'shot-1',
    onOpenExternalGeneration: vi.fn(),
    showTickForImageId: undefined,
    showTickForSecondaryImageId: undefined,
    actions: undefined,
    shotWorkflow: undefined,
    navigation: { showNavigation: true },
    features: undefined,
    ...overrides,
  } as never;
}

function createModeModel(overrides: Record<string, unknown> = {}) {
  return {
    isSegmentSlotMode: false,
    hasSegmentVideo: false,
    isFormOnlyMode: false,
    hasNext: true,
    hasPrevious: false,
    handleSlotNavNext: vi.fn(),
    handleSlotNavPrev: vi.fn(),
    ...overrides,
  } as never;
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    isMobile: false,
    selectedProjectId: 'project-1',
    actualGenerationId: 'gen-1',
    imageDimensions: { width: 1920, height: 1080 },
    setImageDimensions: vi.fn(),
    variantsSectionRef: { current: null },
    effectiveTasksPaneOpen: false,
    effectiveTasksPaneWidth: 300,
    isTasksPaneLocked: false,
    contentRef: { current: null },
    ...overrides,
  } as never;
}

function createSharedState(overrides: Record<string, unknown> = {}) {
  return {
    variants: {
      list: [{ id: 'variant-1' }],
      activeVariant: { id: 'variant-1' },
      primaryVariant: { id: 'variant-1' },
      isLoading: false,
      setActiveVariantId: vi.fn(),
      setPrimaryVariant: vi.fn(),
      deleteVariant: vi.fn(),
      promoteSuccess: false,
      isPromoting: false,
      handlePromoteToGeneration: vi.fn(),
      handleAddVariantAsNewGenerationToShot: vi.fn(),
    },
    makeMainVariant: { isMaking: false, canMake: true, handle: vi.fn() },
    effectiveMedia: {
      mediaUrl: 'https://cdn.example.com/poster.png',
      videoUrl: 'https://cdn.example.com/video.mp4',
      imageDimensions: { width: 1920, height: 1080 },
    },
    layout: { isTabletOrLarger: true, isPortraitMode: false, shouldShowSidePanel: true },
    navigation: { swipeNavigation: { swipeHandlers: {}, isSwiping: false, swipeOffset: 0 } },
    lineage: {
      derivedItems: [], derivedGenerations: [], paginatedDerived: [], derivedPage: 1,
      derivedTotalPages: 1, setDerivedPage: vi.fn(),
    },
    buttonGroupProps: { bottomLeft: {}, bottomRight: {}, topRight: {} },
    shots: { isAlreadyPositionedInSelectedShot: false, isAlreadyAssociatedWithoutPosition: false },
    ...overrides,
  } as never;
}

function createInfoModel(overrides: Record<string, unknown> = {}) {
  return {
    variantBadges: {
      pendingTaskCount: 3,
      unviewedVariantCount: 1,
      handleMarkAllViewed: vi.fn(),
    },
    adjustedTaskDetailsData: { taskId: 'adjusted-task' },
    ...overrides,
  } as never;
}

describe('useVideoLightboxRenderModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanel: true,
      showPanel: true,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'desktop' as const,
    });
  });

  it('maps variant badges and navigation into lightbox state', () => {
    const handleMarkAllViewed = vi.fn();
    const infoModel = createInfoModel({
      variantBadges: { pendingTaskCount: 3, unviewedVariantCount: 2, handleMarkAllViewed },
    });
    const modeModel = createModeModel({ hasNext: true, hasPrevious: false });
    const { result } = renderHook(() => useVideoLightboxRenderModel(
      createProps(), modeModel, createEnv(), createSharedState(), infoModel,
    ), { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.variants.pendingTaskCount).toBe(3);
    expect(result.current.lightboxStateValue.variants.unviewedVariantCount).toBe(2);
    result.current.lightboxStateValue.variants.onMarkAllViewed();
    expect(handleMarkAllViewed).toHaveBeenCalledOnce();
    expect(result.current.lightboxStateValue.navigation.hasNext).toBe(true);
    expect(result.current.lightboxStateValue.navigation.hasPrevious).toBe(false);
  });

  it('renders only InfoPanel for the visible task panel and passes adjusted details', () => {
    const taskDetailsData = { taskId: 'adjusted-task' };
    const { result } = renderHook(() => useVideoLightboxRenderModel(
      createProps(), createModeModel(), createEnv(), createSharedState(),
      createInfoModel({ adjustedTaskDetailsData: taskDetailsData }),
    ), { wrapper: routerWrapper });

    const panel = result.current.controlsPanelContent;
    expect(isValidElement(panel)).toBe(true);
    if (isValidElement(panel)) {
      expect(panel.type).toBe(mocks.MockInfoPanel);
      expect(panel.props.taskPanel.taskDetailsData).toBe(taskDetailsData);
    }
  });

  it('preserves default task details visibility and never supplies edit settings', () => {
    renderHook(() => useVideoLightboxRenderModel(
      createProps({ features: undefined }), createModeModel(), createEnv(),
      createSharedState({ layout: { isTabletOrLarger: false, isPortraitMode: false, shouldShowSidePanel: false } }),
      createInfoModel(),
    ), { wrapper: routerWrapper });

    expect(mocks.buildVideoLightboxLayoutState).toHaveBeenCalledWith(expect.objectContaining({
      showTaskDetails: true,
    }));
    expect(mocks.buildVideoLightboxLayoutState.mock.calls[0][0]).not.toHaveProperty('isAnyVideoEditMode');
  });

  it('never supplies variant settings or source-image loaders', () => {
    const { result } = renderHook(() => useVideoLightboxRenderModel(
      createProps(), createModeModel(), createEnv(), createSharedState(), createInfoModel(),
    ), { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.variants).not.toHaveProperty('onLoadVariantSettings');
    expect(result.current.lightboxStateValue.variants).not.toHaveProperty('onLoadVariantImages');
    expect(result.current.lightboxStateValue.variants).not.toHaveProperty('currentSegmentImages');
  });

  it('returns no panel when the layout hides it', () => {
    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanel: false,
      showPanel: false,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'mobile',
    });

    const { result } = renderHook(() => useVideoLightboxRenderModel(
      createProps(), createModeModel(), createEnv(), createSharedState(), createInfoModel(),
    ), { wrapper: routerWrapper });

    expect(result.current.controlsPanelContent).toBeUndefined();
  });
});
