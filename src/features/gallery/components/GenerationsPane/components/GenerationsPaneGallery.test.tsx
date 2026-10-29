// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GenerationsPaneGallery } from './GenerationsPaneGallery';
import { useGenerationTaskDetails } from '@/shared/components/TaskDetails/hooks/useGenerationTaskDetails';
import { useRuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import { resetProjectSelectionStoreForTests, setProjectSelectionSnapshot } from '@/shared/contexts/projectSelectionStore';

const mocks = vi.hoisted(() => ({
  MediaGallery: vi.fn(() => <div data-testid="media-gallery" />),
  runtimeGetGeneration: vi.fn(),
  runtimeGetTask: vi.fn(),
  legacyGalleryGet: vi.fn(),
  legacyFetchTask: vi.fn(),
  SkeletonGallery: vi.fn(() => <div data-testid="skeleton-gallery" />),
  SelectionContextMenu: vi.fn(({
    position,
    onOpenGenerateVideo,
    existingShots,
  }: {
    position: { x: number; y: number } | null;
    onOpenGenerateVideo: (shot: { id: string; name: string }) => void;
    existingShots?: Array<{ id: string; name: string }>;
  }) => (
    position ? (
      <div data-testid="selection-context-menu">
        {(existingShots ?? []).map((shot) => (
          <button key={shot.id} type="button" onClick={() => onOpenGenerateVideo(shot)}>
            Generate Video
          </button>
        ))}
      </div>
    ) : null
  )),
  VideoGenerationModal: vi.fn(({ shot }: { shot: { name: string } }) => (
    <div data-testid="video-generation-modal">{shot.name}</div>
  )),
  useGallerySelection: vi.fn(),
  userSelectGalleryItem: vi.fn(),
  userSelectGalleryItems: vi.fn(),
  useShots: vi.fn(),
  useShotNavigation: vi.fn(),
  useLassoSelection: vi.fn(),
}));

vi.mock('@/integrations/runtime/client', () => ({
  AstridRuntimeClient: class MockAstridRuntimeClient {
    getGeneration(generationId: string) { return mocks.runtimeGetGeneration(generationId); }
    getTask(taskId: string) { return mocks.runtimeGetTask(taskId); }
  },
}));

vi.mock('@/integrations/astrid/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/astrid/client')>();
  return {
    ...actual,
    AstridLocalClient: class MockAstridLocalClient {
      gallery = { get: (generationId: string) => mocks.legacyGalleryGet(generationId) };
    },
  };
});

vi.mock('@/integrations/astrid/repositories/taskRepository', () => ({
  fetchTaskInProject: mocks.legacyFetchTask,
}));

function GalleryTaskDetailsProbe() {
  const authority = useRuntimeAuthority();
  const details = useGenerationTaskDetails({
    generationId: '11111111-1111-4111-8111-111111111111',
    projectId: 'runtime-project-42',
  });
  return (
    <div
      data-testid="gallery-task-details"
      data-status={details.taskDetailsData?.status ?? ''}
      data-error={details.taskError?.message ?? ''}
      data-authority-project={authority.runtimeProjectId ?? ''}
      data-authority={String(authority.runtimeAuthority)}
    >
      {String(details.task?.params?.prompt ?? '')}
    </div>
  );
}

vi.mock('@/shared/components/MediaGallery', async () => {
  const { useRuntimeAuthority } = await import('@/app/runtime/runtimeAuthority');
  function GalleryAuthorityProbe() {
    const authority = useRuntimeAuthority();
    return <div data-testid="gallery-authority" data-project-id={authority.runtimeProjectId ?? ''} />;
  }
  return {
    MediaGallery: (props: unknown) => <>{mocks.MediaGallery(props)}<GalleryAuthorityProbe /></>,
  };
});

vi.mock('@/shared/components/SelectionContextMenu', () => ({
  SelectionContextMenu: (props: unknown) => mocks.SelectionContextMenu(props),
}));

