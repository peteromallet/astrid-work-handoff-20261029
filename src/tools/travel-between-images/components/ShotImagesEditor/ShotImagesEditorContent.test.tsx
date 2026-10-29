// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorContent } from './ShotImagesEditorContent';

const captures = vi.hoisted(() => ({
  timelineProps: null as unknown,
  batchProps: null as unknown,
  timelineMediaValue: null as unknown,
  adaptedSelection: vi.fn(),
  adaptedCreation: vi.fn(),
  resolvePrimaryStructureVideo: vi.fn(),
  adaptShotSelectionOperation: vi.fn(),
  adaptShotCreationOperation: vi.fn(),
}));

vi.mock('@/shared/components/ui/card', () => ({
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock('@/shared/components/ImageGenerationForm/components/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('./components/BatchModeContent', () => ({
  BatchModeContent: (props: unknown) => {
    captures.batchProps = props;
    return <div data-testid="batch-mode-content">batch-mode</div>;
  },
}));

vi.mock('./components/UnpositionedGenerationsBanner', () => ({
  UnpositionedGenerationsBanner: ({
    count,
    onOpen,
  }: {
    count: number;
    onOpen: () => void;
  }) => (
    <button type="button" onClick={onOpen}>
      Unpositioned {count}
    </button>
  ),
}));

vi.mock('../Timeline', () => ({
  Timeline: (props: unknown) => {
    captures.timelineProps = props;
    return <div data-testid="timeline">timeline</div>;
  },
}));

vi.mock('../Timeline/TimelineMediaContext', () => ({
  TimelineMediaProvider: ({
    value,
    children,
  }: {
    value: unknown;
    children: React.ReactNode;
  }) => {
    captures.timelineMediaValue = value;
    return <div>{children}</div>;
  },
}));

vi.mock('@/shared/lib/tasks/travelBetweenImages', () => ({
  resolvePrimaryStructureVideo: (...args: unknown[]) => captures.resolvePrimaryStructureVideo(...args),
}));

vi.mock('./ShotImagesEditorSections.adapters', () => ({
  adaptShotSelectionOperation: (...args: unknown[]) => captures.adaptShotSelectionOperation(...args),
  adaptShotCreationOperation: (...args: unknown[]) => captures.adaptShotCreationOperation(...args),
}));

describe('EditorContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captures.timelineProps = null;
    captures.batchProps = null;
    captures.timelineMediaValue = null;
    captures.adaptedSelection = vi.fn();
    captures.adaptedCreation = vi.fn();
    captures.resolvePrimaryStructureVideo.mockReturnValue({ id: 'primary-structure' });
    captures.adaptShotSelectionOperation.mockReturnValue(captures.adaptedSelection);
    captures.adaptShotCreationOperation.mockReturnValue(captures.adaptedCreation);
  });

  function buildProps() {
    return {
      componentProps: {
        isModeReady: true,
        selectedShotId: 'shot-1',
        projectId: 'project-1',
        onPrimaryStructureVideoInputChange: vi.fn(),
        skeleton: <div data-testid="editor-skeleton">loading</div>,
        isMobile: false,
        generationMode: 'timeline',
        batchVideoFrames: 61,
        onImageReorder: vi.fn(),
        onFramePositionsChange: vi.fn(),
        onFileDrop: vi.fn(),
        onGenerationDrop: vi.fn(),
        onImageDelete: vi.fn(),
        onImageDuplicate: vi.fn(),
        projectAspectRatio: '16:9',
        readOnly: false,
        preloadedImages: undefined,
        defaultPrompt: 'Prompt',
        defaultNegativePrompt: 'Negative',
        onImageUpload: vi.fn(),
        isUploadingImage: false,
        uploadProgress: 0,
        allShots: [{ id: 'shot-1' }],
        onShotChange: vi.fn(),
        onAddToShot: vi.fn(),
        onAddToShotWithoutPosition: vi.fn(),
        onCreateShot: vi.fn(),
        maxFrameLimit: 90,
        selectedOutputId: 'output-1',
        onNewShotFromSelection: vi.fn(),
        unpositionedGenerationsCount: 2,
        onOpenUnpositionedPane: vi.fn(),
        onBatchImageDelete: vi.fn(),
        isMobileView: false,
        generationModeOverride: undefined,
        columns: 4,
        onBatchFileDrop: vi.fn(),
        onBatchGenerationDrop: vi.fn(),
        onSelectionChange: vi.fn(),
        structureVideos: [{ id: 'structure-1' }],
        structureGuidance: { mode: 'flow' },
        onUni3cEndPercentChange: vi.fn(),
      } as never,
      data: {
        memoizedShotGenerations: [{ id: 'shot-gen-1' }],
        positionsLoading: false,
        hasEverHadData: true,
        imagesWithBadges: [{ id: 'image-1' }],
        segmentSlots: [{ id: 'slot-1' }],
        hasPendingTask: false,
        pairPrompts: ['pair prompt'],
      } as never,
      mode: {
        segmentSlot: {
          handlePairClick: vi.fn(),
          pendingImageToOpen: 'pending-image',
          pendingImageVariantId: 'variant-1',
          updatePairFrameCount: vi.fn(),
        },
        handleClearPendingImageToOpen: vi.fn(),
        navigateWithTransition: vi.fn(),
      } as never,
      callbacks: {
        handleDragStateChange: vi.fn(),
        handleReorder: vi.fn(),
        handleDelete: vi.fn(),
        runAddToShotOperation: vi.fn(),
        runAddToShotWithoutPositionOperation: vi.fn(),
        runCreateShotOperation: vi.fn(),
      } as never,
      timelineMediaValue: { currentMedia: 'media-1' } as never,
    } satisfies React.ComponentProps<typeof EditorContent>;
  }

  it('renders the timeline skeleton branch without batch guidance chrome', () => {
    const props = buildProps();

    render(
      <EditorContent
        {...props}
        componentProps={{
          ...props.componentProps,
          isModeReady: false,
          generationMode: 'timeline',
        }}
        data={{
          ...props.data,
          memoizedShotGenerations: [],
          hasEverHadData: false,
        }}
      />,
    );

    expect(screen.getByTestId('editor-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Input Images')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('batch-mode-content')).not.toBeInTheDocument();
  });

  it('renders the batch skeleton branch with guidance affordances when a primary structure handler is available', () => {
    const props = buildProps();

    render(
      <EditorContent
        {...props}
        componentProps={{
          ...props.componentProps,
          isModeReady: false,
          generationMode: 'batch',
        }}
        data={{
          ...props.data,
          memoizedShotGenerations: [],
          hasEverHadData: false,
        }}
      />,
    );

    expect(screen.getByText('Input Images')).toBeInTheDocument();
    expect(screen.getByText('Camera Guidance Video')).toBeInTheDocument();
    expect(screen.getByText('Add a motion guidance video')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBe(1);
  });

  it('renders timeline mode with adapted shot workflow callbacks and the unpositioned banner', () => {
    const props = buildProps();
    render(<EditorContent {...props} />);

    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(captures.timelineMediaValue).toEqual(props.timelineMediaValue);
    expect(captures.timelineProps).toMatchObject({
      core: expect.objectContaining({
        shotId: 'shot-1',
        projectId: 'project-1',
        frameSpacing: 61,
      }),
      shotWorkflow: expect.objectContaining({
        onAddToShot: captures.adaptedSelection,
        onAddToShotWithoutPosition: captures.adaptedSelection,
        onCreateShot: captures.adaptedCreation,
      }),
      segmentNavigation: expect.objectContaining({
        pendingImageToOpen: 'pending-image',
        pendingImageVariantId: 'variant-1',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unpositioned 2' }));
    expect(props.componentProps.onOpenUnpositionedPane).toHaveBeenCalledTimes(1);
  });

  it('renders batch mode on mobile and passes the resolved primary structure video into batch content', () => {
    const props = buildProps();

    render(
      <EditorContent
        {...props}
        componentProps={{
          ...props.componentProps,
          isMobile: true,
          generationMode: 'timeline',
        }}
      />,
    );

    expect(screen.getByTestId('batch-mode-content')).toBeInTheDocument();
    expect(captures.resolvePrimaryStructureVideo).toHaveBeenCalledWith(
      props.componentProps.structureVideos,
      props.componentProps.structureGuidance,
    );
    expect(captures.batchProps).toMatchObject({
      batchConfig: expect.objectContaining({
        selectedShotId: 'shot-1',
        generationMode: 'timeline',
        projectAspectRatio: '16:9',
      }),
      generationState: expect.objectContaining({
        primaryStructureVideo: { id: 'primary-structure' },
        unpositionedGenerationsCount: 2,
      }),
      uiOptions: expect.objectContaining({
        onAddToShot: captures.adaptedSelection,
        onAddToShotWithoutPosition: captures.adaptedSelection,
        onCreateShot: captures.adaptedCreation,
      }),
    });
  });
});