vi.mock('@/shared/components/ui/composed/skeleton-gallery', () => ({
  SkeletonGallery: (props: unknown) => mocks.SkeletonGallery(props),
}));

vi.mock('@/shared/state/selectionStore', () => ({
  useGallerySelection: () => mocks.useGallerySelection(),
  userSelectGalleryItem: (...args: unknown[]) => mocks.userSelectGalleryItem(...args),
  userSelectGalleryItems: (...args: unknown[]) => mocks.userSelectGalleryItems(...args),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: () => mocks.useShots(),
}));

vi.mock('@/shared/hooks/shots/useShotNavigation', () => ({
  useShotNavigation: () => mocks.useShotNavigation(),
}));

vi.mock('@/tools/travel-between-images/components/VideoGenerationModal', () => ({
  VideoGenerationModal: (props: unknown) => mocks.VideoGenerationModal(props),
}));

vi.mock('../hooks/useLassoSelection', () => ({
  useLassoSelection: (props: unknown) => mocks.useLassoSelection(props),
}));

function buildProps(overrides: Partial<ComponentProps<typeof GenerationsPaneGallery>> = {}) {
  return {
    containerRef: { current: null },
    projectAspectRatio: '16:9',
    layout: { cols: 3, rows: 4, itemsPerPage: 12 },
    loading: { isLoading: false },
    pagination: { page: 2, totalCount: 25 },
    error: null,
    gallery: {
      runtimeProjectId: null,
      runtimeAuthority: false,
      items: [],
      allShots: [],
      lastShotId: undefined,
      filters: { sortBy: 'newest' } as never,
      onFiltersChange: vi.fn(),
      onAddToShot: vi.fn(async () => false),
      onAddToShotWithoutPosition: vi.fn(async () => false),
      onServerPageChange: vi.fn(),
      generationFilters: undefined,
      currentViewingShotId: undefined,
      emptyState: { message: 'No generations yet.' },
    },
    ...overrides,
  };
}

describe('GenerationsPaneGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MediaGallery.mockImplementation(() => <div data-testid="media-gallery" />);

    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['g2']),
      gallerySelectionMap: new Map([
        ['g2', { url: 'https://example.com/2.mp4', mediaType: 'video', generationId: 'gen-2' }],
      ]),
    });
    mocks.useShots.mockReturnValue({ shots: [{ id: 'shot-9', name: 'Shot 9' }] });
    mocks.useShotNavigation.mockReturnValue({
      navigateToShot: vi.fn(),
    });
    mocks.useLassoSelection.mockReturnValue({
      selectionRect: null,
      handleMouseDown: vi.fn(),
    });
  });

  it('passes resolved Runtime authority into the lightbox subtree for local project selectors', () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=desert-plant-growth');
    render(<GenerationsPaneGallery {...buildProps({
      gallery: {
        ...buildProps().gallery,
        runtimeProjectId: 'runtime-project-42',
        runtimeAuthority: true,
        items: [{ id: 'runtime-generation', url: 'http://runtime.local/media', type: 'image/png' }],
      },
    })} />);

    expect(screen.getByTestId('gallery-authority')).toHaveAttribute('data-project-id', 'runtime-project-42');
  });

  it('uses Runtime generation and task routes for canonical project selection', async () => {
    window.history.replaceState({}, '', '/tools/video-editor?project=runtime-project-42');
    const generationId = '11111111-1111-4111-8111-111111111111';
    resetProjectSelectionStoreForTests();
    setProjectSelectionSnapshot({ selectedProjectId: 'legacy-selected-project' });
    mocks.runtimeGetGeneration.mockResolvedValue({
      generation_id: generationId,
      project_id: 'runtime-project-42',
      source_task_id: 'runtime-task-1',
    });
    mocks.runtimeGetTask.mockResolvedValue({
      task_id: 'runtime-task-1',
      project_id: 'runtime-project-42',
      state: 'succeeded',
      spec: { family: 'image_generation', params: { prompt: 'runtime image prompt' } },
      created_at: '2026-10-19T00:00:00Z',
      updated_at: '2026-10-19T00:00:00Z',
    });
    mocks.legacyFetchTask.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.MediaGallery.mockImplementation(() => <><div data-testid="media-gallery" /><GalleryTaskDetailsProbe /></>);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerationsPaneGallery {...buildProps({
          gallery: {
            ...buildProps().gallery,
            runtimeProjectId: 'runtime-project-42',
            runtimeAuthority: true,
            items: [{ id: generationId, url: 'http://runtime.local/media', type: 'image/png' }],
          },
        })} />
      </QueryClientProvider>,
    );

    const taskDetails = await screen.findByTestId('gallery-task-details');
    expect(taskDetails).toHaveAttribute('data-authority', 'true');
    expect(taskDetails).toHaveAttribute('data-authority-project', 'runtime-project-42');
    await waitFor(() => expect(mocks.runtimeGetGeneration).toHaveBeenCalledWith(generationId));
    await waitFor(() => expect(taskDetails).toHaveTextContent('runtime image prompt'));
    expect(taskDetails).toHaveAttribute('data-status', 'ok');
    expect(taskDetails).toHaveAttribute('data-error', '');
    expect(mocks.runtimeGetGeneration).toHaveBeenCalledWith(generationId);
    expect(mocks.runtimeGetTask).toHaveBeenCalledWith('runtime-task-1');
    expect(mocks.legacyGalleryGet).not.toHaveBeenCalled();
    expect(mocks.legacyFetchTask).not.toHaveBeenCalled();
  });

  it('renders a loading skeleton with one tile per grid cell when loading and no items exist', () => {
    render(
      <GenerationsPaneGallery
        {...buildProps({
          layout: { cols: 3, rows: 2, itemsPerPage: 6 },
          loading: { isLoading: true },
        })}
      />,
    );

    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(mocks.SkeletonGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 6,
        fixedColumns: 3,
        projectAspectRatio: '16:9',
      }),
    );
  });

  it('renders media gallery with mapped pagination props when items are present', () => {
    const gallery = buildProps().gallery;
    const items = [
      { id: 'g1', url: 'https://example.com/1.png', type: 'image/png' },
      { id: 'g2', url: 'https://example.com/2.mp4', isVideo: true, generation_id: 'gen-2' },
    ];

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...gallery, items } as never,
        })}
      />,
    );

    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        images: items,
        selectedIds: new Set(['g2']),
        config: expect.objectContaining({
          enableSingleClick: true,
        }),
        pagination: expect.objectContaining({
          offset: 12,
          totalCount: 25,
          itemsPerPage: 12,
        }),
      }),
    );
  });

  it('selects a single gallery item on single click', () => {
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(),
      gallerySelectionMap: new Map(),
    });

    const image = {
      id: 'g1',
      url: 'https://example.com/1.png',
      type: 'image/png',
      generation_id: 'gen-1',
    };

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items: [image] } as never,
        })}
      />,
    );

    const mediaGalleryProps = mocks.MediaGallery.mock.calls[0]?.[0];
    mediaGalleryProps.onImageClick(image);

    expect(mocks.userSelectGalleryItem).toHaveBeenCalledWith(
      {
        id: 'g1',
        url: 'https://example.com/1.png',
        type: 'image/png',
        generationId: 'gen-1',
      },
      { additive: false },
    );
  });

  it('toggles selection on modifier-assisted click and renders lasso overlay', () => {
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['g1']),
      gallerySelectionMap: new Map([
        ['g1', { url: 'https://example.com/1.png', mediaType: 'video', generationId: 'g1' }],
      ]),
    });
    mocks.useLassoSelection.mockReturnValue({
      selectionRect: {
        left: 10,
        top: 20,
        width: 30,
        height: 40,
      },
      handleMouseDown: vi.fn(),
    });

    const image = {
      id: 'g1',
      url: 'https://example.com/1.png',
      isVideo: true,
    };

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items: [image] } as never,
        })}
      />,
    );

    expect(document.querySelector('.border-sky-400.bg-sky-400\\/10')).toBeInTheDocument();

    const mediaGalleryProps = mocks.MediaGallery.mock.calls[0]?.[0];
    mediaGalleryProps.onImageClick(image, { multiSelect: true });

    expect(mocks.userSelectGalleryItem).toHaveBeenCalledWith(
      {
        id: 'g1',
        url: 'https://example.com/1.png',
        type: 'video/mp4',
        generationId: 'g1',
      },
      { additive: true },
    );
  });

  it('selects an unselected item before opening the context menu', () => {
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(),
      gallerySelectionMap: new Map(),
    });

    const image = {
      id: 'g1',
      url: 'https://example.com/1.png',
      type: 'image/png',
      generation_id: 'gen-1',
    };

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items: [image] } as never,
        })}
      />,
    );

    const mediaGalleryProps = mocks.MediaGallery.mock.calls[0]?.[0];
    act(() => {
      mediaGalleryProps.onContextMenu({
        preventDefault: vi.fn(),
        clientX: 20,
        clientY: 30,
      }, image);
    });

    expect(mocks.userSelectGalleryItem).toHaveBeenCalledWith({
      id: 'g1',
      url: 'https://example.com/1.png',
      type: 'image/png',
      generationId: 'gen-1',
    }, { additive: false });
    expect(screen.getByTestId('selection-context-menu')).toBeInTheDocument();
  });

  it('opens the video generation modal for an existing shot that holds the selection', async () => {
    mocks.useShots.mockReturnValue({
      shots: [{
        id: 'shot-9',
        name: 'Shot 9',
        images: [{ generation_id: 'gen-1' }],
      }],
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['g1']),
      gallerySelectionMap: new Map([
        ['g1', { url: 'https://example.com/1.png', mediaType: 'image', generationId: 'gen-1' }],
      ]),
    });

    const image = {
      id: 'g1',
      url: 'https://example.com/1.png',
      type: 'image/png',
      generation_id: 'gen-1',
    };

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items: [image] } as never,
        })}
      />,
    );

    const mediaGalleryProps = mocks.MediaGallery.mock.calls[0]?.[0];
    act(() => {
      mediaGalleryProps.onContextMenu({
        preventDefault: vi.fn(),
        clientX: 20,
        clientY: 30,
      }, image);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Video' }));

    await waitFor(() => {
      expect(screen.getByTestId('video-generation-modal')).toHaveTextContent('Shot 9');
    });
  });

  it('shows a failed gallery read without claiming the project has no generations', () => {
    render(
      <GenerationsPaneGallery
        {...buildProps({
          error: new Error('failed'),
          loading: { isLoading: false },
        })}
      />,
    );

    expect(screen.getByText('Error: failed')).toBeInTheDocument();
    expect(screen.queryByText('No generations yet.')).not.toBeInTheDocument();
  });

  it('shows the empty state after a successful read with no generations', () => {
    render(<GenerationsPaneGallery {...buildProps()} />);

    expect(screen.getByText('No generations yet.')).toBeInTheDocument();
    expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
  });

  it('shows the empty state message and a Show everything action that calls the handler', () => {
    const onShowEverything = vi.fn();
    render(<GenerationsPaneGallery {...buildProps({
      gallery: {
        ...buildProps().gallery,
        emptyState: { message: 'No videos in this shot', onShowEverything },
      },
    })} />);

    expect(screen.getByText('No videos in this shot')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(onShowEverything).toHaveBeenCalledTimes(1);
  });

  it('hides the Show everything action when the empty state has no handler', () => {
    render(<GenerationsPaneGallery {...buildProps()} />);

    expect(screen.getByText('No generations yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show everything' })).not.toBeInTheDocument();
  });

  it('passes only full-match existing shots to the selection context menu using gallery selection generation ids', () => {
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['gallery-item-1', 'gallery-item-2']),
      gallerySelectionMap: new Map([
        ['gallery-item-1', { url: 'https://example.com/1.png', mediaType: 'image', generationId: 'gen-1' }],
        ['gallery-item-2', { url: 'https://example.com/2.png', mediaType: 'image', generationId: 'gen-2' }],
      ]),
    });
    mocks.useShots.mockReturnValue({
      shots: [
        {
          id: 'shot-full',
          name: 'Full Match',
          images: [
            { id: 'sg-1', generation_id: 'gen-1' },
            { id: 'sg-2', generation_id: 'gen-2' },
          ],
        },
        {
          id: 'shot-partial',
          name: 'Partial Match',
          images: [{ id: 'sg-3', generation_id: 'gen-1' }],
        },
        {
          id: 'shot-wrong-source',
          name: 'Wrong Source',
          images: [
            { id: 'sg-4', generation_id: 'gallery-item-1' },
            { id: 'sg-5', generation_id: 'gallery-item-2' },
          ],
        },
      ],
    });

    render(<GenerationsPaneGallery {...buildProps()} />);

    expect(mocks.SelectionContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        existingShots: [
          expect.objectContaining({ id: 'shot-full', name: 'Full Match' }),
        ],
      }),
    );
  });

  it('shows no bar button after selection and passes the timeline add to the tiles', () => {
    const onAddGenerationToTimeline = vi.fn();
    const items = [{ id: 'g2', url: 'https://example.com/2.mp4', isVideo: true, generation_id: 'gen-2' }];

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items, onAddGenerationToTimeline } as never,
        })}
      />,
    );

    expect(screen.queryByTestId('add-selected-generation-to-timeline')).not.toBeInTheDocument();
    expect(screen.queryByText('Add selected to timeline')).not.toBeInTheDocument();
    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({ onAddToTimeline: onAddGenerationToTimeline, addToTimelineDisabledReason: undefined }),
    );
  });

  it('gives the tiles the mismatch reason when the selected editor is another project', () => {
    const items = [{ id: 'g2', url: 'https://example.com/2.mp4', isVideo: true, generation_id: 'gen-2' }];

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: {
            ...buildProps().gallery,
            items,
            onAddGenerationToTimeline: vi.fn(),
            addTargetProjectMismatch: true,
          } as never,
        })}
      />,
    );

    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        addToTimelineDisabledReason: "This gallery's project is not the selected editor's project",
      }),
    );
  });

  it('offers the context menu timeline item only for a single selected item, adding that generation', () => {
    const onAddGenerationToTimeline = vi.fn();
    const items = [{ id: 'g2', url: 'https://example.com/2.mp4', isVideo: true, generation_id: 'gen-2' }];

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items, onAddGenerationToTimeline } as never,
        })}
      />,
    );
    const menuProps = mocks.SelectionContextMenu.mock.calls.at(-1)?.[0] as { onAddToTimeline?: () => void };
    expect(menuProps.onAddToTimeline).toBeTypeOf('function');
    menuProps.onAddToTimeline?.();
    expect(onAddGenerationToTimeline).toHaveBeenCalledWith('gen-2');
  });

  it('withholds the context menu timeline item when several items are selected', () => {
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['g1', 'g2']),
      gallerySelectionMap: new Map([
        ['g1', { url: 'https://example.com/1.png', mediaType: 'image', generationId: 'gen-1' }],
        ['g2', { url: 'https://example.com/2.png', mediaType: 'image', generationId: 'gen-2' }],
      ]),
    });
    const items = [
      { id: 'g1', url: 'https://example.com/1.png', type: 'image/png', generation_id: 'gen-1' },
      { id: 'g2', url: 'https://example.com/2.png', type: 'image/png', generation_id: 'gen-2' },
    ];

    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...buildProps().gallery, items, onAddGenerationToTimeline: vi.fn() } as never,
        })}
      />,
    );

    const menuProps = mocks.SelectionContextMenu.mock.calls.at(-1)?.[0] as { onAddToTimeline?: () => void };
    expect(menuProps.onAddToTimeline).toBeUndefined();
  });
});
